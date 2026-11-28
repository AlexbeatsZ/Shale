import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { FileSyncEngine } from './fileSyncEngine.js';
import { indexRelatedPaths, planSyncPath } from './fileSyncGroups.js';
import { OrderedSyncTransport, normalizeSyncEndpoint } from './syncTransport.js';
import { createSyncServer } from '../../../sync-server/server.mjs';
import { prefix, validPath } from '../../../sync-server/protocol.mjs';
import { normalizeHotkeyPreferences, resolveHotkeys, hotkeyLabel } from '@shale/search-core';
import type { FileSyncPreferences } from '../contracts/fileSync.js';

const busyFiles = vi.hoisted(() => new Set<string>());
vi.mock('./syncStorage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./syncStorage.js')>();
  return { ...actual, stageLocalFile: async (filename: string, ...rest: [string, string]) => {
    if (busyFiles.has(filename)) throw new actual.SyncFileBusyError();
    return actual.stageLocalFile(filename, ...rest);
  } };
});
const token = 'fixture-only-token-not-a-live-credential-123456';
let directory: string;
let closes: (() => Promise<void>)[];
let endpoint: string;
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

it('isolates 4,000 held paths by full component, including folded names and shape changes', () => {
  const matches = indexRelatedPaths(Array.from({ length: 4000 }, (_, i) => `Books/Unit-${i}/Page.md`));
  let related = 0;
  for (let i = 0; i < 20000; i++) {
    if (matches(`books/unit-${i}/PAGE.md`)) related++;
  }
  expect(related).toBe(4000);
  expect(matches('BOOKS')).toBe(true);
  expect(matches('books/Unit-1/page.md/attachment')).toBe(true);
  expect(matches('books/unit-1/other.md')).toBe(false);
  expect(matches('Bookshelf')).toBe(false);
  expect(indexRelatedPaths([])('Books')).toBe(false);
});

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}/`;
}

async function hub(name = 'hub'): Promise<string> {
  const service = await createSyncServer({ root: path.join(directory, name), token });
  closes.push(() => service.close());
  return listen(service.server);
}

async function client(name: string, options: Partial<FileSyncPreferences> = {},
  publish = async <T>(work: (blocked?: ReadonlySet<string>) => Promise<T>, _paths: string[]) => work()) {
  const root = path.join(directory, name);
  const state = path.join(directory, `${name}-state`);
  await fs.mkdir(root, { recursive: true });
  const preferences = { enabled: true, endpoints: [endpoint], token, intervalSec: 15, ...options };
  const changed = vi.fn(async () => {});
  const engine = new FileSyncEngine(root, state, preferences, { publish, changed });
  const write = async (name: string, bytes: string | Buffer) => {
    const filename = path.join(root, name); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, bytes); engine.noteChanged(name);
  };
  return { root, state, preferences, engine, write, changed };
}

beforeEach(async () => {
  const base = path.join(os.tmpdir(), '.agents'); await fs.mkdir(base, { recursive: true });
  directory = await fs.mkdtemp(path.join(base, 'shale-sync-test-')); closes = [];
  endpoint = await hub();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(closes.map(close => close()));
  if (!path.resolve(directory).startsWith(path.join(os.tmpdir(), '.agents', 'shale-sync-test-'))) throw new Error('Unsafe fixture path');
  await fs.rm(directory, { recursive: true, force: true });
});

// Real disk and Git fixtures share I/O with the 12 MiB transfer cases; match the packaged runner limit.
describe('native file synchronization', { timeout: 30000 }, () => {
  it('replicates folders as items: empty folders, folder renames and folder deletions', async () => {
    const sender = await client('folder-sender'), receiver = await client('folder-receiver');
    await fs.mkdir(path.join(sender.root, 'Empty/Inner'), { recursive: true }); sender.engine.noteChanged('Empty');
    await sender.write('Old/Deep/a.md', 'a'); await sender.write('Old/b.md', 'b');
    expect(await sender.engine.run()).toMatchObject({ phase: 'idle' });
    expect(await receiver.engine.run()).toMatchObject({ phase: 'idle', pendingIncoming: 0 });
    expect((await fs.stat(path.join(receiver.root, 'Empty/Inner'))).isDirectory()).toBe(true);
    // A folder created only on the receiver travels back like any other item.
    await fs.mkdir(path.join(receiver.root, 'Local only')); receiver.engine.noteChanged('Local only');
    expect(await receiver.engine.run()).toMatchObject({ phase: 'idle' });
    await fs.rename(path.join(sender.root, 'Old'), path.join(sender.root, 'New'));
    sender.engine.noteChanged('Old'); sender.engine.noteChanged('New');
    await fs.rm(path.join(sender.root, 'Empty'), { recursive: true }); sender.engine.noteChanged('Empty');
    expect(await sender.engine.run()).toMatchObject({ phase: 'idle' });
    expect((await fs.readdir(sender.root)).sort()).toEqual(['Local only', 'New']);
    expect(await receiver.engine.run()).toMatchObject({ phase: 'idle', pendingIncoming: 0 });
    expect((await fs.readdir(receiver.root)).sort()).toEqual(['Local only', 'New']);
    expect(await fs.readFile(path.join(receiver.root, 'New/Deep/a.md'), 'utf8')).toBe('a');
    expect(receiver.changed).toHaveBeenCalledWith('Old', true, true);
  });

  it('keeps a remotely deleted folder that gained local content and uploads it again', async () => {
    const sender = await client('keep-sender'), receiver = await client('keep-receiver');
    await sender.write('Shared/a.md', 'a'); await sender.engine.run(); await receiver.engine.run();
    await receiver.write('Shared/new.md', 'written offline');
    await fs.rm(path.join(sender.root, 'Shared'), { recursive: true }); sender.engine.noteChanged('Shared');
    await sender.engine.run();
    const status = await receiver.engine.run();
    expect(status.phase).toBe('idle');
    await expect(fs.access(path.join(receiver.root, 'Shared/a.md'))).rejects.toThrow();
    expect(await fs.readFile(path.join(receiver.root, 'Shared/new.md'), 'utf8')).toBe('written offline');
    expect(await receiver.engine.run()).toMatchObject({ phase: 'idle', failedPaths: [] });
    await sender.engine.run();
    expect(await fs.readFile(path.join(sender.root, 'Shared/new.md'), 'utf8')).toBe('written offline');
  });

  it('applies case-only renames of files and folders without losing content', async () => {
    const sender = await client('case-sender'), receiver = await client('case-receiver');
    await sender.write('Note.md', 'note body'); await sender.write('Folder/Child.md', 'child body');
    await sender.engine.run(); await receiver.engine.run();
    await fs.rename(path.join(sender.root, 'Note.md'), path.join(sender.root, 'note.md'));
    await fs.rename(path.join(sender.root, 'Folder'), path.join(sender.root, 'folder'));
    for (const name of ['Note.md', 'note.md', 'Folder', 'folder']) sender.engine.noteChanged(name);
    expect(await sender.engine.run()).toMatchObject({ phase: 'idle', failedPaths: [] });
    expect(await receiver.engine.run()).toMatchObject({ phase: 'idle', pendingIncoming: 0 });
    expect((await fs.readdir(receiver.root)).sort()).toEqual(['folder', 'note.md']);
    expect(await fs.readFile(path.join(receiver.root, 'note.md'), 'utf8')).toBe('note body');
    expect(await fs.readFile(path.join(receiver.root, 'folder/Child.md'), 'utf8')).toBe('child body');
    expect(await sender.engine.run()).toMatchObject({ phase: 'idle' });
    expect((await fs.readdir(sender.root)).sort()).toEqual(['folder', 'note.md']);
  });

  it('skips a symlink as a failed item and keeps synchronizing everything else', async () => {
    const sender = await client('link-sender'), receiver = await client('link-receiver');
    await sender.write('target.md', 'target');
    await fs.symlink(path.join(sender.root, 'target.md'), path.join(sender.root, 'link.md')); sender.engine.noteChanged('link.md');
    const status = await sender.engine.run();
    expect(status).toMatchObject({ phase: 'idle', failedPaths: [{ path: 'link.md', message: expect.stringContaining('符号链接') }] });
    expect(status.message).toContain('link.md');
    expect(status.lastSuccess).toBeNull();
    await receiver.engine.run();
    expect(await fs.readFile(path.join(receiver.root, 'target.md'), 'utf8')).toBe('target');
    await expect(fs.access(path.join(receiver.root, 'link.md'))).rejects.toThrow();
  });

  it('uploads a large change set in server-sized batches without asking the user to split it', async () => {
    const root = path.join(directory, 'batch'); await fs.mkdir(root);
    for (let i = 0; i < 7; i++) await fs.writeFile(path.join(root, `note-${i}.md`), `body ${i}`);
    const engine = new FileSyncEngine(root, path.join(directory, 'batch-state'), { enabled: true, endpoints: [endpoint], token, intervalSec: 15 },
      { publish: async work => work(), changed: async () => {} }, 3);
    expect(await engine.run()).toMatchObject({ phase: 'idle' });
    const manifest = await new OrderedSyncTransport([endpoint], token).select();
    expect(Object.keys(manifest.files).filter(name => name.startsWith('note-'))).toHaveLength(7);
  });

  it('rescans the whole Vault on request, catching changes made while the app was closed', async () => {
    const sender = await client('rescan-sender'), receiver = await client('rescan-receiver');
    await sender.write('seen.md', 'one'); await sender.engine.run();
    await fs.writeFile(path.join(sender.root, 'unwatched.md'), 'edited by another app');
    await sender.engine.run(); await receiver.engine.run();
    await expect(fs.access(path.join(receiver.root, 'unwatched.md'))).rejects.toThrow();
    sender.engine.requestFullScan();
    await sender.engine.run(); await receiver.engine.run();
    expect(await fs.readFile(path.join(receiver.root, 'unwatched.md'), 'utf8')).toBe('edited by another app');
  });

  it('defers a file still being written during the scan and keeps synchronizing the others', async () => {
    const sender = await client('busy-sender'), receiver = await client('busy-receiver');
    await sender.write('free.md', 'from sender'); await sender.engine.run();
    await receiver.write('busy.md', 'half written'); await receiver.write('ready.md', 'complete');
    busyFiles.add(path.join(receiver.root, 'busy.md'));
    const status = await receiver.engine.run();
    expect(status).toMatchObject({ phase: 'idle', deferredPaths: ['busy.md'] });
    expect(status.message).toContain('busy.md');
    expect(await fs.readFile(path.join(receiver.root, 'free.md'), 'utf8')).toBe('from sender');
    expect(await sender.engine.run()).toMatchObject({ phase: 'idle' });
    expect(await fs.readFile(path.join(sender.root, 'ready.md'), 'utf8')).toBe('complete');
    await expect(fs.access(path.join(sender.root, 'busy.md'))).rejects.toThrow();
    busyFiles.clear();
    expect(await receiver.engine.run()).toMatchObject({ phase: 'idle', deferredPaths: [] });
    await sender.engine.run();
    expect(await fs.readFile(path.join(sender.root, 'busy.md'), 'utf8')).toBe('half written');
  });

  it('replans superseded downloads after an old blob has been garbage collected', async () => {
    const sender = await client('sender'), receiver = await client('receiver');
    await sender.write('note.md', 'old remote content'); await sender.engine.run();
    const original = globalThis.fetch, oldHash = digest('old remote content');
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (String(url).endsWith('/blobs/' + oldHash) && !options?.method) throw new Error('offline download');
      return original(url, options);
    });
    expect((await receiver.engine.run()).pendingIncoming).toBe(1);
    await sender.write('note.md', 'current remote content'); await sender.engine.run();
    await fs.unlink(path.join(directory, 'hub/blobs', oldHash));
    spy.mockRestore();
    expect(await receiver.engine.run()).toMatchObject({ phase: 'idle', pendingIncoming: 0 });
    expect(await fs.readFile(path.join(receiver.root, 'note.md'), 'utf8')).toBe('current remote content');
  });

  it('reclaims only old unreferenced transfer cache while retaining the acknowledged base', async () => {
    const sender = await client('cache-prune');
    const orphan = digest('obsolete cached version');
    await fs.mkdir(path.join(sender.state, 'blobs'), { recursive: true });
    const file = path.join(sender.state, 'blobs', orphan);
    await fs.writeFile(file, 'obsolete cached version');
    const old = new Date(Date.now() - 48 * 3600000); await fs.utimes(file, old, old);
    await sender.write('keep.md', 'current local content');
    expect(await sender.engine.run()).toMatchObject({ phase: 'idle' });
    await expect(fs.stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(path.join(sender.state, 'blobs', digest('current local content')), 'utf8')).toBe('current local content');
  });
  it('matches the shared TypeScript, Kotlin and C# per-path planning traces', () => {
    const { traces } = createRequire(import.meta.url)('@alexbeatsz/file-sync-core/sync-golden-traces.json');
    for (const trace of traces) for (const { event, expected } of trace.steps) {
      if (event.type !== 'plan') continue;
      expect(planSyncPath(event.base, event.localHash, event.remote, event.blockedGroups.includes(event.group)), trace.id).toEqual(expected);
    }
  });

  it('restarts a durable paged discovery and takes the next revision from delta', async () => {
    const writer = new OrderedSyncTransport([endpoint], token);
    const manifest = await writer.select();
    const hash = digest('same');
    const blob = path.join(directory, 'payload'); await fs.writeFile(blob, 'same');
    await writer.upload(hash, blob);
    const changes = Array.from({ length: 257 }, (_, n) => ({ path: `folder/file-${String(n).padStart(3, '0')}.md`, hash, expectedVersion: 0 }));
    const write = (updates: typeof changes) => writer.commit({ workspaceId: manifest.workspaceId, operationId: randomUUID(), deviceId: randomUUID(), changes: updates });
    await write(changes);
    const second = await client('second');
    const original = globalThis.fetch;
    const resources: string[] = [];
    let drop = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      resources.push(String(url));
      if (drop && String(url).includes('manifest/pages?cursor=')) throw new Error('fixture interrupted second page');
      return original(url, options);
    });
    expect(await second.engine.run()).toMatchObject({ phase: 'error', seen: 1, queuedThrough: 0 });
    const filename = path.join(second.state, 'checkpoint.json');
    const partial = JSON.parse(await fs.readFile(filename, 'utf8'));
    expect(Object.keys(partial.discovery.files)).toHaveLength(256);
    expect(partial.discovery.cursor).toBeTruthy();
    await write([{ path: 'late.md', hash, expectedVersion: 0 }]);
    drop = false;
    const restarted = new FileSyncEngine(second.root, second.state, second.preferences, { publish: async work => work(), changed: async () => {} });
    expect(await restarted.run()).toMatchObject({ phase: 'idle', seen: 1, queuedThrough: 1 });
    await expect(fs.access(path.join(second.root, 'late.md'))).rejects.toThrow();
    expect(await restarted.run()).toMatchObject({ phase: 'idle', seen: 2, queuedThrough: 2 });
    expect(resources.some(url => url.includes('changes?since=1&limit='))).toBe(true);
    expect(resources.some(url => url.endsWith('/manifest'))).toBe(false);
    expect(await fs.readFile(path.join(second.root, 'late.md'), 'utf8')).toBe('same');
    expect(await fs.readdir(path.join(second.root, 'folder'))).toHaveLength(257);
  });

  it('negotiates legacy gateway responses without skipping the selected endpoint', async () => {
    const original = globalThis.fetch;
    const resources: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const target = String(url); resources.push(target);
      if (target.includes('manifest/pages?')) return new Response(null, { status: 404 });
      return original(url, options);
    });
    const first = await client('first');
    await first.write('legacy.md', 'legacy');
    expect(await first.engine.run()).toMatchObject({ phase: 'idle', activeEndpoint: endpoint, seen: 1, queuedThrough: 1 });
    expect(resources.some(url => url.endsWith('/manifest'))).toBe(true);
    expect(resources.every(url => url.startsWith(endpoint))).toBe(true);
  });

  it.each(['a-attachment.bin', 'z-attachment.bin'])(
    'publishes a short queue around a stalled %s while preserving rename and dirty groups',
    async attachment => {
      const sender = await client('sender');
      const dirtyPaths = new Set<string>();
      const receiver = await client('receiver', {}, async work => work(dirtyPaths));
      const large = Buffer.alloc(12 * 1024 * 1024, 42);
      const largeHash = digest(large);
      const cacheHash = digest('cache hit');
      await sender.write('old-name.bin', large);
      await sender.write('dirty.md', 'original');
      expect((await sender.engine.run()).phase).toBe('idle');
      expect((await receiver.engine.run()).phase).toBe('idle');

      // Delete and create the same content in one revision, but force the receiver to download it.
      await fs.unlink(path.join(sender.root, 'old-name.bin'));
      sender.engine.noteChanged('old-name.bin');
      await sender.write(attachment, large);
      await sender.write('dirty.md', 'remote dirty change');
      await sender.write('m-independent.md', 'arrived via download');
      await sender.write('n-cached.md', 'cache hit');
      await sender.write('o-cached-copy.md', 'cache hit');
      expect((await sender.engine.run()).phase).toBe('idle');
      await fs.unlink(path.join(receiver.state, 'blobs', largeHash));
      await fs.writeFile(path.join(receiver.state, 'blobs', cacheHash), 'cache hit');
      dirtyPaths.add('dirty.md');
      const original = globalThis.fetch;
      let release!: () => void;
      const waiting = new Promise<void>(resolve => { release = resolve; });
      let paused = false;
      const requests: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        requests.push(String(url));
        const response = await original(url, options);
        if (!String(url).endsWith('/blobs/' + largeHash) || options?.method) return response;
        const reader = response.body!.getReader();
        let first = true;
        return new Response(new ReadableStream({
          async pull(controller) {
            if (!first) { paused = true; await waiting; }
            first = false;
            const chunk = await reader.read();
            if (chunk.done) controller.close();
            else controller.enqueue(chunk.value);
          },
          cancel: reason => reader.cancel(reason),
        }), { status: response.status, headers: response.headers });
      });
      const run = receiver.engine.run();
      const read = (name: string) => fs.readFile(path.join(receiver.root, name), 'utf8');
      try {
        await expect.poll(() => paused, { timeout: 5000 }).toBe(true);
        await expect.poll(() => read('m-independent.md').catch(() => null), { timeout: 5000 }).toBe('arrived via download');
        await expect.poll(() => read('o-cached-copy.md').catch(() => null), { timeout: 5000 }).toBe('cache hit');
        expect(await read('n-cached.md')).toBe('cache hit');
        expect(requests.filter(url => url.endsWith('/blobs/' + cacheHash))).toHaveLength(0);
        expect(requests.filter(url => url.endsWith('/blobs/' + largeHash))).toHaveLength(1);
        expect(await read('dirty.md')).toBe('original');
        expect((await fs.stat(path.join(receiver.root, 'old-name.bin'))).size).toBe(large.length);
        await expect(fs.stat(path.join(receiver.root, attachment))).rejects.toMatchObject({ code: 'ENOENT' });
        const checkpoint = async () => JSON.parse(await fs.readFile(path.join(receiver.state, 'checkpoint.json'), 'utf8'));
        await expect.poll(async () => (await checkpoint()).incoming.map((item: { path: string }) => item.path).sort())
          .toEqual([attachment, 'dirty.md', 'old-name.bin'].sort());
        expect((await checkpoint()).base['m-independent.md'].hash).toBe(digest('arrived via download'));
      } finally { release(); await run; }
      expect(await run).toMatchObject({ phase: 'recovery', pendingIncoming: 1 });
      expect((await fs.readFile(path.join(receiver.root, attachment))).equals(large)).toBe(true);
      await expect(fs.stat(path.join(receiver.root, 'old-name.bin'))).rejects.toMatchObject({ code: 'ENOENT' });
      dirtyPaths.clear();
      const restarted = new FileSyncEngine(receiver.root, receiver.state, receiver.preferences,
        { publish: async work => work(), changed: async () => {} });
      await restarted.recover();
      expect((await restarted.run())).toMatchObject({ phase: 'idle', pendingIncoming: 0 });
      expect(await read('dirty.md')).toBe('remote dirty change');
    },
  );

  it('publishes cached work independently of four held network streams and retains conflicts across batches', async () => {
    const sender = await client('sender');
    const conflicted = new Set<string>();
    const receiver = await client('receiver', {}, async (work, paths?) => {
      // Simulate a newer local write after planning while entering the publication lease.
      for (const name of ['z-cached-conflict.md', 'a-stream-0.bin']) {
        if (!paths?.includes(name) || conflicted.has(name)) continue;
        conflicted.add(name);
        await fs.writeFile(path.join(receiver.root, name), 'local version');
      }
      return work();
    });
    const streams = Array.from({ length: 4 }, (_, i) => ({ name: `a-stream-${i}.bin`, bytes: Buffer.alloc(256 * 1024, i) }));
    const hashes = new Set(streams.map(({ bytes }) => digest(bytes)));
    await fs.mkdir(path.join(receiver.state, 'blobs'), { recursive: true });
    const cached = 'cached bytes';
    const cachedConflict = 'remote cached version';
    for (const [name, bytes] of [['y-cached.md', cached], ['z-cached-conflict.md', cachedConflict]]) {
      await sender.write(name, bytes);
      await fs.writeFile(path.join(receiver.state, 'blobs', digest(bytes)), bytes);
    }
    for (const { name, bytes } of streams) await sender.write(name, bytes);
    expect((await sender.engine.run()).phase).toBe('idle');

    const original = globalThis.fetch;
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    let stalled = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const address = new URL(String(url)).pathname;
      if (!options?.method && hashes.has(address.split('/').at(-1)!)) { stalled++; await hold; }
      return original(url, options);
    });
    const read = (name: string) => fs.readFile(path.join(receiver.root, name), 'utf8');
    const run = receiver.engine.run();
    try {
      await expect.poll(() => stalled).toBe(4);
      expect(await read('y-cached.md')).toBe(cached);
      expect(await read('z-cached-conflict.md')).toBe('local version');
      expect(receiver.engine.status().conflictCount).toBe(1);
      expect((await receiver.engine.conflictDetails())?.files.map(item => item.path)).toEqual(['z-cached-conflict.md']);
    } finally { release(); await run; }

    expect(await run).toMatchObject({ phase: 'conflict', conflictCount: 2 });
    const details = await receiver.engine.conflictDetails();
    expect(details?.files.map(item => item.path).sort()).toEqual(['a-stream-0.bin', 'z-cached-conflict.md']);
    expect(await read('a-stream-0.bin')).toBe('local version');
    const reopened = new FileSyncEngine(receiver.root, receiver.state, receiver.preferences,
      { publish: async work => work(), changed: async () => {} });
    await reopened.recover();
    expect((await reopened.conflictDetails())?.files.map(item => item.path).sort()).toEqual(['a-stream-0.bin', 'z-cached-conflict.md']);
    for (const { name, bytes } of streams.slice(1)) expect((await fs.readFile(path.join(receiver.root, name))).equals(bytes)).toBe(true);
  });

  it('resumes interrupted upload and download using the same digest and durable operation', async () => {
    const bytes = Buffer.alloc(8 * 1024 * 1024 + 512, 41);
    const hash = digest(bytes);
    const first = await client('first'); const second = await client('second');
    await first.write('big.bin', bytes);
    const original = globalThis.fetch;
    const uploads: string[] = []; const ranges: string[] = [];
    let dropUpload = true; let dropDownload = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const address = String(url); const headers = new Headers(options?.headers);
      if (address.endsWith(`/uploads/${hash}`) && options?.method === 'PUT') uploads.push(headers.get('Content-Range')!);
      const response = await original(url, options);
      if (dropUpload && uploads.length === 1 && options?.method === 'PUT' && address.endsWith(`/uploads/${hash}`)) {
        dropUpload = false;
        await response.body?.cancel();
        throw new Error('fixture lost uploaded chunk response');
      }
      if (address.endsWith(`/blobs/${hash}`) && !options?.method) {
        if (headers.get('Range')) ranges.push(headers.get('Range')!);
        if (dropDownload) {
          dropDownload = false;
          await response.body?.cancel();
          let sent = false;
          return new Response(new ReadableStream({ async pull(controller) {
            if (!sent) { sent = true; controller.enqueue(bytes.subarray(0, 1024 * 1024)); return; }
            await new Promise(resolve => setTimeout(resolve, 25));
            controller.error(new Error('fixture lost download stream'));
          } }));
        }
      }
      return response;
    });
    expect(await first.engine.run()).toMatchObject({ phase: 'error', pendingOutgoing: 1 });
    const before = JSON.parse(await fs.readFile(path.join(first.state, 'checkpoint.json'), 'utf8'));
    const sender = new FileSyncEngine(first.root, first.state, first.preferences, { publish: async work => work(), changed: async () => {} });
    expect((await sender.run()).phase).toBe('idle');
    expect(uploads).toEqual([`bytes 0-8388607/${bytes.length}`, `bytes 8388608-${bytes.length - 1}/${bytes.length}`]);
    const serverState = JSON.parse(await fs.readFile(path.join(directory, 'hub', 'state.json'), 'utf8'));
    expect(Object.keys(serverState.receipts).some(key => key.includes(before.outbox.operationId))).toBe(true);
    dropDownload = true;
    expect(await second.engine.run()).toMatchObject({ phase: 'recovery', pendingIncoming: 1 });
    await expect(fs.access(path.join(second.root, 'big.bin'))).rejects.toThrow();
    const partial = path.join(second.state, 'blobs', `${hash}.part`);
    expect((await fs.stat(partial)).size).toBe(1024 * 1024);
    const receiver = new FileSyncEngine(second.root, second.state, second.preferences, { publish: async work => work(), changed: async () => {} });
    expect(await receiver.run()).toMatchObject({ phase: 'idle', pendingIncoming: 0 });
    expect(ranges).toEqual(['bytes=1048576-']);
    expect((await fs.readFile(path.join(second.root, 'big.bin'))).equals(bytes)).toBe(true);
  });

  it('round-trips exact Markdown, Canvas, images and PDF bytes without Git', async () => {
    const first = await client('first'); const second = await client('second');
    const files = { '笔记.md': Buffer.from('# 原文\r\n![[附件/图片.png]]\r\n'), '图.canvas': Buffer.from('{"nodes":[]}'),
      '附件/图片.png': Buffer.from([137, 80, 78, 71, 0, 255, 128]), '附件/文档.pdf': Buffer.from('%PDF-1.7\0\xff', 'latin1'), toString: Buffer.from('valid filename') };
    for (const [name, bytes] of Object.entries(files)) await first.write(name, bytes);
    expect((await first.engine.run()).phase).toBe('idle');
    expect((await second.engine.run()).phase).toBe('idle');
    for (const [name, bytes] of Object.entries(files)) expect(await fs.readFile(path.join(second.root, name))).toEqual(bytes);
    await expect(fs.access(path.join(first.root, '.git'))).rejects.toThrow();
    await second.write('笔记.md', '另一台设备修改');
    expect((await second.engine.run()).phase).toBe('idle');
    expect((await first.engine.run()).phase).toBe('idle');
    expect(await fs.readFile(path.join(first.root, '笔记.md'), 'utf8')).toBe('另一台设备修改');
  });

  it('syncs one hotkey file with independent Windows and physical-Control Mac bindings intact', async () => {
    const first = await client('win-keys'), second = await client('mac-keys');
    const filename = '.shale/hotkeys.jsonc';
    const preferences = { version: 1, bindings: { save: [{ modifiers: ['Ctrl'], key: 'S' }] }, platforms: {
      windows: { 'editor:set-heading-7': [{ modifiers: ['Ctrl', 'Alt'], key: '7' }] },
      mac: { 'editor:set-heading-7': [{ modifiers: ['PhysicalCtrl', 'Alt'], key: '8' }] },
    } };
    await first.write(filename, JSON.stringify(preferences));
    expect((await first.engine.run()).phase).toBe('idle'); expect((await second.engine.run()).phase).toBe('idle');
    let synced = normalizeHotkeyPreferences(JSON.parse(await fs.readFile(path.join(second.root, filename), 'utf8')));
    expect(hotkeyLabel(resolveHotkeys(synced, 'save', [], true)[0], true)).toBe('⌘ + S');
    expect(hotkeyLabel(resolveHotkeys(synced, 'editor:set-heading-7', [], true)[0], true)).toBe('Control + Option + 8');
    synced.platforms!.windows!['editor:set-heading-7'][0].key = '9';
    await second.write(filename, JSON.stringify(synced)); await second.engine.run(); await first.engine.run();
    synced = normalizeHotkeyPreferences(JSON.parse(await fs.readFile(path.join(first.root, filename), 'utf8')));
    expect(synced.platforms!.windows!['editor:set-heading-7'][0].key).toBe('9');
    expect(hotkeyLabel(resolveHotkeys(synced, 'editor:set-heading-7', [], true)[0], true)).toBe('Control + Option + 8');
  });

  it('propagates binary replacement, rename and deletion with tombstones', async () => {
    const first = await client('first'); const second = await client('second');
    await first.write('old.png', Buffer.from([0, 255, 1])); await first.engine.run(); await second.engine.run();
    await first.write('old.png', Buffer.from([2, 254, 3])); await first.engine.run(); await second.engine.run();
    expect(await fs.readFile(path.join(second.root, 'old.png'))).toEqual(Buffer.from([2, 254, 3]));
    await fs.rename(path.join(first.root, 'old.png'), path.join(first.root, 'new.png'));
    first.engine.noteChanged('old.png'); first.engine.noteChanged('new.png');
    expect((await first.engine.run()).phase).toBe('idle'); expect((await second.engine.run()).phase).toBe('idle');
    await expect(fs.access(path.join(second.root, 'old.png'))).rejects.toThrow();
    expect(await fs.readFile(path.join(second.root, 'new.png'))).toEqual(Buffer.from([2, 254, 3]));
    await fs.unlink(path.join(second.root, 'new.png')); second.engine.noteChanged('new.png');
    await second.engine.run(); await first.engine.run();
    await expect(fs.access(path.join(first.root, 'new.png'))).rejects.toThrow();
  });

  it('preserves binary conflicts and explicitly adopts a selected side', async () => {
    const first = await client('first'); const second = await client('second');
    await first.write('image.png', Buffer.from([0])); await first.engine.run(); await second.engine.run();
    await first.write('image.png', Buffer.from([1, 255])); await first.engine.run();
    await second.write('image.png', Buffer.from([2, 254]));
    const conflict = await second.engine.run(); expect(conflict.phase).toBe('conflict');
    expect(await fs.readFile(path.join(conflict.conflictDirectory!, 'local/image.png'))).toEqual(Buffer.from([2, 254]));
    expect(await fs.readFile(path.join(conflict.conflictDirectory!, 'remote/image.png'))).toEqual(Buffer.from([1, 255]));
    expect(await fs.readFile(path.join(second.root, 'image.png'))).toEqual(Buffer.from([2, 254]));
    expect((await second.engine.resolveConflict('local')).phase).toBe('idle');
    await first.engine.run(); expect(await fs.readFile(path.join(first.root, 'image.png'))).toEqual(Buffer.from([2, 254]));
    await first.write('image.png', Buffer.from([3])); await first.engine.run(); await second.write('image.png', Buffer.from([4]));
    expect((await second.engine.run()).phase).toBe('conflict');
    expect((await second.engine.resolveConflict('remote')).phase).toBe('idle');
    expect(await fs.readFile(path.join(second.root, 'image.png'))).toEqual(Buffer.from([3]));
  });

  it('preserves first-connection differences and deletion intent when v1 cannot prove a same-path ancestor', async () => {
    const first = await client('first');
    await first.write('theme.svg', '<svg>base</svg>');
    await first.write('same-bytes-at-other-path.svg', '<svg>unrelated</svg>');
    await first.write('gone.js', 'old()');
    await first.write('kept.md', 'base\n');
    await first.engine.run();
    await first.write('theme.svg', '<svg>new</svg>');
    await fs.rm(path.join(first.root, 'gone.js')); first.engine.noteChanged('gone.js');
    expect((await first.engine.run()).phase).toBe('idle');

    const tablet = await client('tablet');
    await tablet.write('theme.svg', '<svg>unrelated</svg>');
    await tablet.write('gone.js', 'old()');
    await tablet.write('kept.md', 'base\n');
    const status = await tablet.engine.run();
    expect(status).toMatchObject({ phase: 'conflict', conflictCount: 2, lastSuccess: null });
    expect(await fs.readFile(path.join(tablet.root, 'theme.svg'), 'utf8')).toBe('<svg>unrelated</svg>');
    expect(await fs.readFile(path.join(tablet.root, 'gone.js'), 'utf8')).toBe('old()');
    const details = await tablet.engine.conflictDetails();
    expect(details!.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'theme.svg', action: 'modify', hasBase: false }),
      expect.objectContaining({ path: 'gone.js', action: 'delete', hasBase: false }),
    ]));
    expect((await new OrderedSyncTransport([endpoint], token).select()).files['gone.js'].hash).toBeNull();
  });

  it('merges edits to different paragraphs and keeps overlapping edits as a reviewable conflict', async () => {
    const first = await client('first'); const second = await client('second');
    const original = '# 标题\r\n\r\n第一段\r\n\r\n第二段\r\n\r\n第三段\r\n';
    await first.write('note.md', original); await first.engine.run(); await second.engine.run();
    await first.write('note.md', original.replace('第一段', '第一段（电脑）')); expect((await first.engine.run()).phase).toBe('idle');
    await second.write('note.md', original.replace('第三段', '第三段（平板）'));
    const merged = await second.engine.run();
    expect(merged.phase).toBe('idle'); expect(merged.message).toContain('合并 1');
    const expected = '# 标题\r\n\r\n第一段（电脑）\r\n\r\n第二段\r\n\r\n第三段（平板）\r\n';
    expect(await fs.readFile(path.join(second.root, 'note.md'), 'utf8')).toBe(expected);
    expect((await first.engine.run()).phase).toBe('idle');
    expect(await fs.readFile(path.join(first.root, 'note.md'), 'utf8')).toBe(expected);

    await first.write('note.md', expected.replace('第二段', '第二段 A')); await first.write('other.md', '远端');
    await first.engine.run();
    await second.write('note.md', expected.replace('第二段', '第二段 B')); await second.write('other.md', '本机');
    const conflict = await second.engine.run();
    expect(conflict.phase).toBe('conflict'); expect(conflict.conflictCount).toBe(2);
    const details = await second.engine.conflictDetails();
    const note = details!.files.find(file => file.path === 'note.md')!;
    expect(note).toMatchObject({ action: 'modify', hasBase: true, localChanged: true, remoteChanged: true, text: true });
    expect(note.diff!.filter(block => block.type !== 'same')).toEqual([{ type: 'del', lines: ['第二段 B'] }, { type: 'add', lines: ['第二段 A'] }]);
    await expect(second.engine.resolveConflict({ 'missing.md': 'remote' })).rejects.toThrow('请选择');
    const partial = await second.engine.resolveConflict({ 'note.md': 'remote' });
    expect(partial.phase).toBe('conflict'); expect(partial.conflictCount).toBe(1);
    expect((await second.engine.conflictDetails())!.files.map(file => file.path)).toEqual(['other.md']);
    expect((await second.engine.resolveConflict({ 'other.md': 'local' })).phase).toBe('idle');
    expect(await fs.readFile(path.join(second.root, 'note.md'), 'utf8')).toBe(expected.replace('第二段', '第二段 A'));
    expect(await fs.readFile(path.join(second.root, 'other.md'), 'utf8')).toBe('本机');
    await first.engine.run();
    expect(await fs.readFile(path.join(first.root, 'other.md'), 'utf8')).toBe('本机');
  });

  it('keeps synchronizing every other file while one file waits in conflict', async () => {
    const first = await client('first'); const second = await client('second');
    await first.write('held.png', Buffer.from([0])); await first.engine.run(); await second.engine.run();
    await first.write('held.png', Buffer.from([1])); await first.engine.run();
    await second.write('held.png', Buffer.from([2]));
    expect((await second.engine.run()).conflictCount).toBe(1);
    await first.write('from-mac.md', '电脑上的新内容'); expect((await first.engine.run()).phase).toBe('idle');
    await second.write('from-tablet.md', '平板上的新内容');
    const status = await second.engine.run();
    expect(status).toMatchObject({ phase: 'conflict', conflictCount: 1 }); expect(status.message).toContain('其他文件已同步');
    expect(await fs.readFile(path.join(second.root, 'from-mac.md'), 'utf8')).toBe('电脑上的新内容');
    expect(await fs.readFile(path.join(second.root, 'held.png'))).toEqual(Buffer.from([2]));
    await first.engine.run(); expect(await fs.readFile(path.join(first.root, 'from-tablet.md'), 'utf8')).toBe('平板上的新内容');
    expect((await second.engine.resolveConflict('local')).phase).toBe('idle');
    await first.engine.run(); expect(await fs.readFile(path.join(first.root, 'held.png'))).toEqual(Buffer.from([2]));
  });

  it('still uploads local edits while the editing gate refuses incoming files', async () => {
    let open = false;
    const busy = Object.assign(new Error('fixture editor has unsaved text'), { status: 409 });
    const first = await client('first');
    const second = await client('second', {}, async work => { if (!open) throw busy; return work(); });
    await first.write('remote.md', '服务器'); await first.engine.run();
    await second.write('local.md', '本机');
    const refused = await second.engine.run();
    expect(refused.phase).toBe('recovery'); expect(refused.message).toContain('unsaved');
    await expect(fs.access(path.join(second.root, 'remote.md'))).rejects.toThrow();
    await first.engine.run(); expect(await fs.readFile(path.join(first.root, 'local.md'), 'utf8')).toBe('本机');
    await second.write('later.md', '稍后'); expect((await second.engine.run()).phase).toBe('recovery');
    await first.engine.run(); expect(await fs.readFile(path.join(first.root, 'later.md'), 'utf8')).toBe('稍后');
    open = true;
    expect((await second.engine.run()).phase).toBe('idle');
    expect(await fs.readFile(path.join(second.root, 'remote.md'), 'utf8')).toBe('服务器');
  });

  it('turns only the journaled files edited after planning into conflicts', async () => {
    const first = await client('first'); await first.write('a.md', 'A 服务器'); await first.write('b.md', 'B 服务器'); await first.engine.run();
    const second = await client('second', {}, async () => { throw new Error('fixture closed before publication'); });
    expect((await second.engine.run()).phase).toBe('recovery');
    await second.write('a.md', 'A 本机');
    const restarted = new FileSyncEngine(second.root, second.state, second.preferences, { publish: async work => work(), changed: async () => {} });
    await restarted.recover();
    expect(restarted.status()).toMatchObject({ phase: 'conflict', conflictCount: 1 });
    expect(await fs.readFile(path.join(second.root, 'a.md'), 'utf8')).toBe('A 本机');
    expect(await fs.readFile(path.join(second.root, 'b.md'), 'utf8')).toBe('B 服务器');
  });

  it('keeps an unrelated journal while choosing a conflict and replays it after restart', async () => {
    let blocked = new Set<string>();
    const first = await client('first');
    const second = await client('second', {}, async work => work(blocked));
    await first.write('choice.md', 'base'); await first.engine.run(); await second.engine.run();
    await first.write('choice.md', 'remote choice'); await first.write('incoming.md', 'deferred'); await first.engine.run();
    await second.write('choice.md', 'local choice');
    blocked = new Set(['incoming.md']);
    const status = await second.engine.run();
    expect(status).toMatchObject({ phase: 'recovery', pendingIncoming: 1, conflictCount: 1 });
    const selected = await second.engine.resolveConflict({ 'choice.md': 'remote' });
    expect(selected).toMatchObject({ phase: 'recovery', pendingIncoming: 1, conflictCount: 0, lastSuccess: status.lastSuccess });
    const checkpoint = JSON.parse(await fs.readFile(path.join(second.state, 'checkpoint.json'), 'utf8'));
    expect(checkpoint.incoming.map((item: { path: string }) => item.path)).toEqual(['incoming.md']);
    expect(await fs.readFile(path.join(second.root, 'choice.md'), 'utf8')).toBe('remote choice');
    const restarted = new FileSyncEngine(second.root, second.state, second.preferences, { publish: async work => work(), changed: async () => {} });
    await restarted.recover();
    expect(await fs.readFile(path.join(second.root, 'incoming.md'), 'utf8')).toBe('deferred');
    expect((await restarted.run()).phase).toBe('idle');
  });

  it('defers both ends of a dirty rename and publishes independent groups', async () => {
    let blocked = new Set<string>();
    const first = await client('first');
    const second = await client('second', {}, async work => work(blocked));
    await first.write('old.md', 'rename'); await first.engine.run(); await second.engine.run();
    await fs.rename(path.join(first.root, 'old.md'), path.join(first.root, 'new.md'));
    first.engine.noteChanged('old.md'); first.engine.noteChanged('new.md');
    await first.write('unrelated.md', 'independent'); await first.engine.run();
    blocked = new Set(['old.md']);
    expect(await second.engine.run()).toMatchObject({ phase: 'recovery', pendingIncoming: 2 });
    expect(await fs.readFile(path.join(second.root, 'old.md'), 'utf8')).toBe('rename');
    await expect(fs.access(path.join(second.root, 'new.md'))).rejects.toThrow();
    expect(await fs.readFile(path.join(second.root, 'unrelated.md'), 'utf8')).toBe('independent');
    blocked.clear();
    expect(await second.engine.run()).toMatchObject({ phase: 'idle', pendingIncoming: 0 });
    await expect(fs.access(path.join(second.root, 'old.md'))).rejects.toThrow();
    expect(await fs.readFile(path.join(second.root, 'new.md'), 'utf8')).toBe('rename');
  });

  it('publishes a file-to-directory change and its inverse as grouped shapes', async () => {
    const first = await client('first'); const second = await client('second');
    await first.write('shape', 'single'); await first.engine.run(); await second.engine.run();
    await fs.unlink(path.join(first.root, 'shape')); first.engine.noteChanged('shape');
    await first.write('shape/nested.md', 'inside');
    expect((await first.engine.run()).phase).toBe('idle');
    expect((await second.engine.run()).phase).toBe('idle');
    expect(await fs.readFile(path.join(second.root, 'shape/nested.md'), 'utf8')).toBe('inside');
    await fs.unlink(path.join(first.root, 'shape/nested.md'));
    await fs.rmdir(path.join(first.root, 'shape'));
    first.engine.noteChanged('shape/nested.md'); await first.write('shape', 'single again');
    expect((await first.engine.run()).phase).toBe('idle');
    expect((await second.engine.run()).phase).toBe('idle');
    expect(await fs.readFile(path.join(second.root, 'shape'), 'utf8')).toBe('single again');
  });

  it('restarts cleanly after resolving part of a conflict recorded behind the checkpoint revision', async () => {
    const first = await client('first'); const second = await client('second');
    await first.write('a.md', 'a'); await first.write('b.md', 'b'); await first.engine.run(); await second.engine.run();
    await first.write('a.md', 'a 电脑'); await first.write('b.md', 'b 电脑'); await first.engine.run();
    await second.write('a.md', 'a 平板\n'); await second.write('b.md', 'b 平板\n');
    expect((await second.engine.run()).conflictCount).toBe(2);
    // Older builds kept the revision from before the conflict, as on OMEN (445 vs. 469).
    const filename = path.join(second.state, 'checkpoint.json');
    const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
    saved.revision = 1;
    delete saved.queuedThrough;
    delete saved.remoteSnapshot;
    await fs.writeFile(filename, JSON.stringify(saved));
    const restart = () => new FileSyncEngine(second.root, second.state, second.preferences, { publish: async work => work(), changed: async () => {} });
    await first.write('c.md', '新文件'); await first.engine.run();
    expect((await restart().resolveConflict({ 'a.md': 'remote' })).conflictCount).toBe(1);
    const resolved = JSON.parse(await fs.readFile(filename, 'utf8'));
    expect(resolved.revision).toBeGreaterThan(resolved.base['a.md'].version);
    expect(resolved.base['c.md']).toBeUndefined();
    expect(resolved.conflict.changes.map((item: { path: string }) => item.path)).toEqual(['b.md']);
    expect(resolved.conflict.id).toBe(saved.conflict.id);
    expect((await restart().run()).phase).toBe('conflict');
    expect(await fs.readFile(path.join(second.root, 'c.md'), 'utf8')).toBe('新文件');
    // A checkpoint already written with the inconsistency loads and keeps synchronizing.
    resolved.revision = 1; await fs.writeFile(filename, JSON.stringify(resolved));
    const engine = restart();
    expect((await engine.run()).phase).toBe('conflict');
    expect(await fs.readFile(path.join(second.root, 'c.md'), 'utf8')).toBe('新文件');
    expect((await engine.resolveConflict({ 'b.md': 'local' })).phase).toBe('idle');

    // Repairing the watermark still rejects structurally invalid baselines.
    resolved.base['A.md'] = resolved.base['a.md'];
    await fs.writeFile(filename, JSON.stringify(resolved));
    await expect(restart().load()).rejects.toThrow('Invalid sync entry');
  });

  it('retries the same durable operation after losing a successful commit response', async () => {
    const first = await client('first'); await first.write('note.md', 'retained');
    const original = globalThis.fetch; let lost = false; const operations: string[] = [];
    const mocked = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      const response = await original(input, options);
      if (String(input).endsWith('/commit')) {
        operations.push(JSON.parse(String(options?.body)).operationId);
        if (!lost) { lost = true; await response.text(); throw new TypeError('fixture response lost'); }
      }
      return response;
    });
    expect((await first.engine.run()).phase).toBe('error');
    const checkpoint = JSON.parse(await fs.readFile(path.join(first.state, 'checkpoint.json'), 'utf8'));
    expect(checkpoint.outbox.operationId).toBe(operations[0]);
    const restarted = new FileSyncEngine(first.root, first.state, first.preferences, { publish: async work => work(), changed: async () => {} });
    expect((await restarted.run()).phase).toBe('idle'); expect(operations).toEqual([operations[0], operations[0]]);
    mocked.mockRestore();
    const manifest = await new OrderedSyncTransport([endpoint], token).select(); expect(manifest.revision).toBe(1);
  });

  it('recovers incoming files before network access and retains edits made after interruption', async () => {
    const first = await client('first'); await first.write('note.md', 'server copy'); await first.engine.run();
    const second = await client('second', {}, async () => { throw new Error('fixture closed before publication'); });
    expect((await second.engine.run()).phase).toBe('recovery');
    await second.write('note.md', 'new local edit');
    const offline = new FileSyncEngine(second.root, second.state, { ...second.preferences, endpoints: ['http://127.0.0.1:1'] }, { publish: async work => work(), changed: async () => {} });
    const network = vi.spyOn(globalThis, 'fetch');
    await offline.recover(); expect(network).not.toHaveBeenCalled();
    const conflict = offline.status(); expect(conflict.phase).toBe('conflict');
    expect(await fs.readFile(path.join(second.root, 'note.md'), 'utf8')).toBe('new local edit');
    expect(await fs.readFile(path.join(conflict.conflictDirectory!, 'remote/note.md'), 'utf8')).toBe('server copy');
  });

  it('recovers an interrupted download journal without an available hub', async () => {
    const first = await client('first'); await first.write('note.md', 'complete'); await first.engine.run();
    const second = await client('second', {}, async () => { throw new Error('fixture interrupted'); }); await second.engine.run();
    const restarted = new FileSyncEngine(second.root, second.state, second.preferences, { publish: async work => work(), changed: async () => {} });
    const network = vi.spyOn(globalThis, 'fetch'); await restarted.recover(); expect(network).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(second.root, 'note.md'), 'utf8')).toBe('complete');
  });

  it('keeps offline edits and discovers changes after restarting', async () => {
    const first = await client('first', { endpoints: ['http://127.0.0.1:1'] }); await first.write('note.md', 'offline');
    expect((await first.engine.run()).phase).toBe('error');
    expect(await fs.readFile(path.join(first.root, 'note.md'), 'utf8')).toBe('offline');
    const restarted = new FileSyncEngine(first.root, first.state, { ...first.preferences, endpoints: [endpoint] }, { publish: async work => work(), changed: async () => {} });
    expect((await restarted.run()).phase).toBe('idle');
    const second = await client('second'); await second.engine.run(); expect(await fs.readFile(path.join(second.root, 'note.md'), 'utf8')).toBe('offline');
  });

  it('refuses content changes that reuse an already acknowledged remote version', async () => {
    const first = await client('first'); await first.write('note.md', 'acknowledged'); await first.engine.run();
    const original = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (/\/changes\?|\/manifest\/pages\?/.test(String(input))) return new Response(null, { status: 404 });
      const response = await original(input, options);
      if (!String(input).endsWith('/manifest')) return response;
      const manifest = await response.json() as { files: Record<string, { hash: string; version: number }> };
      manifest.files['note.md'].hash = digest('corrupted same version');
      return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } });
    });
    expect((await first.engine.run()).message).toContain('已确认版本不一致');
    expect(await fs.readFile(path.join(first.root, 'note.md'), 'utf8')).toBe('acknowledged');
  });

  it('excludes machine configuration and Git metadata; refuses Syncthing and symlink roots', async () => {
    const first = await client('first');
    for (const name of ['.git/config', '.shale/workspace.json', '.shale/plugins/secret.json', '.trash/old.md']) await first.write(name, 'private');
    await first.write('.shale/snippets/theme.css', 'native'); await first.write('note.md', 'allowed');
    expect((await first.engine.run()).phase).toBe('idle');
    const manifest = await new OrderedSyncTransport([endpoint], token).select();
    expect(Object.keys(manifest.files).sort()).toEqual(['.shale', '.shale/snippets', '.shale/snippets/theme.css', 'note.md']);
    await fs.writeFile(path.join(first.root, '.stfolder'), ''); expect((await first.engine.run()).message).toContain('Syncthing');
    const disabled = new FileSyncEngine(first.root, first.state, { ...first.preferences, enabled: false }, { publish: async work => work(), changed: async () => {} });
    await expect(disabled.recover()).resolves.toBeUndefined();
    const linked = await client('linked'); await fs.symlink(first.root, path.join(linked.root, 'junction'), process.platform === 'win32' ? 'junction' : 'dir');
    expect((await linked.engine.run()).message).toMatch(/符号链接|联接|escapes vault/);
  });
});

describe('ordered addresses and protocol guards', () => {
  it('starts at the first address on every attempt without promoting a previous success', async () => {
    let unavailable = true; const visits: string[] = [];
    const proxy = http.createServer((request, response) => {
      visits.push('first');
      if (unavailable) { response.writeHead(503).end(); return; }
      const upstream = http.request(`${endpoint}manifest`, { headers: { authorization: `Bearer ${token}` } }, reply => { response.writeHead(reply.statusCode!); reply.pipe(response); }); upstream.end();
    });
    const address = await listen(proxy); closes.push(() => new Promise<void>(resolve => proxy.close(() => resolve())));
    const transport = new OrderedSyncTransport([address, endpoint], token);
    await transport.select(); expect(transport.selected).toBe(endpoint);
    unavailable = false; await transport.select(); expect(transport.selected).toBe(address); expect(visits).toEqual(['first', 'first']);
  });

  it('does not fall back after auth failure or workspace mismatch', async () => {
    const rejected = http.createServer((_request, response) => response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"unauthorized"}'));
    const address = await listen(rejected); closes.push(() => new Promise<void>(resolve => rejected.close(() => resolve())));
    const network = vi.spyOn(globalThis, 'fetch');
    await expect(new OrderedSyncTransport([address, endpoint], token).select()).rejects.toMatchObject({ status: 401 }); expect(network).toHaveBeenCalledTimes(1);
    network.mockClear();
    await expect(new OrderedSyncTransport([endpoint, await hub('other')], token).select({ workspaceId: randomUUID(), revision: 0 })).rejects.toThrow('身份');
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('keeps explicit HTTPS ports and rejects credential URLs, public HTTP and unsafe paths', () => {
    expect(normalizeSyncEndpoint('192.168.1.5')).toBe(`http://192.168.1.5:18744${prefix}/`);
    expect(normalizeSyncEndpoint('https://example.com')).toBe(`https://example.com${prefix}/`);
    expect(normalizeSyncEndpoint('127.0.0.1:80')).toBe(`http://127.0.0.1${prefix}/`);
    expect(normalizeSyncEndpoint(`127.0.0.1${prefix}/`)).toBe(`http://127.0.0.1:18744${prefix}/`);
    for (const address of ['http://8.8.8.8', 'https://secret@example.com', 'https://example.com?token=private']) expect(() => normalizeSyncEndpoint(address)).toThrow();
    for (const name of ['../note.md', '/note.md', '.git/config', 'a/CON.png', '__proto__', 'a\\b', 'x\0.md']) expect(validPath(name)).toBe(false);
  });

  it('uses exact CAS, durable receipts and rejects invalid blob contents', async () => {
    const transport = new OrderedSyncTransport([endpoint], token); const manifest = await transport.select();
    const wrong = await fetch(`${endpoint}blobs/${digest('expected')}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: 'wrong' }); expect(wrong.status).toBe(422);
    const operation = { workspaceId: manifest.workspaceId, deviceId: randomUUID(), operationId: randomUUID(), changes: [{ path: 'note.md', hash: null, expectedVersion: 0 }] };
    const receipt = await transport.commit(operation); expect(await transport.commit(operation)).toEqual(receipt);
    await expect(transport.commit({ ...operation, operationId: randomUUID() })).rejects.toMatchObject({ status: 409 });
    await expect(transport.commit({ ...operation, changes: [{ path: '../escape', hash: null, expectedVersion: 0 }] })).rejects.toMatchObject({ status: 400 });
    const origin = await fetch(`${endpoint}manifest`, { headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } }); expect(origin.status).toBe(400);
  });
});
