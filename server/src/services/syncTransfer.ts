import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { hashFile } from './textFile.js';
import { SyncHttpError, syncJson, type OrderedSyncTransport } from './syncTransport.js';

const maxBytes = 1024 * 1024 * 1024;
const chunkBytes = 8 * 1024 * 1024;
const discard = (filename: string) => fs.unlink(filename).catch((error: NodeJS.ErrnoException) => {
  if (error.code !== 'ENOENT') throw error;
});

export async function downloadSyncBlob(transport: OrderedSyncTransport, directory: string, digest: string): Promise<void> {
  const filename = path.join(directory, digest);
  if (await hashFile(filename) === digest) return;
  await fs.mkdir(directory, { recursive: true });
  const partial = `${filename}.part`;
  const publish = async () => {
    if (await hashFile(partial) !== digest) return false;
    const handle = await fs.open(partial, 'r+');
    try { await handle.sync(); } finally { await handle.close(); }
    await fs.rename(partial, filename);
    return true;
  };
  const offset = await fs.stat(partial).then(info => info.size, (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return 0;
    throw error;
  });
  if (offset && await publish()) return;
  let response: Response;
  try {
    response = await transport.request(`blobs/${digest}`, offset && offset < maxBytes ? { headers: { Range: `bytes=${offset}-` } } : {});
  } catch (error) {
    if (!offset || !(error instanceof SyncHttpError) || error.status !== 416) throw error;
    await discard(partial);
    response = await transport.request(`blobs/${digest}`);
  }
  const append = response.status === 206;
  const contentRange = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') ?? '');
  const progress = contentRange?.slice(1).map(Number);
  const limit = append && progress ? progress[2] : maxBytes;
  if ((append && (!offset || !progress || progress[0] !== offset || progress[1] !== limit - 1 || limit <= offset || limit > maxBytes)) ||
      (response.status !== 200 && !append) || !response.body) {
    await response.body?.cancel();
    throw new Error('续传响应范围无效，未写入笔记');
  }
  // A legacy server may ignore Range and return a full response. Restart that partial from byte zero.
  let bytes = append ? offset : 0;
  try {
    await pipeline(Readable.fromWeb(response.body as never), new Transform({ transform(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes > limit) { done(new Error('下载内容超出允许大小')); return; }
      done(null, chunk);
    } }), createWriteStream(partial, { flags: append ? 'a' : 'w', mode: 0o600 }));
  } finally {
    if (bytes > limit) await discard(partial);
  }
  if (append && bytes !== limit) throw new Error('续传尚未完成');
  if (await publish()) return;
  await discard(partial);
  throw new Error('下载内容与同步版本不一致，未写入笔记');
}

function uploadProgress(value: unknown, total: number): { offset: number; complete: boolean } {
  const progress = value as { offset?: number; total?: number; complete?: boolean } | null;
  if (!progress || !Number.isSafeInteger(progress.offset) || progress.offset! < 0 || progress.offset! > total ||
      progress.total !== total || typeof progress.complete !== 'boolean' || progress.complete !== (progress.offset === total))
    throw new Error('续传服务器返回无效上传进度');
  return { offset: progress.offset!, complete: progress.complete };
}

export async function uploadSyncBlob(transport: OrderedSyncTransport, digest: string, filename: string): Promise<void> {
  const total = (await fs.stat(filename)).size;
  if (total <= chunkBytes) { await transport.upload(digest, filename); return; }
  const resource = `uploads/${digest}`;
  let offset = 0;
  try {
    const progress = uploadProgress(await syncJson(await transport.request(resource)), total);
    if (progress.complete) return;
    offset = progress.offset;
  } catch (error) {
    if (!(error instanceof SyncHttpError) || error.status !== 404) throw error;
    if ((error.details as { error?: string })?.error !== 'upload_missing') { await transport.upload(digest, filename); return; }
  }
  let retriedOffset = false;
  while (offset < total) {
    const end = Math.min(offset + chunkBytes, total) - 1;
    try {
      const progress = uploadProgress(await syncJson(await transport.request(resource, { method: 'PUT', duplex: 'half',
        headers: { 'Content-Range': `bytes ${offset}-${end}/${total}`, 'Content-Length': String(end - offset + 1) },
        body: createReadStream(filename, { start: offset, end }) as never,
      })), total);
      if (progress.complete) return;
      if (progress.offset !== end + 1) throw new Error('上传进度与已发送分段不一致');
      offset = progress.offset;
    } catch (error) {
      if (!(error instanceof SyncHttpError)) throw error;
      if (error.status === 404 && offset === 0) { await transport.upload(digest, filename); return; }
      if (error.status !== 409 || retriedOffset || (error.details as { error?: string })?.error !== 'upload_offset_mismatch') throw error;
      const progress = uploadProgress(await syncJson(await transport.request(resource)), total);
      if (progress.complete) return;
      offset = progress.offset; retriedOffset = true;
    }
  }
}
