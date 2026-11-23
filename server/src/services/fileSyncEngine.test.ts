import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { FileSyncEngine } from './fileSyncEngine.js';
import { OrderedSyncTransport, normalizeSyncEndpoint } from './syncTransport.js';
import { createSyncServer } from '../../../sync-server/server.mjs';
import { prefix, validPath } from '../../../sync-server/protocol.mjs';
import { normalizeHotkeyPreferences, resolveHotkeys, hotkeyLabel } from '@shale/search-core';
import type { FileSyncPreferences } from '../contracts/fileSync.js';

const token = 'fixture-only-token-not-a-live-credential-123456';
let directory: string;
let closes: (() => Promise<void>)[];
let endpoint: string;
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}/`;
}

async function hub(name = 'hub'): Promise<string> {
  const service = await createSyncServer({ root: path.join(directory, name), token });
  closes.push(() => service.close());
  return listen(service.server);
}

async function client(name: string, options: Partial<FileSyncPreferences> = {}, publish = async <T>(work: () => Promise<T>) => work()) {
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

describe('native file synchronization', () => {
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

  it('fast-forwards a first connection whose stale files the server already knows, and still stops on unknown work', async () => {
    const first = await client('first');
    await first.write('theme.svg', '<svg>old</svg>'); await first.write('gone.js', 'old()'); await first.write('kept.md', 'base\n');
    await first.engine.run();
    await first.write('theme.svg', '<svg>new</svg>'); await fs.rm(path.join(first.root, 'gone.js')); first.engine.noteChanged('gone.js');
    expect((await first.engine.run()).phase).toBe('idle');
    // A device restored from an older copy (no checkpoint) holding only previously synchronized bytes.
    const tablet = await client('tablet');
    await tablet.write('theme.svg', '<svg>old</svg>'); await tablet.write('gone.js', 'old()'); await tablet.write('kept.md', 'base\n');
    const status = await tablet.engine.run();
    expect(status.phase).toBe('idle');
    expect(status.message).toContain('自动处理 2 个文件');
    expect(await fs.readFile(path.join(tablet.root, 'theme.svg'), 'utf8')).toBe('<svg>new</svg>');
    await expect(fs.access(path.join(tablet.root, 'gone.js'))).rejects.toThrow();
    expect(status.recentResolutions.map(item => [item.path, item.kind]).sort()).toEqual([['gone.js', 'deleted'], ['theme.svg', 'fast-forward']]);
    const recovery = path.join(tablet.state, 'recovery', new Date().toISOString().slice(0, 10));
    expect(await fs.readFile(path.join(recovery, 'theme.svg'), 'utf8')).toBe('<svg>old</svg>');
    // Unknown local bytes without a base remain a manual decision.
    const fresh = await client('fresh');
    await fresh.write('theme.svg', '<svg>never synchronized</svg>');
    const conflict = await fresh.engine.run();
    expect(conflict.phase).toBe('conflict'); expect(conflict.conflictCount).toBe(1);
    const details = await fresh.engine.conflictDetails();
    expect(details!.files[0]).toMatchObject({ path: 'theme.svg', action: 'modify', hasBase: false, text: true });
    expect(details!.files[0].diff).toEqual([{ type: 'del', lines: ['<svg>never synchronized</svg>'] }, { type: 'add', lines: ['<svg>new</svg>'] }]);
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
    expect(Object.keys(manifest.files).sort()).toEqual(['.shale/snippets/theme.css', 'note.md']);
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
