import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { validPath, validateManifest, hashPattern, idPattern } from '../../../sync-server/protocol.mjs';
import type { FileSyncPreferences, FileSyncStatus, SyncEntry, SyncManifest, SyncOperation } from '../contracts/fileSync.js';
import { resolveVaultPath, vaultPathKey } from './vaultFile.js';
import { hashFile, writeFileFromSource } from './textFile.js';
import { atomicSyncJson, fileSignature, stageLocalFile, stageSyncBlob, withSyncLock } from './syncStorage.js';
import { OrderedSyncTransport, SyncHttpError } from './syncTransport.js';
import { mergeReview } from '@shale/markdown-core';
import { decodeText, describeChange, textExtension, type DiffBlock } from './syncMerge.js';
import { groupIncoming, planSyncPath, indexRelatedPaths } from './fileSyncGroups.js';
import { discoveryReset, nextDiscoveryPage, selectDiscovery } from './syncDiscovery.js';
import { downloadSyncBlob, uploadSyncBlob } from './syncTransfer.js';

const hash = z.string().regex(hashPattern);
const identifier = z.string().regex(idPattern);
const entry = z.object({ hash: hash.nullable(), version: z.number().int().positive().safe() });
const change = z.object({ path: z.string().refine(validPath), hash: hash.nullable(), expectedVersion: z.number().int().nonnegative().safe() });
// `content` is the bytes to publish when they differ from the acknowledged remote entry (a merge result).
const incoming = z.object({ path: z.string().refine(validPath), expected: hash.nullable(), entry,
  previousHash: hash.nullable().optional(), content: hash.optional(), ready: z.boolean().optional() });
const revisionNumber = z.number().int().nonnegative().safe();
const discoveryFiles = z.object({ revision: revisionNumber, files: z.record(entry) });
const checkpoint = z.object({
  version: z.literal(1), root: z.string(), deviceId: identifier, workspaceId: identifier.nullable(), revision: revisionNumber,
  queuedThrough: revisionNumber.default(0),
  remoteSnapshot: discoveryFiles.optional(),
  discovery: discoveryFiles.extend({ since: revisionNumber.nullable(), cursor: z.string().min(1).max(4096) }).optional(),
  base: z.record(entry), cache: z.record(z.object({ signature: z.string(), hash })), lastSuccess: z.string().nullable(),
  lastProgress: z.string().nullable().default(null),
  outbox: z.object({ workspaceId: identifier, deviceId: identifier, operationId: identifier, changes: z.array(change).min(1).max(20000) }).optional(),
  incoming: z.array(incoming).optional(),
  conflict: z.object({ id: identifier, changes: z.array(incoming), local: z.record(hash.nullable()), branches: z.array(z.string()) }).optional(),
});
type Checkpoint = z.infer<typeof checkpoint>;
/** 'merged' keeps the current local file (a reviewed mix of both versions) on top of the remote base. */
export type ConflictChoice = 'local' | 'remote' | 'recheck' | Record<string, 'local' | 'remote' | 'merged'>;
type Incoming = z.infer<typeof incoming>;
/** The editing gate refused publication for now (an unsaved editor, a write in flight); not a data error. */
const gateBusy = (error: unknown) => (error as { status?: number })?.status === 409;
export type ConflictSnapshot = { id: string; files: { path: string; local: string | null; remote: string | null }[] };
export type Resolution = { at: string; path: string; kind: 'fast-forward' | 'deleted' | 'merged'; local: string | null;
  remote: string | null; content: string | null; recovery: string | null };
export type ConflictFile = {
  path: string; conflictId: string; relatedPaths?: string[]; localText: string | null; remoteText: string | null; action: 'add' | 'delete' | 'modify'; hasBase: boolean; localChanged: boolean; remoteChanged: boolean;
  localSize: number | null; remoteSize: number | null; image: boolean; text: boolean; diff: DiffBlock[] | null; truncated: boolean;
};
const imagePattern = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;
type Hooks = {
  publish<T>(work: (blocked?: ReadonlySet<string>) => Promise<T>, paths: string[]): Promise<T>;
  changed(relative: string, deleted: boolean): Promise<void>;
  conflict?(snapshot: ConflictSnapshot): Promise<string[]>;
};

export class FileSyncEngine {
  private state!: Checkpoint;
  private loaded = false;
  private scanned = false;
  private files = new Map<string, string>();
  private dirty = new Set<string>();
  private running: Promise<FileSyncStatus> | null = null;
  private snapshot: FileSyncStatus;
  private readonly blobs: string;
  private readonly filename: string;
  private resolutions: Resolution[] = [];
  private lastCachePrune = 0;

  constructor(readonly root: string, readonly directory: string, readonly preferences: FileSyncPreferences, private readonly hooks: Hooks) {
    this.root = path.resolve(root);
    this.blobs = path.join(directory, 'blobs'); this.filename = path.join(directory, 'checkpoint.json');
    this.snapshot = { enabled: preferences.enabled, endpoints: [...preferences.endpoints], hasToken: !!preferences.token,
      activeEndpoint: null, phase: preferences.enabled ? 'idle' : 'disabled', message: '', lastSuccess: null, conflictDirectory: null, conflictBranches: [],
      conflictCount: 0, recentResolutions: [] };
  }

