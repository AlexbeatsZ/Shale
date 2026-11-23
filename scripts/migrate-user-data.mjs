import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { canonicalConfigurationPath, migrateRuntimeSettings, migrateVaultConfiguration } from './identity-migration.mjs';

export function persistedVaultKey(root, platform = process.platform) {
  return platform === 'win32' ? path.win32.resolve(root).toLowerCase() : path.resolve(root);
}

export async function migrateNativeStyles(root) {
  const directory = path.join(root, '.shale', 'snippets');
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error('Native styles may not use symbolic links');
    if (!entry.isFile() || !entry.name.endsWith('.css')) continue;
    const file = path.join(directory, entry.name), original = await fs.readFile(file, 'utf8');
    const updated = original.replace(/\.cm-s-obsidian(?![\w-])/g, '.cm-s-shale')
      .replaceAll('Native WebObsidian', 'Native Shale').replaceAll('lib/obsidian/ui.ts', 'lib/shale/ui.ts');
    if (updated !== original) {
      const temporary = file + '.shale-migration.tmp';
      await fs.writeFile(temporary, updated, { mode: (await fs.stat(file)).mode });
      await fs.rename(temporary, file);
    }
  }
}

export async function migrateUserData(profile, oldParent, newParent) {
  const windows = process.platform === 'win32';
  const pathKey = value => persistedVaultKey(value);
  const remap = value => {
    const separator = value.includes('\\') ? '\\' : '/';
    const old = oldParent.replaceAll('\\', separator).replaceAll('/', separator);
    const next = newParent.replaceAll('\\', separator).replaceAll('/', separator);
    const probe = windows ? value.toLowerCase() : value, previous = windows ? old.toLowerCase() : old;
    return probe === previous || probe.startsWith(previous + separator) ? next + value.slice(old.length) : value;
  };
  function rewrite(value, configurationPaths = true) {
    if (Array.isArray(value)) return value.map(item => rewrite(item, configurationPaths));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [remap(key), rewrite(child, configurationPaths)]));
    if (typeof value !== 'string') return value;
    const next = remap(value);
    if (!configurationPaths) return next;
    if (next === 'obsidian-dark') return 'shale-dark'; if (next === 'obsidian-light') return 'shale-light';
    return canonicalConfigurationPath(next).replaceAll('/.obsidian/webobsidian/', '/.shale/').replaceAll('/.obsidian/', '/.shale/');
  }
  async function json(file, configurationPaths = true) {
    let original;
    try { original = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    const data = JSON.parse(original), updated = rewrite(data, configurationPaths);
    if (path.basename(file) === 'checkpoint.json' && typeof updated.root === 'string') updated.root = pathKey(updated.root);
    const text = JSON.stringify(updated, null, 2);
    if (JSON.stringify(data) !== JSON.stringify(updated)) { const temporary = file + '.shale-migration.tmp'; await fs.writeFile(temporary, text, { mode: 0o600 }); await fs.rename(temporary, file); }
    return updated;
  }
  const data = path.join(profile, 'server-data');
  const config = await json(path.join(profile, 'desktop-config.json'));
  const settings = await json(path.join(data, 'settings.json'));
  for (const name of ['uistate.json', 'mcp-endpoint.json']) await json(path.join(data, name));
  const roots = new Map();
  for (const value of [config?.vaultPath, settings?.vault?.path]) if (value) {
    const previous = value.replace(newParent, oldParent);
    roots.set(previous, value);
  }
  const entries = async directory => fs.readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const hashed = (root, length = 64) => createHash('sha256').update(root).digest('hex').slice(0, length);
  for (const group of ['workspaces', 'userscripts', 'file-sync']) {
    const directory = path.join(data, group);
    for (const entry of await entries(directory)) {
      if (entry.isSymbolicLink()) throw new Error('Application state may not use symbolic links');
      const file = path.join(directory, entry.name);
      if (entry.isFile() && entry.name.endsWith('.json')) await json(file);
      if (entry.isDirectory() && group === 'file-sync') {
        // Keep acknowledged versions, path keys, durable operations and receipts exact.
        // The ordinary sync engine publishes old configuration deletions/new additions.
        const checkpoint = await json(path.join(file, 'checkpoint.json'), false);
        if (checkpoint?.root) roots.set(pathKey(checkpoint.root.replace(newParent, oldParent)), pathKey(checkpoint.root));
      }
    }
    for (const [previous, next] of roots) {
      const length = group === 'userscripts' ? 24 : 64, suffix = group === 'file-sync' ? '' : '.json';
      const old = path.join(directory, hashed(group === 'userscripts' ? path.resolve(previous) : pathKey(previous), length) + suffix), target = path.join(directory, hashed(group === 'userscripts' ? path.resolve(next) : pathKey(next), length) + suffix);
      if (old === target) continue;
      try { await fs.access(old); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      try { await fs.access(target); throw new Error('Both old and new scoped state exist; preserved both'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await fs.rename(old, target);
    }
  }
  await migrateRuntimeSettings(data);
  for (const root of new Set([config?.vaultPath, settings?.vault?.path].filter(Boolean))) {
    await migrateVaultConfiguration(root);
    await migrateNativeStyles(root);
  }
  return { profile, vault: settings?.vault?.path ?? config?.vaultPath, scopedRoots: roots.size };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [profile, oldParent, newParent] = process.argv.slice(2);
  if (!profile || !oldParent || !newParent) throw new Error('Usage: migrate-user-data.mjs <profile> <old-parent> <new-parent>');
  console.log(JSON.stringify(await migrateUserData(profile, oldParent, newParent)));
}
