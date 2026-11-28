import { useSyncExternalStore } from 'react';
import { request } from './api';
import type { TreeNode } from './api';
import type { FileSyncStatus, SyncConflictFile } from '../../../server/src/contracts/fileSync';

let conflicts = new Map<string, SyncConflictFile>();
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const subscribeSyncConflicts = subscribe;
export const syncConflictSnapshot = () => conflicts;
const publish = (next: Map<string, SyncConflictFile>) => { conflicts = next; listeners.forEach(listener => listener()); };

export function refreshSyncConflicts(): Promise<void> {
  loading ??= request<{ conflict: { files: SyncConflictFile[] } | null }>('/api/file-sync/conflict')
    .then(value => publish(new Map((value.conflict?.files ?? []).map(file => [file.path, file]))))
    .catch(() => {})
    .finally(() => { loading = null; });
  return loading;
}

export function clearSyncConflicts(): void { if (conflicts.size) publish(new Map()); }

export async function resolveSyncConflict(path: string, choice: 'local' | 'remote' | 'merged'): Promise<void> {
  const paths = [path, ...(conflicts.get(path)?.relatedPaths ?? [])];
  const files = Object.fromEntries(paths.map(name => [name, choice]));
  await request('/api/file-sync/resolve', { method: 'POST', body: JSON.stringify({ choice: 'files', files }) });
  await refreshSyncConflicts();
}

export async function resolveAllSyncConflicts(choice: 'local' | 'remote'): Promise<void> {
  await request('/api/file-sync/resolve', { method: 'POST', body: JSON.stringify({ choice }) });
  await refreshSyncConflicts();
}

/** Text shown next to the label whenever sync did not fully succeed; never hover-only, touch screens have no hover. */
export function syncProblem(status: FileSyncStatus): string {
  if (!status.enabled || status.phase === 'syncing' || status.phase === 'conflict') return '';
  if (status.phase === 'error' || status.phase === 'recovery') return status.message || '同步未完成，原因未知';
  return status.deferredPaths?.length || status.failedPaths?.length ? status.message : '';
}

/** `rescan` (the manual sync button) also walks the whole Vault for changes the file watcher did not report. */
export async function runFileSync(options: { rescan?: boolean } = {}): Promise<FileSyncStatus> {
  const status = await request<FileSyncStatus>('/api/file-sync/run', { method: 'POST', body: JSON.stringify({ rescan: options.rescan === true }) });
  await refreshSyncConflicts();
  return status;
}

export const syncConflictUrl = (path: string, side: 'local' | 'remote') =>
  `/api/file-sync/conflict/file?path=${encodeURIComponent(path)}&side=${side}`;

export function useSyncConflicts(): Map<string, SyncConflictFile> { return useSyncExternalStore(subscribe, () => conflicts); }
export function useSyncConflict(path: string): SyncConflictFile | undefined { return useSyncExternalStore(subscribe, () => conflicts.get(path)); }

/** Adds the server's files that do not exist on this device yet, so they can be reviewed from the tree. */
export function withIncomingConflicts(tree: TreeNode, files: Map<string, SyncConflictFile>): TreeNode {
  const incoming = [...files.values()].filter(file => file.action === 'add');
  if (!incoming.length) return tree;
  const root: TreeNode = structuredClone(tree);
  for (const file of incoming) {
    const segments = file.path.split('/'); let parent = root;
    for (let index = 0; index < segments.length - 1; index++) {
      const folder = segments.slice(0, index + 1).join('/');
      let next = parent.children?.find(child => child.path === folder);
      if (!next) { next = { name: segments[index], path: folder, type: 'folder', children: [] }; (parent.children ??= []).push(next); }
      parent = next;
    }
    if (!parent.children?.some(child => child.path === file.path))
      (parent.children ??= []).push({ name: segments.at(-1)!, path: file.path, type: 'file', ext: segments.at(-1)!.split('.').pop() });
  }
  return root;
}
