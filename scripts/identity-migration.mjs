import { promises as fs, existsSync, lstatSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';

// These are import-only identities. New writes always use Shale.
export const legacyBrand = 'webobsidian';
export const legacyVaultDirectory = '.obsidian';
export function canonicalConfigurationPath(value) {
  return value.replace(/^\.obsidian\/webobsidian(?=\/|$)/, '.shale')
    .replace(/^\.obsidian(?=\/|$)/, '.shale');
}
export function canonicalEndpoint(value) {
  return typeof value === 'string' ? value.replace(/\/webobsidian-sync(?=\/|$)/, '/shale-sync') : value;
}

/** Move the original Chromium/server profile, preserving Local State and permissions. */
export function migrateDesktopProfile(appData, destination = path.join(appData, 'Shale')) {
  const legacy = [path.join(appData, '@webobsidian', 'desktop'), path.join(appData, 'WebObsidian')];
  const sources = legacy.filter(file => existsSync(file));
  if (existsSync(destination)) {
    if (sources.length) throw new Error('Both Shale and legacy application profiles exist; preserved both. Resolve the profile choice before starting.');
    return destination;
  }
  if (sources.length > 1) throw new Error('Multiple legacy profiles exist; preserved all profiles.');
  if (sources.length) {
    if (!lstatSync(sources[0]).isDirectory() || lstatSync(sources[0]).isSymbolicLink()) throw new Error('Profile must be a real directory');
    mkdirSync(path.dirname(destination), { recursive: true });
    renameSync(sources[0], destination);
  }
  mkdirSync(destination, { recursive: true });
  return destination;
}
async function stat(file) {
  try { return await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function movesFor(source, destination, moves, directories) {
  const sourceStat = await stat(source);
  if (!sourceStat) return;
  if (sourceStat.isSymbolicLink()) throw new Error('Configuration migration refuses symbolic links');
  const destinationStat = await stat(destination);
  if (destinationStat?.isSymbolicLink() || destinationStat && (!sourceStat.isDirectory() || !destinationStat.isDirectory()))
    throw new Error('Configuration migration collision; both versions were preserved: ' + destination);
  if (sourceStat.isDirectory()) {
    directories.add(destination);
    for (const entry of await fs.readdir(source)) await movesFor(path.join(source, entry), path.join(destination, entry), moves, directories);
  } else moves.push([source, destination]);
}
/** Called before configuration readers, indexes, watchers and file transport exist. */
export async function migrateVaultConfiguration(root) {
  const legacy = path.join(root, legacyVaultDirectory), current = path.join(root, '.shale');
  const moves = [], directories = new Set();
  // Preflight the complete flattened layout, then move without overwriting a file.
  const legacyInfo = await stat(legacy), currentInfo = await stat(current);
  for (const info of [legacyInfo, currentInfo]) if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error('Configuration root must be a real directory');
  if (legacyInfo) {
    for (const entry of await fs.readdir(legacy)) {
      const source = path.join(legacy, entry);
      if (entry === legacyBrand) {
        const info = await stat(source);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Legacy native configuration must be a real directory');
        for (const child of await fs.readdir(source)) await movesFor(path.join(source, child), path.join(current, child), moves, directories);
      } else await movesFor(source, path.join(current, entry), moves, directories);
    }
  }
  // Restart recovery for a previously renamed root with the native child still present.
  const nested = path.join(current, legacyBrand);
  if (await stat(nested)) for (const entry of await fs.readdir(nested)) await movesFor(path.join(nested, entry), path.join(current, entry), moves, directories);
  const destinations = new Set();
  for (const [, destination] of moves) {
    const key = destination.toLowerCase();
    if (destinations.has(key)) throw new Error('Configuration migration has competing sources; preserved all files');
    destinations.add(key);
  }
  for (const directory of directories) await fs.mkdir(directory, { recursive: true });
  for (const [source, destination] of moves) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    // The runtime has not started; still recheck in case another process wrote a file.
    if (await stat(destination)) throw new Error('Configuration destination appeared during migration; preserved the source');
    await fs.rename(source, destination);
  }
  async function emptyDirectories(directory) {
    const info = await stat(directory);
    if (!info || !info.isDirectory() || info.isSymbolicLink()) return;
    for (const entry of await fs.readdir(directory)) await emptyDirectories(path.join(directory, entry));
    if (!(await fs.readdir(directory)).length) await fs.rmdir(directory);
  }
  await emptyDirectories(legacy); await emptyDirectories(nested);
  // Rewrite only app-owned path/identity fields, never note prose or executable snippets.
  for (const name of await fs.readdir(current).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
    if (!name.endsWith('.jsonc') && !['appearance.json', 'types.json'].includes(name)) continue;
    const file = path.join(current, name), info = await stat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Configuration must be a real file');
    const text = await fs.readFile(file, 'utf8');
    const updated = text.replaceAll('.obsidian/webobsidian/', '.shale/').replaceAll('.obsidian/', '.shale/')
      .replace(/\/webobsidian-sync(?=\/|$)/g, '/shale-sync').replaceAll('obsidian-dark', 'shale-dark').replaceAll('obsidian-light', 'shale-light');
    if (updated !== text) { const temporary = file + '.shale-migration.tmp'; await fs.writeFile(temporary, updated, { mode: info.mode }); await fs.rename(temporary, file); }
  }
}

/** Migrate app-owned settings before schema parsing; leave user source strings untouched. */
export async function migrateRuntimeSettings(directory) {
  const file = path.join(directory, 'settings.json');
  const info = await stat(file); if (!info) return;
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Settings must be a real file');
  const original = await fs.readFile(file, 'utf8');
  const data = JSON.parse(original);
  function visit(value) {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
    if (value === 'obsidian-dark') return 'shale-dark';
    if (value === 'obsidian-light') return 'shale-light';
    if (typeof value === 'string' && (value.startsWith('.obsidian/') || value.includes('/.obsidian/')))
      return value.replaceAll('.obsidian/webobsidian/', '.shale/').replaceAll('.obsidian/', '.shale/');
    return value;
  }
  const updated = JSON.stringify(visit(data), null, 2);
  if (JSON.stringify(data) !== JSON.stringify(visit(data))) {
    const temporary = file + '.shale-migration.tmp'; await fs.writeFile(temporary, updated, { mode: info.mode }); await fs.rename(temporary, file);
  }
}
