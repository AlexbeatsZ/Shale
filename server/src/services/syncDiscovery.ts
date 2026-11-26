import { validateManifest } from '../../../sync-server/protocol.mjs';
import type { SyncManifest } from '../contracts/fileSync.js';
import { type OrderedSyncTransport, SyncHttpError } from './syncTransport.js';

export type DiscoveryPage = SyncManifest & { nextCursor: string | null };
type SelectedPage = DiscoveryPage & { since: number | null; resumed: boolean; legacy: boolean };

export function readDiscoveryPage(value: unknown): DiscoveryPage {
  validateManifest(value);
  const page = value as DiscoveryPage;
  if (page.nextCursor !== null && (typeof page.nextCursor !== 'string' || !page.nextCursor || page.nextCursor.length > 4096))
    throw new Error('同步分页游标无效');
  return page;
}

export function discoveryResource(since: number | null, cursor: string | null): string {
  const resource = since === null ? 'manifest/pages' : 'changes';
  if (cursor !== null) return `${resource}?cursor=${encodeURIComponent(cursor)}`;
  return since === null ? `${resource}?limit=256` : `${resource}?since=${since}&limit=256`;
}

export function discoveryReset(error: unknown): boolean {
  return error instanceof SyncHttpError && error.status === 410 && (error.details as { error?: string })?.error === 'cursor_expired';
}

export function discoveryUnsupported(error: unknown): boolean {
  if (!(error instanceof SyncHttpError)) return false;
  return error.status === 404 || (error.status === 400 && (error.details as { error?: string })?.error === 'invalid_request');
}

export async function nextDiscoveryPage(transport: OrderedSyncTransport, since: number | null, cursor: string): Promise<DiscoveryPage> {
  return readDiscoveryPage(await transport.fetchJson(discoveryResource(since, cursor)));
}

export function selectDiscovery(transport: OrderedSyncTransport, expected: { workspaceId: string; revision: number } | undefined,
  deltaSince: number | null, progress: { since: number | null; cursor: string } | undefined): Promise<SelectedPage> {
  const page = (since: number | null, cursor: string | null) => ({
    resource: discoveryResource(since, cursor),
    decode: (value: unknown): SelectedPage => ({ ...readDiscoveryPage(value), since, resumed: cursor !== null, legacy: false }),
    skip: (error: SyncHttpError) => discoveryReset(error) || discoveryUnsupported(error),
  });
  return transport.selectResource([
    ...(progress ? [page(progress.since, progress.cursor)] : deltaSince === null ? [] : [page(deltaSince, null)]),
    page(null, null),
    { resource: 'manifest', decode: value => {
      validateManifest(value);
      return { ...(value as SyncManifest), nextCursor: null, since: null, resumed: false, legacy: true };
    } },
  ], expected);
}