  status(): FileSyncStatus {
    return { ...this.snapshot, endpoints: [...this.snapshot.endpoints], conflictBranches: [...this.snapshot.conflictBranches],
      seen: this.state?.revision ?? 0, queuedThrough: this.state?.queuedThrough ?? 0,
      pendingIncoming: this.state?.incoming?.length ?? 0, pendingOutgoing: this.state?.outbox?.changes.length ?? 0,
      lastProgress: this.state?.lastProgress ?? null,
      recentResolutions: this.resolutions.slice(-20).reverse().map(({ at, path: name, kind }) => ({ at, path: name, kind })) };
  }
  get busy(): boolean { return this.running !== null; }
  noteChanged(relative: string): void { this.dirty.add(relative); }

  async load(): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(this.directory, { recursive: true });
    try { this.state = checkpoint.parse(JSON.parse(await fs.readFile(this.filename, 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('同步检查点损坏，已停止；请保留恢复目录');
      this.state = { version: 1, root: vaultPathKey(this.root), deviceId: randomUUID(), workspaceId: null,
        revision: 0, queuedThrough: 0, base: {}, cache: {}, lastSuccess: null, lastProgress: null };
    }
    if (this.state.root !== vaultPathKey(this.root)) throw new Error('同步检查点属于另一个 Vault');
    // `revision` is only the newest server revision seen (the rollback watermark). Every base entry came from a
    // server manifest or receipt, so an entry newer than the watermark (written by builds that resolved part of a
    // conflict without recording the revision) proves the server reached it: raise the watermark, never brick.
    for (const entry of Object.values(this.state.base)) this.state.revision = Math.max(this.state.revision, entry.version);
    if (this.state.queuedThrough > this.state.revision) throw new Error('同步检查点的入队版本无效');
    if (this.state.workspaceId) validateManifest({ workspaceId: this.state.workspaceId, revision: this.state.revision, files: this.state.base });
    for (const progress of [this.state.remoteSnapshot, this.state.discovery]) {
      if (!progress) continue;
      validateManifest({ ...progress, workspaceId: this.state.workspaceId });
      if (progress.revision > this.state.revision) throw new Error('同步检查点的远端快照版本无效');
    }
    if (this.state.discovery?.since != null && this.state.discovery.since !== this.state.remoteSnapshot?.revision)
      throw new Error('同步增量的基准快照已丢失');
    if (Object.keys(this.state.cache).some(name => !validPath(name)) || Object.keys(this.state.conflict?.local ?? {}).some(name => !validPath(name)))
      throw new Error('同步检查点包含无效路径');
    this.state.base = Object.assign(Object.create(null), this.state.base);
    this.state.cache = Object.assign(Object.create(null), this.state.cache);
    try { this.resolutions = JSON.parse(await fs.readFile(path.join(this.directory, 'resolutions.json'), 'utf8')); }
    catch { this.resolutions = []; }
    if (!Array.isArray(this.resolutions)) this.resolutions = [];
    this.loaded = true;
    this.snapshot.lastSuccess = this.state.lastSuccess;
    if (this.state.conflict) this.setConflictStatus();
  }

  async recover(): Promise<void> {
    if (!this.preferences.enabled) return;
    await withSyncLock(this.directory, async () => {
      await this.load();
      if (this.state.incoming?.length) { await this.validateRoot(); await this.applyIncoming(); }
    });
  }

  run(): Promise<FileSyncStatus> {
    if (this.running) return this.running;
    this.running = withSyncLock(this.directory, () => this.pass()).catch(error => {
      this.snapshot.phase = this.state?.incoming?.length ? 'recovery' : 'error';
      this.snapshot.message = error instanceof Error ? error.message : '同步失败，本机文件已保留';
      return this.status();
    }).finally(() => { this.running = null; });
    return this.running;
  }

  private async pass(followUp = 0): Promise<FileSyncStatus> {
    if (!this.preferences.enabled) return this.status();
    await this.load();
    await this.validateRoot();
    this.snapshot.phase = 'syncing'; this.snapshot.message = ''; this.snapshot.activeEndpoint = null;
    // Downloads journaled by an earlier pass. When the editing gate is busy they stay journaled and are
    // retried at the end of this pass; local edits still upload meanwhile.
    try { await this.applyIncoming(); }
    catch (error) { if (!gateBusy(error)) throw error; }
    await this.scan();
    const transport = new OrderedSyncTransport(this.preferences.endpoints, this.preferences.token);
    let manifest = await this.discover(transport);
    this.snapshot.activeEndpoint = transport.selected;
    if (this.state.outbox) {
      const completed = await this.submit(transport);
      if (!completed) throw new Error('远端已有新修改，本机内容已保留，下次同步重新比较');
      manifest = await this.discover(transport);
      this.snapshot.activeEndpoint = transport.selected;
    }
    // An offline queued download can outlive the server's bounded history. Replan an
    // unapplied dependency group from the current manifest, retaining the local base/bytes.
    if (this.state.incoming?.length) {
      const superseded = new Set(groupIncoming(this.state.incoming).filter(group => group.some(item =>
        !item.ready && (manifest.files[item.path]?.version !== item.entry.version || manifest.files[item.path]?.hash !== item.entry.hash)))
        .flatMap(group => group.map(item => item.path)));
      if (superseded.size) {
        const next = { ...this.state, incoming: this.state.incoming.filter(item => !superseded.has(item.path)) };
        if (!next.incoming.length) delete (next as Checkpoint).incoming;
        await this.saveState(next);
      }
    }
    const changes: SyncOperation['changes'] = [];
    const downloads: Incoming[] = []; const conflicts: Incoming[] = [];
    const acknowledgements: Record<string, SyncEntry> = {};
    // A conflicted or still-journaled path is held back on its own; every other path keeps synchronizing.
    const held = new Map([...(this.state.incoming ?? []), ...(this.state.conflict?.changes ?? [])].map(item => [item.path, item.entry]));
    const isHeld = indexRelatedPaths(held.keys());
    let allRemoteChangesQueued = true;
    for (const name of new Set([...this.files.keys(), ...Object.keys(this.state.base), ...Object.keys(manifest.files)])) {
      const local = this.files.get(name) ?? null;
      const base = this.state.base[name];
      const remote = Object.hasOwn(manifest.files, name) ? manifest.files[name] : { hash: null, version: 0 };
      if (remote.version < (this.state.base[name]?.version ?? 0)) throw new Error('远端文件版本回退，已停止同步');
      if (this.state.base[name]?.version === remote.version && this.state.base[name].hash !== remote.hash)
        throw new Error('远端文件内容与已确认版本不一致，已停止同步');
      const blocked = isHeld(name);
      const queued = held.get(name);
      if (blocked && remote.version !== base?.version && (queued?.version !== remote.version || queued.hash !== remote.hash)) allRemoteChangesQueued = false;
      const plan = planSyncPath(base ?? null, local, remote.version ? remote : null, blocked);
      const transfer = { path: name, expected: local, previousHash: base?.hash ?? null, entry: remote };
      switch (plan.decision) {
        case 'adopt': acknowledgements[name] = remote; break;
        case 'download': downloads.push(transfer); break;
        case 'upload': changes.push({ path: name, expectedVersion: plan.expectedVersion, hash: local }); break;
        case 'conflict': conflicts.push(transfer); break;
      }
    }
    const automatic: Resolution[] = []; const unresolved: Incoming[] = [];
    const conflictsByPath = new Set(conflicts.map(item => item.path));
    for (const group of groupIncoming([...conflicts, ...downloads])) {
      if (group.length < 2 || !group.some(item => conflictsByPath.has(item.path))) continue;
      unresolved.push(...group);
    }
    const grouped = new Set(unresolved.map(item => item.path));
    const independentDownloads = downloads.filter(item => !grouped.has(item.path));
    for (const item of conflicts) {
      if (grouped.has(item.path)) continue;
      const resolved = await this.autoResolve(transport, item);
      if (resolved) { independentDownloads.push(resolved.incoming); automatic.push(resolved.record); }
      else unresolved.push(item);
    }
    if (unresolved.length) await this.retainConflicts(transport, unresolved);
    Object.assign(this.state.base, acknowledgements);
    this.state.revision = Math.max(this.state.revision, manifest.revision);
    if (allRemoteChangesQueued) this.state.queuedThrough = manifest.revision;
    if (independentDownloads.length) this.state.incoming = [...(this.state.incoming ?? []),
      ...independentDownloads.map(item => ({ ...item, ready: !!item.content || !item.entry.hash }))];
    if (changes.length) {
      if (changes.length > 20000) throw new Error('单批同步超过 20000 个文件，请分批导入');
      this.state.outbox = { workspaceId: manifest.workspaceId, deviceId: this.state.deviceId, operationId: randomUUID(), changes };
    }
    await this.persist();
    if (automatic.length) await this.recordResolutions(automatic);
    // Uploads and downloads touch disjoint paths, so uploading never waits for the local editing gate.
    if (this.state.outbox && !await this.submit(transport)) throw new Error('远端已有新修改，本机内容已保留，下次同步重新比较');
    await this.receiveIncoming(transport);
    // A merge result is now the local file on top of the remote base; the next pass uploads it.
    if ((automatic.some(item => item.kind === 'merged' && item.content !== item.remote) ||
      this.state.queuedThrough < this.state.revision && !this.state.conflict) && followUp < 2) {
      const next = await this.pass(followUp + 1);
      if (automatic.length && next.phase === 'idle') next.message = this.automaticMessage(automatic);
      this.snapshot.message = next.message; return this.status();
    }
    this.state.lastProgress = new Date().toISOString();
    if (!this.state.incoming?.length && !this.state.outbox && !this.state.conflict && this.state.queuedThrough === this.state.revision)
      this.state.lastSuccess = this.state.lastProgress;
    await this.persist();
    await this.pruneBlobCache();
    this.snapshot.lastSuccess = this.state.lastSuccess; this.snapshot.phase = 'idle';
    this.snapshot.message = automatic.length ? this.automaticMessage(automatic) : '同步完成';
    if (this.state.queuedThrough < this.state.revision) this.snapshot.message = '部分文件已同步，下一轮继续入队';
    if (this.state.conflict) {
      this.setConflictStatus();
      this.snapshot.message = `其他文件已同步；${this.state.conflict.changes.length} 个冲突文件待处理，两版均已保留`;
    }
    return this.status();
  }

  private async discover(transport: OrderedSyncTransport, restarted = false): Promise<SyncManifest> {
    const state = this.state;
    const expected = state.workspaceId ? { workspaceId: state.workspaceId, revision: state.revision } : undefined;
    const selected = await selectDiscovery(transport, expected, restarted ? null : state.remoteSnapshot?.revision ?? null,
      restarted ? undefined : state.discovery);
    const { workspaceId, revision, since, resumed, legacy } = selected;
    const partial = resumed ? state.discovery : undefined;
    if (partial && (revision !== partial.revision || since !== partial.since)) throw new Error('同步分页更换了固定快照');
    let files: SyncManifest['files'] = Object.assign(Object.create(null), partial?.files);
    const visited = new Set(partial ? [partial.cursor] : []);
    let page = selected;
    for (;;) {
      if (page.workspaceId !== workspaceId || page.revision !== revision) throw new Error('同步分页更换了固定快照');
      for (const [name, entry] of Object.entries(page.files)) {
        if (Object.hasOwn(files, name) || (since !== null && entry.version <= since)) throw new Error('同步分页条目重复或早于基准');
        files[name] = entry;
      }
      const next = { ...this.state, workspaceId, revision: Math.max(this.state.revision, revision) };
      if (!page.nextCursor) {
        if (since !== null) files = Object.assign(Object.create(null), state.remoteSnapshot!.files, files);
        const manifest = { workspaceId, revision, files };
        validateManifest(manifest);
        delete next.discovery;
        if (legacy) delete next.remoteSnapshot;
        else next.remoteSnapshot = { revision, files };
        await this.saveState(next);
        return manifest;
      }
      if (visited.has(page.nextCursor)) throw new Error('同步分页游标循环');
      visited.add(page.nextCursor);
      next.discovery = { revision, since, files, cursor: page.nextCursor };
      await this.saveState(next);
      files = Object.assign(Object.create(null), files);
      try { page = { ...page, ...(await nextDiscoveryPage(transport, since, page.nextCursor)) }; }
      catch (error) { if (!restarted && discoveryReset(error)) return this.discover(transport, true); throw error; }
    }
  }

  private automaticMessage(items: Resolution[]): string {
    const count = (kind: Resolution['kind']) => items.filter(item => item.kind === kind).length;
    const parts = [['merged', '合并'], ['fast-forward', '更新为服务器版本'], ['deleted', '按服务器删除']] as const;
    return `同步完成，自动处理 ${items.length} 个文件（${parts.filter(([kind]) => count(kind)).map(([kind, label]) => `${label} ${count(kind)}`).join('，')}），本机原版已保留`;
  }

  private async blobText(transport: OrderedSyncTransport, digest: string | null): Promise<string | null> {
    if (!digest) return '';
    await this.download(transport, digest);
    return decodeText(await fs.readFile(path.join(this.blobs, digest)));
  }

  /**
   * Resolves a two-sided difference without asking when no edit can be lost:
   * - both sides edited a text file and a line-based three-way merge against the base has no overlapping edits.
   * The local version is copied to the recovery directory first. Anything else stays a manual conflict.
   */
  private async autoResolve(transport: OrderedSyncTransport, item: Incoming): Promise<{ incoming: Incoming; record: Resolution } | null> {
    const base = this.state.base[item.path]; const local = item.expected; const remote = item.entry.hash;
    let kind: Resolution['kind'] | null = null; let content: string | undefined;
    if (base?.hash && local && remote && textExtension(item.path)) {
      let ancestor: string | null;
      try { ancestor = await this.blobText(transport, base.hash); }
      catch (error) {
        if (error instanceof SyncHttpError && error.status === 404) return null;
        throw error;
      }
      const [ours, theirs] = [await this.blobText(transport, local), await this.blobText(transport, remote)];
      if (ancestor === null || ours === null || theirs === null) return null;
      // Same line-hunk three-way merge that MCP review recovery uses.
      const merged = mergeReview(ancestor, ours, theirs);
      if (merged === null) return null;
      const bytes = Buffer.from(merged, 'utf8');
      content = await stageSyncBlob(Readable.from([bytes]), this.blobs, createHash('sha256').update(bytes).digest('hex'));
      kind = 'merged';
    }
    if (!kind) return null;
    let recovery: string | null = null;
    if (local) {
      recovery = path.join(this.directory, 'recovery', new Date().toISOString().slice(0, 10), item.path);
      await fs.mkdir(path.dirname(recovery), { recursive: true }); await fs.copyFile(path.join(this.blobs, local), recovery);
    }
    return { incoming: content && content !== remote ? { ...item, content } : item,
      record: { at: new Date().toISOString(), path: item.path, kind, local, remote, content: content ?? remote, recovery } };
  }

  private async pruneBlobCache(): Promise<void> {
    const now = Date.now(), grace = 24 * 60 * 60 * 1000;
    if (now - this.lastCachePrune < grace) return;
    this.lastCachePrune = now;
    const keep = new Set<string>();
    const add = (value?: string | null) => { if (value) keep.add(value); };
    for (const entry of Object.values(this.state.base)) add(entry.hash);
    for (const entry of Object.values(this.state.cache)) add(entry.hash);
    for (const value of this.files.values()) add(value);
    for (const change of this.state.outbox?.changes ?? []) add(change.hash);
    for (const item of [...(this.state.incoming ?? []), ...(this.state.conflict?.changes ?? [])]) {
      add(item.entry.hash); add(item.expected); add(item.previousHash); add(item.content);
    }
    for (const value of Object.values(this.state.conflict?.local ?? {})) add(value);
    for (const entry of Object.values(this.state.discovery?.files ?? {})) add(entry.hash);
    try {
      for (const file of await fs.readdir(this.blobs, { withFileTypes: true })) {
        const digest = /^([a-f0-9]{64})(?:\.part)?$/.exec(file.name)?.[1];
        if (!file.isFile() || !digest || keep.has(digest)) continue;
        const filename = path.join(this.blobs, file.name);
        if (now - (await fs.stat(filename)).mtimeMs > grace) await fs.unlink(filename);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('Sync cache cleanup failed:', (error as NodeJS.ErrnoException).code ?? 'Error');
    }
  }

  private async recordResolutions(items: Resolution[]): Promise<void> {
    this.resolutions = [...this.resolutions, ...items].slice(-500);
    await atomicSyncJson(path.join(this.directory, 'resolutions.json'), this.resolutions);
  }

  private async submit(transport: OrderedSyncTransport): Promise<boolean> {
    const operation = this.state.outbox!;
    try {
      for (const value of new Set(operation.changes.map(item => item.hash).filter((value): value is string => !!value)))
        await uploadSyncBlob(transport, value, path.join(this.blobs, value));
      const receipt = await transport.commit(operation);
      Object.assign(this.state.base, receipt.files);
      this.state.revision = Math.max(this.state.revision, receipt.revision);
      delete this.state.outbox; await this.persist();
      return true;
    } catch (error) {
      if (error instanceof SyncHttpError && error.status === 409 && (error.details as { error?: string })?.error === 'version_conflict') {
        delete this.state.outbox; await this.persist(); return false;
      }
      throw error;
    }
  }

  async validateRoot(): Promise<void> {
    if ((await fs.lstat(this.root)).isSymbolicLink()) throw new Error('不能同步符号链接或联接目录');
    for (let current = this.root;; current = path.dirname(current)) {
      for (const marker of ['.stfolder', '.stignore']) {
        try { await fs.access(path.join(current, marker)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
        throw new Error('此目录由 Syncthing 管理，请选择独立副本后启用内置同步');
      }
      if (path.dirname(current) === current) break;
    }
  }

  private async scan(): Promise<void> {
    const requested = this.scanned ? [...this.dirty] : ['']; this.dirty.clear();
    const inspect = async (relative: string): Promise<void> => {
      if (relative && relative !== '.shale' && !validPath(relative)) return;
      const absolute = relative ? await resolveVaultPath(this.root, relative, true) : this.root;
      let info;
      try { info = await fs.lstat(absolute); }
      catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        for (const name of this.files.keys()) if (name === relative || name.startsWith(`${relative}/`)) { this.files.delete(name); delete this.state.cache[name]; }
        return;
      }
      if (info.isSymbolicLink()) throw new Error('同步目录包含符号链接或联接，请移出后重试');
      if (info.isDirectory()) {
        this.files.delete(relative); delete this.state.cache[relative];
        const names = await fs.readdir(absolute);
        if (names.includes('.stfolder')) throw new Error('同步目录包含 Syncthing 管理的文件夹');
        for (const name of names) await inspect(relative ? `${relative}/${name}` : name);
        return;
      }
      if (!info.isFile()) throw new Error('同步仅支持普通文件');
      for (const name of this.files.keys()) if (name.startsWith(`${relative}/`)) { this.files.delete(name); delete this.state.cache[name]; }
      const signature = fileSignature(info);
      const previous = this.state.cache[relative];
      const cached = !this.scanned && previous?.signature === signature && await fs.access(path.join(this.blobs, previous.hash)).then(() => true, () => false);
      const digest = cached ? previous.hash : await stageLocalFile(absolute, this.blobs, signature);
      this.state.cache[relative] = { signature, hash: digest }; this.files.set(relative, digest);
    };
    try { for (const relative of requested) await inspect(relative); this.scanned = true; }
    catch (error) { for (const relative of requested) this.dirty.add(relative); throw error; }
  }

  private async download(transport: OrderedSyncTransport, digest: string): Promise<void> {
    await downloadSyncBlob(transport, this.blobs, digest);
  }

  private async receiveIncoming(transport: OrderedSyncTransport): Promise<void> {
    const incoming = this.state.incoming ?? [];
    if (!incoming.length) return;

    // Compute dependencies before retiring any paths. In particular, completing one of several
    // same-digest additions must not turn an ambiguous move into an inferred rename mid-pass.
    const groups = groupIncoming(incoming);
    const jobs = new Map<string | null, string[]>();
    const outstanding = new Map<string, { count: number }>();
    for (const group of groups) {
      const unready = group.filter(item => item.ready === false);
      const remaining = { count: unready.length };
      for (const item of unready) {
        const digest = item.content ?? item.entry.hash;
        let paths = jobs.get(digest);
        if (!paths) jobs.set(digest, paths = []);
        paths.push(item.path);
        outstanding.set(item.path, remaining);
      }
    }
    // Each worker streams to disk. Distinct workers can keep progressing past one stalled response,
    // and a digest shared by multiple paths has exactly one writer to its .part file.
    const batchSize = Math.max(64, Math.ceil(incoming.length / 16));
    let ready = new Set<string>();
    let transferError: unknown;
    let publicationError: unknown;
    let checkpointError: unknown;
    let publishedEarly = groups.some(group => group.every(item => item.ready !== false));
    let publication = Promise.resolve();

    const flush = () => {
      const batch = ready;
      ready = new Set();
      publication = publication.then(async () => {
        if (checkpointError) return;
        if (batch.size) {
          const incoming = this.state.incoming!.map(item => batch.has(item.path) ? { ...item, ready: true } : item);
          await this.saveState({ ...this.state, incoming, lastProgress: new Date().toISOString() });
        }
        if (publicationError) return;
        try { await this.applyIncoming(groups); }
        catch (error) { if (!gateBusy(error)) publicationError = error; }
      }).catch(error => { checkpointError = error; });
      return publication;
    };
    if (publishedEarly) void flush();

    const markReady = async (paths: string[]) => {
      let completeGroup = false;
      for (const name of paths) {
        ready.add(name);
        if (--outstanding.get(name)!.count === 0) completeGroup = true;
      }
      // Publish the first independent group even when the batch is small. Further
      // checkpoints are bounded by batch size and by the number of workers that drain.
      const firstGroup = completeGroup && !publishedEarly;
      if (firstGroup) publishedEarly = true;
      if (firstGroup || ready.size >= batchSize) await flush();
    };
    const runWorkers = async (process: (digest: string | null, paths: string[]) => Promise<void>) => {
      const work = jobs.entries();
      await Promise.all(Array.from({ length: Math.min(jobs.size, 4) }, async () => {
        for (let job = work.next(); !job.done && !checkpointError; job = work.next()) await process(...job.value);
        // Other workers may still be waiting on their current transfers.
        if (ready.size) await flush();
      }));
    };

    // Local blobs must be verified and released even when every remote stream stalls.
    await runWorkers(async (digest, paths) => {
      const cached = !digest || await hashFile(path.join(this.blobs, digest)).catch(() => null) === digest;
      if (!cached) return;
      jobs.delete(digest);
      await markReady(paths);
    });
    await runWorkers(async (digest, paths) => {
      try { await this.download(transport, digest!); }
      catch (error) { transferError ??= error; return; }
      await markReady(paths);
    });
    await publication;
    if (checkpointError) throw checkpointError;
    if (publicationError) throw publicationError;
    await this.applyIncoming(groups);
    if (transferError) throw transferError;
  }

  private async applyIncoming(queuedGroups?: Incoming[][]): Promise<void> {
    if (!this.state.incoming?.length) return;
    const conflicted: Incoming[] = [];
    const groups = queuedGroups ? this.remainingIncomingGroups(queuedGroups) : groupIncoming(this.state.incoming);
    const readyPaths = groups.filter(group => group.every(item => item.ready !== false)).flatMap(group => group.map(item => item.path));
    if (!readyPaths.length) return;
    let blockedByEditor = false;
    let snapshot: ConflictSnapshot | undefined;
    await this.hooks.publish(async (blocked = new Set()) => {
      const isBlocked = indexRelatedPaths(blocked);
      const next = { ...this.state, base: Object.assign(Object.create(null), this.state.base) as Checkpoint['base'] };
      const pending: Incoming[] = [];
      for (const group of groups) {
        if (group.some(item => item.ready === false)) { pending.push(...group); continue; }
        if (group.some(item => isBlocked(item.path))) {
          blockedByEditor = true;
          pending.push(...group);
          continue;
        }
        await this.applyIncomingGroup(next, group, conflicted);
      }
      if (pending.length) next.incoming = pending;
      else delete next.incoming;
      if (pending.length !== this.state.incoming!.length) next.lastProgress = new Date().toISOString();
      if (conflicted.length) snapshot = await this.captureConflicts(next, null, conflicted);
      await this.saveState(next);
    }, readyPaths);
    if (snapshot) await this.recordConflictBranches(snapshot);
    if (blockedByEditor)
      throw Object.assign(new Error('部分文件已同步，正在等待有关联的文档保存后继续'), { status: 409 });
  }

  private remainingIncomingGroups(groups: Incoming[][]): Incoming[][] {
    const entries = new Map(this.state.incoming!.map(item => [item.path, item]));
    return groups.map(group => group.flatMap(({ path }) => entries.get(path) ?? [])).filter(group => group.length);
  }

  private async applyIncomingGroup(next: Checkpoint, group: Incoming[], conflicted: Incoming[]): Promise<void> {
    const prepared = await Promise.all(group.map(async item => {
      const absolute = await resolveVaultPath(this.root, item.path, true);
      const info = await fs.lstat(absolute).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
        throw error;
      });
      const directory = info?.isDirectory() === true;
      const actual = info && !directory ? await hashFile(absolute) : null;
      return { item, absolute, actual, directory, target: item.content ?? item.entry.hash };
    }));
    const deletions = new Set(prepared.filter(item => item.target === null).map(item => item.absolute));
    const folders = new Map<string, string[]>();
    for (const { absolute, directory, target } of prepared) {
      if (directory && target) {
        const emptyAfterDeletion = await this.emptiedDirectories(absolute, deletions);
        if (emptyAfterDeletion) folders.set(absolute, emptyAfterDeletion);
      }
    }
    if (prepared.some(({ item, absolute, directory, actual, target }) =>
      (directory && target && !folders.has(absolute)) || (actual !== target && actual !== item.expected))) {
      for (const { item, absolute, actual } of prepared) {
        if (actual) {
          const digest = await stageLocalFile(absolute, this.blobs, fileSignature(await fs.stat(absolute)));
          if (digest !== actual) throw new Error('本机文件仍在修改，已暂停恢复');
        }
        conflicted.push({ ...item, expected: actual });
      }
      return;
    }
    for (const { target } of prepared) {
      if (target && await hashFile(path.join(this.blobs, target)) !== target) throw new Error('待恢复附件不完整，未修改笔记');
    }
    for (const { item, absolute, actual, target } of prepared.sort((a, b) => Number(a.target !== null) - Number(b.target !== null))) {
      for (const folder of folders.get(absolute) ?? []) await fs.rmdir(folder);
      if (actual !== target) await writeFileFromSource(absolute, target ? path.join(this.blobs, target) : null, item.expected);
      next.base[item.path] = item.entry;
      if (target) {
        this.files.set(item.path, target);
        this.state.cache[item.path] = { signature: fileSignature(await fs.stat(absolute)), hash: target };
      } else { this.files.delete(item.path); delete this.state.cache[item.path]; }
      await this.hooks.changed(item.path, target === null);
    }
  }

  private async emptiedDirectories(folder: string, deletions: ReadonlySet<string>): Promise<string[] | null> {
    const nested: string[] = [];
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const name = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        const emptied = await this.emptiedDirectories(name, deletions);
        if (!emptied) return null;
        nested.push(...emptied);
      } else if (!entry.isFile() || !deletions.has(name)) return null;
    }
    return [...nested, folder];
  }

