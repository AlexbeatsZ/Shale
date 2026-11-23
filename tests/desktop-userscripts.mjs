// Real Electron transport/store regression, with no real Vault or profile access.
import { build } from 'esbuild';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import electron from 'electron';

const root = path.join(os.tmpdir(), '.agents');
await fs.mkdir(root, { recursive: true });
const fixture = await fs.mkdtemp(path.join(root, 'shale-userscripts-'));
try {
  const entry = path.join(fixture, 'test.cjs');
  await build({ entryPoints: ['tests/fixtures/userscripts.ts'], outfile: entry, bundle: true,
    platform: 'node', format: 'cjs', external: ['electron'] });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [entry, fixture], { env, stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  if (code !== 0) process.exitCode = 1;
} finally { await fs.rm(fixture, { recursive: true, force: true }); }
