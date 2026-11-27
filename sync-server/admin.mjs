import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { lifecycleCli } from '@alexbeatsz/file-sync-core';

try {
  const [file, ...args] = process.argv.slice(2);
  if (!file) throw new Error('Usage: node admin.mjs CONFIG status|cleanup|backup [--apply]|backup-list|restore ID --destination NEW_DIR');
  const c = JSON.parse(await readFile(file, 'utf8'));
  const root = path.resolve(c.dataDir);
  const result = await lifecycleCli({ root, token: c.token,
    baseUrl: `http://${c.host ?? '127.0.0.1'}:${c.port ?? 18744}/shale-sync/v1/`,
    configFile: path.resolve(file), configuration: { backup: c.backup, history: c.history, garbageCollection: c.garbageCollection } }, args);
  console.log(JSON.stringify(result, null, 2));
} catch (e) { console.error('Shale lifecycle:', e.message); process.exitCode = 1; }
