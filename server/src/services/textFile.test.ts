import { afterEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readTextFile, writeFileFromSource, writeTextFile } from './textFile.js';

const folders: string[] = [];
afterEach(async () => { for (const folder of folders.splice(0)) await fs.rm(folder, { recursive: true, force: true }); });

it('rejects a stale save and preserves exact UTF-8 bytes', async () => {
  const base = path.join(os.tmpdir(), '.agents');
  await fs.mkdir(base, { recursive: true });
  const folder = await fs.mkdtemp(path.join(base, 'rendering-'));
  folders.push(folder);
  const file = path.join(folder, 'note.md');
  const original = '\ufeffa\r\nb\nc';
  await fs.writeFile(file, original);
  const snapshot = await readTextFile(file);
  expect(snapshot.content).toBe(original);
  await writeTextFile(file, 'remote', snapshot.revision);
  await expect(writeTextFile(file, 'local', snapshot.revision)).rejects.toMatchObject({ status: 409 });
  expect(await fs.readFile(file, 'utf8')).toBe('remote');
});

it('creates synced files on storage that rejects hard links without replacing existing files', async () => {
  const base = path.join(os.tmpdir(), '.agents');
  await fs.mkdir(base, { recursive: true });
  const folder = await fs.mkdtemp(path.join(base, 'nolink-'));
  folders.push(folder);
  const source = path.join(folder, 'blob');
  await fs.writeFile(source, 'remote');
  const spy = vi.spyOn(fs, 'link').mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
  try {
    const target = path.join(folder, 'sub', 'note.md');
    await writeFileFromSource(target, source, null);
    expect(await fs.readFile(target, 'utf8')).toBe('remote');
    expect((await fs.readdir(path.dirname(target))).filter(name => name.includes('.tmp-'))).toEqual([]);
    const existing = path.join(folder, 'exists.md');
    await fs.writeFile(existing, 'local');
    await expect(writeFileFromSource(existing, source, null)).rejects.toMatchObject({ status: 409 });
    expect(await fs.readFile(existing, 'utf8')).toBe('local');
  } finally { spy.mockRestore(); }
});
