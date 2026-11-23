import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { emptyHotkeys, resolveHotkeys, hotkeyLabel } from '@webobsidian/search-core';
const state = vi.hoisted(() => ({ root: '', settings: {} as any }));
vi.mock('./settings.js', () => ({ getSettings: async () => state.settings }));
vi.mock('./vaultFile.js', async original => ({ ...await original<typeof import('./vaultFile.js')>(), getVaultRoot: async () => state.root }));
import { readHotkeys, patchHotkeys } from './hotkeySettings';
let directory: string, filename: string;
const base = path.join(os.tmpdir(), '.agents');
beforeEach(async () => {
  await fs.mkdir(base, { recursive: true }); directory = await fs.mkdtemp(path.join(base, 'webobsidian-hotkeys-'));
  state.root = path.join(directory, 'vault'); await fs.mkdir(state.root);
  state.settings = { vault: { path: state.root }, hotkeys: {}, search: { chinese: { shortcuts: {} } }, writing: {} };
  filename = path.join(state.root, '.obsidian/webobsidian/hotkeys.jsonc');
});
afterEach(async () => { if (path.dirname(directory) === base) await fs.rm(directory, { recursive: true, force: true }); });

it('migrates once, then incoming file bytes win over stale device-local bindings', async () => {
  state.settings.hotkeys[state.root] = { ...emptyHotkeys(), bindings: { save: [{ modifiers: ['Ctrl'], key: 'S' }] } };
  const first = await readHotkeys();
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
  await fs.writeFile(filename, JSON.stringify(emptyHotkeys()));
  await expect(patchHotkeys({ vault: 'other-vault', command: 'save', bindings: [] })).rejects.toMatchObject({ status: 409 });
  expect(first.vault).not.toBe('other-vault');
});

it('imports existing seven-hash heading bindings and keeps the original Obsidian file unchanged', async () => {
  const original = JSON.stringify({ 'obsidian-heading-shifter:apply-heading7': [{ modifiers: ['Ctrl', 'Alt'], key: '7' }] });
  await fs.mkdir(path.join(state.root, '.obsidian'), { recursive: true });
  await fs.writeFile(path.join(state.root, '.obsidian/hotkeys.json'), original);
  expect((await readHotkeys()).bindings['editor:set-heading-7'][0].key).toBe('7');
  expect(await fs.readFile(path.join(state.root, '.obsidian/hotkeys.json'), 'utf8')).toBe(original);
});
