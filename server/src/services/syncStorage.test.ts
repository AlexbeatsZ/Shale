import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import { withSyncLock } from './syncStorage.js';

test('the embedded runtime ignores legacy PID locks and still excludes concurrent work', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shale-sync-lock-'));
  const legacyLock = path.join(directory, 'client.lock');
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  vi.stubEnv('SHALE_EMBEDDED', '1');
  try {
    await fs.writeFile(legacyLock, String(process.pid));
    const active = withSyncLock(directory, () => hold);
    await expect(withSyncLock(directory, async () => {})).rejects.toThrow('另一个同步任务');
    release();
    await active;
    await expect(withSyncLock(directory, async () => { throw new Error('fixture failure'); })).rejects.toThrow('fixture failure');
    await expect(withSyncLock(directory, async () => 'recovered')).resolves.toBe('recovered');
    expect(await fs.readFile(legacyLock, 'utf8')).toBe(String(process.pid));
  } finally {
    release();
    vi.unstubAllEnvs();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
