import type { SyncManifest } from '../server/src/contracts/fileSync.js';
export const prefix: string;
export const defaultPort: number;
export const hashPattern: RegExp;
export const idPattern: RegExp;
export function validPath(value: unknown): value is string;
export function excludedPath(value: string): boolean;
export function isLiveEntry(entry: { hash: string | null; directory?: boolean }): boolean;
export function validateManifest(value: unknown): asserts value is SyncManifest;
