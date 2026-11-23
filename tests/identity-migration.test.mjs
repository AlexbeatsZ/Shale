import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrateDesktopProfile, migrateVaultConfiguration, migrateRuntimeSettings } from '../scripts/identity-migration.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '.agents/shale-migration-'));
  t.after(() => fs.rm(root, { recursive: true, force: true })); return root;
}
test('moves the entire desktop profile and refuses ambiguous dual profiles', async t => {
  const root = await fixture(t), old = path.join(root, '@webobsidian/desktop');
  await fs.mkdir(old, { recursive: true }); await fs.writeFile(path.join(old, 'Local State'), 'encrypted-browser-state');
  const target = migrateDesktopProfile(root);
  assert.equal(await fs.readFile(path.join(target, 'Local State'), 'utf8'), 'encrypted-browser-state');
  assert.equal(migrateDesktopProfile(root), target);
  await fs.mkdir(old, { recursive: true });
  assert.throws(() => migrateDesktopProfile(root), /Both Shale/);
});
test('flattens legacy native configuration, preserves scripts and survives a second run', async t => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, '.obsidian/webobsidian/snippets'), { recursive: true });
  await fs.mkdir(path.join(root, '.obsidian/plugins/example'), { recursive: true });
  await fs.writeFile(path.join(root, '.obsidian/webobsidian/sync.jsonc'), '// keep comments\n{"endpoints":["http://127.0.0.1:18744/webobsidian-sync/v1/"]}');
  await fs.writeFile(path.join(root, '.obsidian/webobsidian/snippets/user.js'), 'const obsidian = "user-authored";');
  await fs.writeFile(path.join(root, '.obsidian/plugins/example/main.js'), 'require("obsidian")');
  await migrateVaultConfiguration(root); await migrateVaultConfiguration(root);
  assert.match(await fs.readFile(path.join(root, '.shale/sync.jsonc'), 'utf8'), /keep comments[\s\S]*shale-sync/);
  assert.equal(await fs.readFile(path.join(root, '.shale/snippets/user.js'), 'utf8'), 'const obsidian = "user-authored";');
  assert.equal(await fs.readFile(path.join(root, '.shale/plugins/example/main.js'), 'utf8'), 'require("obsidian")');
  await assert.rejects(fs.stat(path.join(root, '.obsidian')), { code: 'ENOENT' });
});
test('preflights all collisions without moving unrelated files', async t => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, '.obsidian/webobsidian'), { recursive: true }); await fs.mkdir(path.join(root, '.shale'));
  await fs.writeFile(path.join(root, '.obsidian/webobsidian/a.jsonc'), 'old');
  await fs.writeFile(path.join(root, '.obsidian/webobsidian/z.jsonc'), 'old-z');
  await fs.writeFile(path.join(root, '.shale/z.jsonc'), 'new-z');
  await assert.rejects(migrateVaultConfiguration(root), /collision/);
  assert.equal(await fs.readFile(path.join(root, '.obsidian/webobsidian/a.jsonc'), 'utf8'), 'old');
  assert.equal(await fs.readFile(path.join(root, '.shale/z.jsonc'), 'utf8'), 'new-z');
});
test('rejects links and resumes an interrupted nested-directory migration', async t => {
  const root = await fixture(t), target = path.join(root, 'outside'); await fs.mkdir(target);
  await fs.symlink(target, path.join(root, '.obsidian'));
  await assert.rejects(migrateVaultConfiguration(root), /real directory/); await fs.unlink(path.join(root, '.obsidian'));
  await fs.mkdir(path.join(root, '.shale/webobsidian'), { recursive: true });
  await fs.writeFile(path.join(root, '.shale/webobsidian/hotkeys.jsonc'), '{}');
  await migrateVaultConfiguration(root); assert.equal(await fs.readFile(path.join(root, '.shale/hotkeys.jsonc'), 'utf8'), '{}');
});
test('migrates persisted themes and app paths while preserving authentication and source', async t => {
  const root = await fixture(t), file = path.join(root, 'settings.json');
  await fs.writeFile(file, JSON.stringify({ ui: { theme: 'obsidian-dark' }, secret: 'same-secret', writing: { path: '.obsidian/webobsidian/snippets/user.js', source: 'const obsidian = 1;' } }));
  await migrateRuntimeSettings(root); const data = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(data.ui.theme, 'shale-dark'); assert.equal(data.secret, 'same-secret');
  assert.equal(data.writing.path, '.shale/snippets/user.js'); assert.equal(data.writing.source, 'const obsidian = 1;');
});
test('merges disjoint native and CSS snippet directories without altering contents', async t => {
  const root = await fixture(t);
  for (const directory of ['.obsidian/snippets', '.obsidian/webobsidian/snippets']) await fs.mkdir(path.join(root, directory), { recursive: true });
  await fs.writeFile(path.join(root, '.obsidian/snippets/Theme.css'), '.cm-s-obsidian { color: red; }');
  await fs.writeFile(path.join(root, '.obsidian/webobsidian/snippets/personal.js'), 'const user = 1;');
  await migrateVaultConfiguration(root);
  assert.equal(await fs.readFile(path.join(root, '.shale/snippets/Theme.css'), 'utf8'), '.cm-s-obsidian { color: red; }');
  assert.equal(await fs.readFile(path.join(root, '.shale/snippets/personal.js'), 'utf8'), 'const user = 1;');
});
