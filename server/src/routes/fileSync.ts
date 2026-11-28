import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { fileSyncEngine, fileSyncPreferences, runFileSync, saveFileSyncPreferences } from '../services/fileSync.js';

const previewTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon' };

export const fileSyncRouter = Router();
fileSyncRouter.get('/', asyncHandler(async (_request, response) => {
  const preferences = await fileSyncPreferences();
  response.setHeader('Cache-Control', 'no-store');
  response.json({ preferences: { ...preferences, token: preferences.token ? '••••••••' : '' }, status: (await fileSyncEngine()).status() });
}));
fileSyncRouter.put('/', asyncHandler(async (request, response) => {
  await saveFileSyncPreferences(request.body); response.json({ ok: true });
}));
fileSyncRouter.post('/run', asyncHandler(async (request, response) => { response.json(await runFileSync({ rescan: request.body?.rescan === true })); }));
fileSyncRouter.get('/conflict', asyncHandler(async (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json({ conflict: await (await fileSyncEngine()).conflictDetails() });
}));
// Image previews of the two retained versions. Served as inert images only (no script, no navigation).
fileSyncRouter.get('/conflict/file', asyncHandler(async (request, response) => {
  const name = String(request.query.path ?? ''); const side = request.query.side === 'remote' ? 'remote' : 'local';
  const type = previewTypes[name.slice(name.lastIndexOf('.') + 1).toLowerCase()];
  const filename = type ? await (await fileSyncEngine()).conflictBlob(name, side) : null;
  if (!filename) throw Object.assign(new Error('没有可预览的冲突文件'), { status: 404 });
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.type(type).sendFile(filename);
}));
fileSyncRouter.post('/resolve', asyncHandler(async (request, response) => {
  const choice = request.body?.choice; const files = request.body?.files;
  if (choice === 'files' && files && typeof files === 'object' && !Array.isArray(files) &&
      Object.values(files).every(value => value === 'local' || value === 'remote' || value === 'merged')) {
    response.json(await (await fileSyncEngine()).resolveConflict(files as Record<string, 'local' | 'remote' | 'merged'>));
    return;
  }
  if (!['local', 'remote', 'recheck'].includes(choice)) throw Object.assign(new Error('请选择需要保留的版本'), { status: 400 });
  response.json(await (await fileSyncEngine()).resolveConflict(choice));
}));
