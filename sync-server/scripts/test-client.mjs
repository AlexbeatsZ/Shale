import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = path.dirname(root.replace(/[\\/]$/, ''));
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const output = path.resolve(process.env.SHALE_SYNC_PACKAGE_DIR ?? path.join(root, 'release', metadata.version));
const parent = path.join(os.tmpdir(), '.agents'); await mkdir(parent, { recursive: true });
const temporary = await mkdtemp(path.join(parent, 'shale-package-client-'));
try {
  const folder = `shale-sync-server-${metadata.version}`;
  execFileSync('tar', ['-xf', path.join(output, folder + '.tar.gz'), '-C', temporary], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(repo, 'node_modules/vitest/vitest.mjs'), 'run', '--testTimeout=30000',
    'server/src/services/fileSyncEngine.test.ts', 'server/src/services/fileSyncStandalone.test.ts'], {
    cwd: repo, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, SHALE_SYNC_TEST_SERVER: path.join(temporary, folder, 'sync-server/server.mjs') },
  });
} finally {
  if (path.dirname(temporary) !== parent || !path.basename(temporary).startsWith('shale-package-client-')) throw new Error('Unsafe package client fixture');
  await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
}