  private async retainConflicts(transport: OrderedSyncTransport, changes: Incoming[]): Promise<void> {
    const next = { ...this.state };
    const snapshot = await this.captureConflicts(next, transport, changes);
    await this.saveState(next);
    await this.recordConflictBranches(snapshot);
  }

  private async captureConflicts(next: Checkpoint, transport: OrderedSyncTransport | null, changes: Incoming[]): Promise<ConflictSnapshot> {
    const previous = next.conflict;
    const retained = new Map(previous?.changes.map(item => [item.path, { ...item, expected: previous.local[item.path] ?? null }]));
    for (const item of changes) retained.set(item.path, item);
    const id = randomUUID(); const directory = path.join(this.directory, 'conflicts', id);
    const local: Record<string, string | null> = Object.create(null);
    const snapshot: ConflictSnapshot = { id, files: [] };
    for (const item of retained.values()) {
      local[item.path] = item.expected;
      if (item.entry.hash && transport) await this.download(transport, item.entry.hash);
      for (const [side, digest] of [['local', item.expected], ['remote', item.entry.hash]] as const) {
        if (!digest) continue;
        const target = path.join(directory, side, item.path);
        await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(path.join(this.blobs, digest), target);
      }
      snapshot.files.push({ path: item.path, local: item.expected ? path.join(this.blobs, item.expected) : null,
        remote: item.entry.hash ? path.join(this.blobs, item.entry.hash) : null });
    }
    const retainedChanges = [...retained.values()];
    await atomicSyncJson(path.join(directory, 'conflict.json'), { changes: retainedChanges, local });
    next.conflict = { id, changes: retainedChanges, local, branches: previous?.branches ?? [] };
    return snapshot;
  }

