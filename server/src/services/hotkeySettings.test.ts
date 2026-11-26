import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { emptyHotkeys, resolveHotkeys, hotkeyLabel } from '@shale/search-core';
const state = vi.hoisted(() => ({ root: '' }));
vi.mock('./vaultFile.js', async original => ({ ...await original<typeof import('./vaultFile.js')>(), getVaultRoot: async () => state.root }));
import { readHotkeys, patchHotkeys } from './hotkeySettings';
let directory: string, filename: string;
const base = path.join(os.tmpdir(), '.agents');
beforeEach(async () => {
  await fs.mkdir(base, { recursive: true }); directory = await fs.mkdtemp(path.join(base, 'shale-hotkeys-'));
  state.root = path.join(directory, 'vault'); await fs.mkdir(path.join(state.root, '.shale'), { recursive: true });
  filename = path.join(state.root, '.shale/hotkeys.jsonc');
});
afterEach(async () => { if (path.dirname(directory) === base) await fs.rm(directory, { recursive: true, force: true }); });

it('uses defaults without writing, then incoming file bytes win and stale revisions are rejected', async () => {
  const first = await readHotkeys();
  expect(first.bindings).toEqual({}); await expect(fs.stat(filename)).rejects.toMatchObject({ code: 'ENOENT' });
  const saved = await patchHotkeys({ vault: first.vault, revision: first.revision, command: 'save', platform: 'mac',
    bindings: [{ modifiers: ['PhysicalCtrl'], key: 'K' }] });
  expect(hotkeyLabel(resolveHotkeys(saved, 'save', [], true)[0], true)).toBe('Control + K');
  const remote = { ...emptyHotkeys(), bindings: { save: [{ modifiers: ['Ctrl'], key: 'O' }] },
    platforms: { mac: { save: [{ modifiers: ['Meta'], key: 'L' }] } } };
  const bytes = JSON.stringify(remote); await fs.writeFile(filename, bytes);
  const next = await readHotkeys();
  expect(next.bindings).toEqual(remote.bindings);
  expect(hotkeyLabel(resolveHotkeys(next, 'save', [], true)[0], true)).toBe('⌘ + L');
  expect(await fs.readFile(filename, 'utf8')).toBe(bytes);
  await expect(patchHotkeys({ vault: saved.vault, revision: saved.revision, command: 'save', platform: 'mac', bindings: [] })).rejects.toMatchObject({ status: 409 });
});

it('serializes per-platform edits, preserves the other column, supports disable and restore inheritance', async () => {
  const first = await readHotkeys();
  await Promise.all([
    patchHotkeys({ vault: first.vault, command: 'save', platform: 'windows', bindings: [{ modifiers: ['Ctrl'], key: 'K' }] }),
    patchHotkeys({ vault: first.vault, command: 'save', platform: 'mac', bindings: [] }),
  ]);
  let current = await readHotkeys();
  expect(current.platforms?.windows?.save[0].key).toBe('K'); expect(current.platforms?.mac?.save).toEqual([]);
  current = await patchHotkeys({ vault: current.vault, revision: current.revision, command: 'save', platform: 'mac', bindings: null });
  expect(hotkeyLabel(resolveHotkeys(current, 'save', [], true)[0], true)).toBe('⌘ + K');
  const restored = JSON.parse(await fs.readFile(filename, 'utf8')); expect(restored.platforms.windows.save[0].key).toBe('K');
});

it('does not overwrite invalid synced bytes or accept a stale Vault identity', async () => {
  const first = await readHotkeys(); await fs.writeFile(filename, '{invalid');
  await expect(readHotkeys()).rejects.toThrow(); expect(await fs.readFile(filename, 'utf8')).toBe('{invalid');
  await fs.writeFile(filename, JSON.stringify({ ...emptyHotkeys(), migration: 'old' }));
  await expect(readHotkeys()).rejects.toThrow('不支持的字段');
  await fs.writeFile(filename, JSON.stringify(emptyHotkeys()));
  await expect(patchHotkeys({ vault: 'other-vault', command: 'save', bindings: [] })).rejects.toMatchObject({ status: 409 });
  expect(first.vault).not.toBe('other-vault');
});
