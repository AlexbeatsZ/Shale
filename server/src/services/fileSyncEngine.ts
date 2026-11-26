import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { validPath, validateManifest, hashPattern, idPattern } from '../../../sync-server/protocol.mjs';
import type { FileSyncPreferences, FileSyncStatus, SyncEntry, SyncOperation } from '../contracts/fileSync.js';
import { resolveVaultPath, vaultPathKey } from './vaultFile.js';
import { hashFile, writeFileFromSource } from './textFile.js';
import { atomicSyncJson, fileSignature, stageLocalFile, stageSyncBlob, withSyncLock } from './syncStorage.js';
import { OrderedSyncTransport, SyncHttpError } from './syncTransport.js';
import { mergeReview } from '@shale/markdown-core';
import { decodeText, describeChange, textExtension, type DiffBlock } from './syncMerge.js';

const hash = z.string().regex(hashPattern);
const identifier = z.string().regex(idPattern);
const entry = z.object({ hash: hash.nullable(), version: z.number().int().positive().safe() });
const change = z.object({ path: z.string().refine(validPath), hash: hash.nullable(), expectedVersion: z.number().int().nonnegative().safe() });
// `content` is the bytes to publish when they differ from the acknowledged remote entry (a merge result).
const incoming = z.object({ path: z.string().refine(validPath), expected: hash.nullable(), entry, content: hash.optional() });
const checkpoint = z.object({
  version: z.literal(1), root: z.string(), deviceId: identifier, workspaceId: identifier.nullable(), revision: z.number().int().nonnegative().safe(),
  base: z.record(entry), cache: z.record(z.object({ signature: z.string(), hash })), lastSuccess: z.string().nullable(),
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
  path: string; conflictId: string; localText: string | null; remoteText: string | null; action: 'add' | 'delete' | 'modify'; hasBase: boolean; localChanged: boolean; remoteChanged: boolean;
  localSize: number | null; remoteSize: number | null; image: boolean; text: boolean; diff: DiffBlock[] | null; truncated: boolean;
};
const imagePattern = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;
type Hooks = {
  publish<T>(work: () => Promise<T>): Promise<T>;
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

  constructor(readonly root: string, readonly directory: string, readonly preferences: FileSyncPreferences, private readonly hooks: Hooks) {
    this.root = path.resolve(root);
    this.blobs = path.join(directory, 'blobs'); this.filename = path.join(directory, 'checkpoint.json');
    this.snapshot = { enabled: preferences.enabled, endpoints: [...preferences.endpoints], hasToken: !!preferences.token,
      activeEndpoint: null, phase: preferences.enabled ? 'idle' : 'disabled', message: '', lastSuccess: null, conflictDirectory: null, conflictBranches: [],
      conflictCount: 0, recentResolutions: [] };
  }

  status(): FileSyncStatus {
    return { ...this.snapshot, endpoints: [...this.snapshot.endpoints], conflictBranches: [...this.snapshot.conflictBranches],
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
      this.state = { version: 1, root: vaultPathKey(this.root), deviceId: randomUUID(), workspaceId: null, revision: 0, base: {}, cache: {}, lastSuccess: null };
    }
    if (this.state.root !== vaultPathKey(this.root)) throw new Error('同步检查点属于另一个 Vault');
    // `revision` is only the newest server revision seen (the rollback watermark). Every base entry came from a
    // server manifest or receipt, so an entry newer than the watermark (written by builds that resolved part of a
    // conflict without recording the revision) proves the server reached it: raise the watermark, never brick.
    for (const entry of Object.values(this.state.base)) this.state.revision = Math.max(this.state.revision, entry.version);
    if (this.state.workspaceId) validateManifest({ workspaceId: this.state.workspaceId, revision: this.state.revision, files: this.state.base });
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
    let manifest = await transport.select(this.state.workspaceId ? { workspaceId: this.state.workspaceId, revision: this.state.revision } : undefined);
    this.snapshot.activeEndpoint = transport.selected;
    if (!this.state.workspaceId) { this.state.workspaceId = manifest.workspaceId; this.state.revision = manifest.revision; await this.persist(); }
    if (this.state.outbox) {
      const completed = await this.submit(transport);
      if (!completed) throw new Error('远端已有新修改，本机内容已保留，下次同步重新比较');
      manifest = await transport.select({ workspaceId: this.state.workspaceId!, revision: this.state.revision });
      this.snapshot.activeEndpoint = transport.selected;
    }
    const changes: SyncOperation['changes'] = [];
    const downloads: Incoming[] = []; const conflicts: Incoming[] = [];
    // Paths this device never acknowledged and the server deleted: an upload unless the content is known stale.
    const resurrections: Incoming[] = [];
    const acknowledgements: Record<string, SyncEntry> = {};
    // A conflicted or still-journaled path is held back on its own; every other path keeps synchronizing.
    const held = new Set([...(this.state.incoming ?? []), ...(this.state.conflict?.changes ?? [])].map(item => item.path));
    for (const name of new Set([...this.files.keys(), ...Object.keys(this.state.base), ...Object.keys(manifest.files)])) {
      const local = this.files.get(name) ?? null;
      const base = this.state.base[name]?.hash ?? null;
      const remote = Object.hasOwn(manifest.files, name) ? manifest.files[name] : { hash: null, version: 0 };
      if (remote.version < (this.state.base[name]?.version ?? 0)) throw new Error('远端文件版本回退，已停止同步');
      if (this.state.base[name]?.version === remote.version && this.state.base[name].hash !== remote.hash)
        throw new Error('远端文件内容与已确认版本不一致，已停止同步');
      if (held.has(name)) continue;
      if (local === remote.hash) { if (remote.version) acknowledgements[name] = remote; continue; }
      if (local === base) downloads.push({ path: name, expected: local, entry: remote });
      else if (!this.state.base[name] && local && remote.version && !remote.hash) resurrections.push({ path: name, expected: local, entry: remote });
      else if (remote.hash === base) changes.push({ path: name, expectedVersion: remote.version, hash: local });
      else conflicts.push({ path: name, expected: local, entry: remote });
    }
    const automatic: Resolution[] = []; const unresolved: Incoming[] = [];
    for (const item of [...conflicts, ...resurrections]) {
      const resolved = await this.autoResolve(transport, item);
      if (resolved) { downloads.push(resolved.incoming); automatic.push(resolved.record); }
      else if (resurrections.includes(item)) changes.push({ path: item.path, expectedVersion: item.entry.version, hash: item.expected });
      else unresolved.push(item);
    }
    if (unresolved.length) await this.retainConflicts(transport, unresolved);
    for (const item of downloads) if (item.entry.hash && !item.content) await this.download(transport, item.entry.hash);
    Object.assign(this.state.base, acknowledgements);
    this.state.revision = Math.max(this.state.revision, manifest.revision);
    if (downloads.length) this.state.incoming = [...(this.state.incoming ?? []), ...downloads];
    if (changes.length) {
      if (changes.length > 20000) throw new Error('单批同步超过 20000 个文件，请分批导入');
      this.state.outbox = { workspaceId: manifest.workspaceId, deviceId: this.state.deviceId, operationId: randomUUID(), changes };
    }
    await this.persist();
    if (automatic.length) await this.recordResolutions(automatic);
    // Uploads and downloads touch disjoint paths, so uploading never waits for the local editing gate.
    if (this.state.outbox && !await this.submit(transport)) throw new Error('远端已有新修改，本机内容已保留，下次同步重新比较');
    await this.applyIncoming();
    // A merge result is now the local file on top of the remote base; the next pass uploads it.
    if (automatic.some(item => item.kind === 'merged' && item.content !== item.remote) && followUp < 2) {
      const next = await this.pass(followUp + 1);
      if (next.phase === 'idle') next.message = this.automaticMessage(automatic);
      this.snapshot.message = next.message; return this.status();
    }
    this.state.lastSuccess = new Date().toISOString(); await this.persist();
    this.snapshot.lastSuccess = this.state.lastSuccess; this.snapshot.phase = 'idle';
    this.snapshot.message = automatic.length ? this.automaticMessage(automatic) : '同步完成';
    if (this.state.conflict) {
      this.setConflictStatus();
      this.snapshot.message = `其他文件已同步；${this.state.conflict.changes.length} 个冲突文件待处理，两版均已保留`;
    }
    return this.status();
  }

  private automaticMessage(items: Resolution[]): string {
    const count = (kind: Resolution['kind']) => items.filter(item => item.kind === kind).length;
    const parts = [['merged', '合并'], ['fast-forward', '更新为服务器版本'], ['deleted', '按服务器删除']] as const;
    return `同步完成，自动处理 ${items.length} 个文件（${parts.filter(([kind]) => count(kind)).map(([kind, label]) => `${label} ${count(kind)}`).join('，')}），本机原版已保留`;
  }

  /** Whether the server already holds these exact bytes, i.e. they were synchronized before. */
  private async knownRemotely(transport: OrderedSyncTransport, digest: string): Promise<boolean> {
    try { const response = await transport.request(`blobs/${digest}`); await response.body?.cancel(); return true; }
    catch (error) { if (error instanceof SyncHttpError && error.status === 404) return false; throw error; }
  }

  private async blobText(transport: OrderedSyncTransport, digest: string | null): Promise<string | null> {
    if (!digest) return '';
    await this.download(transport, digest);
    return decodeText(await fs.readFile(path.join(this.blobs, digest)));
  }

  /**
   * Resolves a two-sided difference without asking when no edit can be lost:
   * - the path has no acknowledged base on this device (first connection, a copy restored from another tool) and
   *   the local bytes already exist on the server, so they are an older synchronized version rather than new work;
   * - both sides edited a text file and a line-based three-way merge against the base has no overlapping edits.
   * The local version is copied to the recovery directory first. Anything else stays a manual conflict.
   */
  private async autoResolve(transport: OrderedSyncTransport, item: Incoming): Promise<{ incoming: Incoming; record: Resolution } | null> {
    const base = this.state.base[item.path]; const local = item.expected; const remote = item.entry.hash;
    let kind: Resolution['kind'] | null = null; let content: string | undefined;
    if (!base && local && await this.knownRemotely(transport, local)) kind = remote ? 'fast-forward' : 'deleted';
    else if (base?.hash && local && remote && textExtension(item.path)) {
      const [ancestor, ours, theirs] = [await this.blobText(transport, base.hash), await this.blobText(transport, local), await this.blobText(transport, remote)];
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

  private async recordResolutions(items: Resolution[]): Promise<void> {
    this.resolutions = [...this.resolutions, ...items].slice(-500);
    await atomicSyncJson(path.join(this.directory, 'resolutions.json'), this.resolutions);
  }

  private async submit(transport: OrderedSyncTransport): Promise<boolean> {
    const operation = this.state.outbox!;
    try {
      for (const value of new Set(operation.changes.map(item => item.hash).filter((value): value is string => !!value)))
        await transport.upload(value, path.join(this.blobs, value));
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
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        for (const name of this.files.keys()) if (name === relative || name.startsWith(`${relative}/`)) { this.files.delete(name); delete this.state.cache[name]; }
        return;
      }
      if (info.isSymbolicLink()) throw new Error('同步目录包含符号链接或联接，请移出后重试');
      if (info.isDirectory()) {
        const names = await fs.readdir(absolute);
        if (names.includes('.stfolder')) throw new Error('同步目录包含 Syncthing 管理的文件夹');
        for (const name of names) await inspect(relative ? `${relative}/${name}` : name);
        return;
      }
      if (!info.isFile()) throw new Error('同步仅支持普通文件');
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
    const filename = path.join(this.blobs, digest);
    if (await hashFile(filename) === digest) return;
    const response = await transport.request(`blobs/${digest}`);
    if (!response.body) throw new Error('附件下载没有返回数据');
    await stageSyncBlob(Readable.fromWeb(response.body as never), this.blobs, digest);
  }

  private async applyIncoming(): Promise<void> {
    if (!this.state.incoming?.length) return;
    const conflicted: Incoming[] = [];
    await this.hooks.publish(async () => {
      for (const item of this.state.incoming!) {
        const absolute = await resolveVaultPath(this.root, item.path, true);
        const actual = await hashFile(absolute);
        const target = item.content ?? item.entry.hash;
        if (actual !== target && actual !== item.expected) {
          // Edited locally after this download was planned: retain both versions for this path only.
          if (actual) {
            const digest = await stageLocalFile(absolute, this.blobs, fileSignature(await fs.stat(absolute)));
            if (digest !== actual) throw new Error('本机文件仍在修改，已暂停恢复');
          }
          conflicted.push({ path: item.path, expected: actual, entry: item.entry });
          continue;
        }
        if (actual !== target) {
          const source = target ? path.join(this.blobs, target) : null;
          if (source && await hashFile(source) !== target) throw new Error('待恢复附件不完整，未修改笔记');
          await writeFileFromSource(absolute, source, item.expected);
        }
        this.state.base[item.path] = item.entry;
        if (target) {
          this.files.set(item.path, target);
          this.state.cache[item.path] = { signature: fileSignature(await fs.stat(absolute)), hash: target };
        } else { this.files.delete(item.path); delete this.state.cache[item.path]; }
        await this.hooks.changed(item.path, !item.entry.hash);
      }
      delete this.state.incoming; await this.persist();
    });
    if (conflicted.length) await this.retainConflicts(null, conflicted);
  }

  private async retainConflicts(transport: OrderedSyncTransport | null, changes: Incoming[]): Promise<void> {
    const id = randomUUID(); const directory = path.join(this.directory, 'conflicts', id);
    const local: Record<string, string | null> = {};
    const snapshot: ConflictSnapshot = { id, files: [] };
    for (const item of changes) {
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
    await atomicSyncJson(path.join(directory, 'conflict.json'), { changes, local });
    if (!transport) delete this.state.incoming;
    const previous = this.state.conflict;
    if (previous) for (const item of previous.changes) if (!changes.some(change => change.path === item.path)) {
      changes.push(item); local[item.path] = previous.local[item.path] ?? null;
    }
    this.state.conflict = { id, changes, local, branches: [] }; await this.persist();
    let branchError = '';
    if (this.hooks.conflict) {
      try { this.state.conflict.branches = await this.hooks.conflict(snapshot); await this.persist(); }
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
    const transport = new OrderedSyncTransport(this.preferences.endpoints, this.preferences.token);
    const manifest = await transport.select({ workspaceId: this.state.workspaceId!, revision: this.state.revision });
    for (const item of chosen) {
      const actual = await hashFile(await resolveVaultPath(this.root, item.path, true));
      if ((pick(item.path) !== 'merged' && actual !== conflict.local[item.path]) || manifest.files[item.path]?.version !== item.entry.version || manifest.files[item.path]?.hash !== item.entry.hash)
        throw new Error(`${item.path} 在冲突后又有变化，请点同步重新比较`);
    }
    for (const item of chosen) this.state.base[item.path] = item.entry;
    // The entries come from this manifest; record it with them, or a later load sees versions past the checkpoint.
    this.state.revision = Math.max(this.state.revision, manifest.revision);
    const incoming = chosen.filter(item => pick(item.path) === 'remote');
    if (incoming.length) this.state.incoming = incoming;
    else delete this.state.incoming;
    if (remaining.length) {
      conflict.changes = remaining;
      for (const item of chosen) delete conflict.local[item.path];
    } else delete this.state.conflict;
    await this.persist();
    await this.applyIncoming();
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
    for (const item of conflict.changes) {
      const local = conflict.local[item.path] ?? null; const remote = item.entry.hash; const base = this.state.base[item.path]?.hash;
      const [ours, theirs] = [await read(local), await read(remote)];
      const left = local && !ours ? null : decodeText(ours); const right = remote && !theirs ? null : decodeText(theirs);
      const text = left !== null && right !== null && (textExtension(item.path) || !imagePattern.test(item.path));
      const change = text ? describeChange(left, right) : null;
      const full = text && left!.length + right!.length <= 1024 * 1024;
      files.push({ path: item.path, conflictId: conflict.id, localText: full ? left : null, remoteText: full ? right : null,
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
}