  private async recordConflictBranches(snapshot: ConflictSnapshot): Promise<void> {
    let branchError = '';
    if (this.hooks.conflict) {
      try {
        const branches = await this.hooks.conflict(snapshot);
        const conflict = this.state.conflict!;
        await this.saveState({ ...this.state, conflict: { ...conflict, branches: [...new Set([...conflict.branches, ...branches])] } });
      }
      catch (error) { branchError = `；Git 分支保存失败：${(error as Error).message}`; }
    }
    this.setConflictStatus();
    this.snapshot.message += branchError;
  }

  resolveConflict(choice: ConflictChoice): Promise<FileSyncStatus> {
    if (this.running) return Promise.reject(new Error('同步正在进行，请稍后重试'));
    this.running = withSyncLock(this.directory, () => this.resolveImpl(choice)).finally(() => { this.running = null; });
    return this.running;
  }

  private async resolveImpl(choice: ConflictChoice): Promise<FileSyncStatus> {
    await this.load();
    const conflict = this.state.conflict;
    if (!conflict) return this.status();
    if (choice === 'recheck') {
      delete this.state.conflict; await this.persist(); this.scanned = false;
      this.snapshot.conflictDirectory = null; this.snapshot.conflictBranches = []; this.snapshot.conflictCount = 0;
      return this.pass();
    }
    const pick = (name: string) => typeof choice === 'string' ? choice : choice[name];
    if (typeof choice !== 'string' && (!Object.keys(choice).length ||
        Object.entries(choice).some(([name, value]) => !['local', 'remote', 'merged'].includes(value) || !conflict.changes.some(item => item.path === name))))
      throw Object.assign(new Error('请选择冲突文件保留的版本'), { status: 400 });
    // A subset may be resolved; the remaining files stay in the same conflict.
    const chosen = conflict.changes.filter(item => pick(item.path));
    const remaining = conflict.changes.filter(item => !pick(item.path));
    if (groupIncoming(conflict.changes).some(group => group.some(item => pick(item.path)) && group.some(item => !pick(item.path))))
      throw Object.assign(new Error('有关联的改名或目录冲突需要一起审阅'), { status: 400 });
    const transport = new OrderedSyncTransport(this.preferences.endpoints, this.preferences.token);
    const manifest = await transport.select({ workspaceId: this.state.workspaceId!, revision: this.state.revision });
    for (const item of chosen) {
      const actual = await hashFile(await resolveVaultPath(this.root, item.path, true));
      if ((pick(item.path) !== 'merged' && actual !== conflict.local[item.path]) || manifest.files[item.path]?.version !== item.entry.version || manifest.files[item.path]?.hash !== item.entry.hash)
        throw new Error(`${item.path} 在冲突后又有变化，请点同步重新比较`);
    }
    const next = { ...this.state, base: Object.assign(Object.create(null), this.state.base) as Checkpoint['base'] };
    for (const item of chosen) if (pick(item.path) !== 'remote') next.base[item.path] = item.entry;
    // The entries come from this manifest; record it with them, or a later load sees versions past the checkpoint.
    next.revision = Math.max(next.revision, manifest.revision);
    const incoming = chosen.filter(item => pick(item.path) === 'remote');
    if (incoming.length) next.incoming = [...(next.incoming ?? []), ...incoming];
    if (remaining.length) {
      const local = Object.assign(Object.create(null), conflict.local) as typeof conflict.local;
      for (const item of chosen) delete local[item.path];
      next.conflict = { ...conflict, changes: remaining, local };
    } else delete next.conflict;
    await this.saveState(next);
    try { await this.applyIncoming(); }
    catch (error) {
      if (!gateBusy(error)) throw error;
      if (this.state.conflict) this.setConflictStatus();
      else {
        this.snapshot.phase = 'recovery';
        this.snapshot.conflictDirectory = null;
        this.snapshot.conflictBranches = [];
        this.snapshot.conflictCount = 0;
      }
      this.snapshot.message = '冲突选择已保存，待接收文件将在编辑闸门打开后继续同步';
      return this.status();
    }
    if (this.state.conflict) { this.setConflictStatus(); return this.status(); }
    this.scanned = false; this.snapshot.conflictDirectory = null; this.snapshot.conflictBranches = []; this.snapshot.conflictCount = 0;
    return this.pass();
  }

