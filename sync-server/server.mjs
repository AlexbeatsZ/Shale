import path from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createFileSyncServer } from '@alexbeatsz/file-sync-core';
import { prefix, validPath, validateManifest } from './protocol.mjs';
import { runCli } from './cli.mjs';

export async function createSyncServer({ root, token, maxBlobBytes = 1024 * 1024 * 1024 }) {
  const service = await createFileSyncServer({
    root, token, maxBlobBytes, routePrefix: prefix, validPath, validateManifest,
    validateToken(value) {
      if (typeof value !== 'string' || !/^[\x21-\x7e]{32,512}$/.test(value)) {
        throw new Error('SHALE_SYNC_TOKEN must contain 32-512 printable ASCII characters');
      }
    },
    validateRequest: (request, url) => !request.headers.origin && !request.url.includes('#') &&
      (!url.search || request.method === 'GET' && [`${prefix}/manifest/pages`, `${prefix}/changes`].includes(url.pathname)),
    onError: ({ code }) => console.error('Shale sync request failed:', code),
  });
  // Import-only route for devices that have not installed the migration release yet.
  service.server.prependListener('request', request => {
    if (request.url?.startsWith('/webobsidian-sync/')) request.url = request.url.replace('/webobsidian-sync/', '/shale-sync/');
  });
  return service;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try { await runCli(createSyncServer); }
  catch (error) {
    // Startup diagnostics must not expose a configuration token or private paths.
    console.error('Shale sync startup failed:', error.code ?? error.name);
    process.exitCode = 1;
  }
}
