export const prefix = '/shale-sync/v1';
export const defaultPort = 18744;
export const hashPattern = /^[a-f0-9]{64}(?![\s\S])/;
export const idPattern = /^[A-Za-z0-9_-]{16,80}(?![\s\S])/;
const reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i;
const excluded = new Set(['.git', '.trash', '.stfolder', '.stversions', '.stignore', 'node_modules', '__proto__', 'prototype', 'constructor']);

/** Paths deliberately outside sync: Git, trash, Syncthing metadata, temporary files and device-local Shale state. */
export function excludedPath(value) {
  const parts = value.split('/');
  if (parts[0].toLowerCase() === '.shale' && (parts[1]?.toLowerCase() === 'plugins' || ['workspace.json', 'workspace-mobile.json', 'community-plugins.json', 'hotkeys.json'].includes(parts[1]?.toLowerCase()))) return true;
  // Read historical manifests/checkpoints during the coordinated rename. Never create these paths.
  if (parts[0].toLowerCase() === '.obsidian' && parts[1] !== 'webobsidian') return true;
  return parts.some(part => excluded.has(part.toLowerCase()) || /\.(tmp|previous)$|\.tmp-|\.sync-conflict-/i.test(part));
}

export function validPath(value) {
  if (typeof value !== 'string' || !value || value.length > 1000 || /[\\\x00-\x1f\x7f:<>"|?*]/.test(value)) return false;
  if (excludedPath(value)) return false;
  return value.split('/').every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !reserved.test(part));
}

/** Files carry a hash; directories are `{hash:null, directory:true}`; tombstones have only a null hash. */
export const isLiveEntry = entry => entry.hash !== null || entry.directory === true;

export function validateManifest(manifest) {
  if (!manifest || !idPattern.test(manifest.workspaceId) || !Number.isSafeInteger(manifest.revision) || manifest.revision < 0 ||
      !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) throw new Error('Invalid sync manifest');
  // Like Syncthing, a tombstone keeps its exact spelling; only items that exist must be unique ignoring case.
  const live = new Map();
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (!validPath(name) || !entry || !Number.isSafeInteger(entry.version) || entry.version <= 0 ||
        entry.version > manifest.revision || entry.hash !== null && !hashPattern.test(entry.hash) ||
        entry.directory !== undefined && (entry.directory !== true || entry.hash !== null)) throw new Error('Invalid sync entry');
    if (!isLiveEntry(entry)) continue;
    if (live.has(name.toLowerCase())) throw new Error('Invalid sync entry');
    live.set(name.toLowerCase(), entry.directory === true);
  }
  // A file cannot be the parent of another item.
  for (const name of live.keys()) {
    const parts = name.split('/'); parts.pop();
    while (parts.length) { if (live.get(parts.join('/')) === false) throw new Error('Sync file/directory collision'); parts.pop(); }
  }
}
