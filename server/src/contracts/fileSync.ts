import { z } from 'zod';

export const FileSyncPreferencesSchema = z.object({
  enabled: z.boolean().default(false),
  endpoints: z.array(z.string().trim().min(1).max(2048)).max(16).default([]),
  token: z.string().max(512).default(''),
  intervalSec: z.number().int().min(5).max(3600).default(15),
});
export type FileSyncPreferences = z.infer<typeof FileSyncPreferencesSchema>;
export type SyncEntry = { hash: string | null; version: number };
export type SyncManifest = { workspaceId: string; revision: number; files: Record<string, SyncEntry> };
export type SyncChange = { path: string; hash: string | null; expectedVersion: number };
export type SyncOperation = { workspaceId: string; deviceId: string; operationId: string; changes: SyncChange[] };
export type FileSyncStatus = {
  enabled: boolean; endpoints: string[]; hasToken: boolean; activeEndpoint: string | null;
  phase: 'disabled' | 'idle' | 'syncing' | 'error' | 'conflict' | 'recovery';
  message: string; lastSuccess: string | null; conflictDirectory: string | null; conflictBranches: string[];
  conflictCount: number;
  seen?: number; queuedThrough?: number; pendingIncoming?: number; pendingOutgoing?: number; lastProgress?: string | null;
  /** First pending incoming paths and local files deferred because they were still being written. */
  pendingPaths?: string[]; deferredPaths?: string[];
  /** Differences this device resolved without asking, newest first. */
  recentResolutions: { at: string; path: string; kind: 'fast-forward' | 'deleted' | 'merged' }[];
};
export type SyncDiffBlock = { type: 'same' | 'add' | 'del' | 'skip'; lines: string[]; skipped?: number };
export type SyncConflictFile = {
  path: string; conflictId: string; relatedPaths?: string[];
  /** Full text of both versions for in-editor review (text files up to 1 MiB), otherwise null. */
  localText: string | null; remoteText: string | null; action: 'add' | 'delete' | 'modify'; hasBase: boolean; localChanged: boolean; remoteChanged: boolean;
  localSize: number | null; remoteSize: number | null; image: boolean; text: boolean; diff: SyncDiffBlock[] | null; truncated: boolean;
};