  /** What adopting the server's version would do to each conflicted file, seen from this device. */
  async conflictDetails(): Promise<{ id: string; files: ConflictFile[] } | null> {
    await this.load();
    const conflict = this.state.conflict;
    if (!conflict) return null;
    const read = async (digest: string | null) => digest ? fs.readFile(path.join(this.blobs, digest)).catch(() => null) : null;
    const files: ConflictFile[] = [];
    const related = new Map(groupIncoming(conflict.changes).flatMap(group => group.map(item =>
      [item.path, group.filter(other => other !== item).map(other => other.path)] as const)));
    for (const item of conflict.changes) {
      const local = conflict.local[item.path] ?? null; const remote = item.entry.hash; const base = this.state.base[item.path]?.hash;
      const [ours, theirs] = [await read(local), await read(remote)];
      const left = local && !ours ? null : decodeText(ours); const right = remote && !theirs ? null : decodeText(theirs);
      const text = left !== null && right !== null && (textExtension(item.path) || !imagePattern.test(item.path));
      const change = text ? describeChange(left, right) : null;
      const full = text && left!.length + right!.length <= 1024 * 1024;
      files.push({ path: item.path, conflictId: conflict.id, relatedPaths: related.get(item.path), localText: full ? left : null, remoteText: full ? right : null,
        action: !local ? 'add' : !remote ? 'delete' : 'modify', hasBase: base !== undefined,
        localChanged: base === undefined || local !== base, remoteChanged: base === undefined || remote !== base,
        localSize: ours?.length ?? null, remoteSize: theirs?.length ?? null, image: imagePattern.test(item.path), text,
        diff: change?.blocks ?? null, truncated: change?.truncated ?? false });
    }
    return { id: conflict.id, files };
  }

  /** The retained bytes of one side of a conflicted file, for previews. */
  async conflictBlob(name: string, side: 'local' | 'remote'): Promise<string | null> {
    await this.load();
    const item = this.state.conflict?.changes.find(change => change.path === name);
    if (!item) return null;
    const digest = side === 'local' ? this.state.conflict!.local[name] : item.entry.hash;
    return digest ? path.join(this.blobs, digest) : null;
  }

  private setConflictStatus(): void {
    const conflict = this.state.conflict!;
    this.snapshot.conflictCount = conflict.changes.length;
    this.snapshot.phase = 'conflict'; this.snapshot.message = `发现 ${conflict.changes.length} 个冲突，已保留本机与远端两版`;
    this.snapshot.conflictDirectory = path.join(this.directory, 'conflicts', conflict.id);
    this.snapshot.conflictBranches = [...conflict.branches];
  }
  private persist(): Promise<void> { return atomicSyncJson(this.filename, this.state); }
  private async saveState(next: Checkpoint): Promise<void> {
    await atomicSyncJson(this.filename, next);
    this.state = next;
  }
}
