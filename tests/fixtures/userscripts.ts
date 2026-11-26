import { app, session } from 'electron';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { scriptFetch } from '../../desktop/src/userscripts/network';
import { prepareBundle, UserscriptStore } from '../../desktop/src/userscripts/store';
import { identity } from '../../desktop/src/userscripts/metadata';
import { UserscriptUpdater } from '../../desktop/src/userscripts/updater';

async function main() {
const root = process.argv[2];
app.setPath('userData', path.join(root, 'profile'));
await app.whenReady();
let targetRequests = 0;
const target = createServer((req, res) => {
  targetRequests++;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ method: req.method, headers: req.headers }));
});
await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve));
const targetOrigin = `http://127.0.0.1:${(target.address() as { port: number }).port}`;
const source = (version: string) => `// ==UserScript==\n// @name Network fixture\n// @namespace shale.test\n// @version ${version}\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\n`;
const server = createServer((req, res) => {
  const url = new URL(req.url!, 'http://fixture');
  if (url.pathname === '/script.user.js') { res.end(source('2.0.0')); return; }
  if (url.pathname === '/latest.user.js') { res.writeHead(302, { Location: '/script.user.js' }).end(); return; }
  if (url.pathname === '/cross') { res.writeHead(302, { Location: targetOrigin }).end(); return; }
  if (url.pathname === '/local') { res.writeHead(302, { Location: '/echo' }).end(); return; }
  if (url.pathname === '/post') { res.writeHead(303, { Location: '/echo' }).end(); return; }
  if (url.pathname === '/preserve') { res.writeHead(307, { Location: '/echo' }).end(); return; }
  if (url.pathname === '/loop') { res.writeHead(302, { Location: '/loop' }).end(); return; }
  if (url.pathname === '/denied') { res.writeHead(302, { Location: 'file:///etc/passwd' }).end(); return; }
  if (url.pathname === '/sized') { res.writeHead(200, { 'Content-Length': 1024 }); res.end('x'.repeat(1024)); return; }
  if (url.pathname === '/chunked') { res.write('x'.repeat(64)); res.end('x'.repeat(64)); return; }
  if (url.pathname === '/slow') { return; }
  if (url.pathname === '/slow-body') { res.write('start'); return; }
  if (url.pathname === '/cached') { res.writeHead(304).end(); return; }
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => res.end(JSON.stringify({ method: req.method, headers: req.headers, body })));
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
try {
  const redirect = await scriptFetch(origin + '/latest.user.js');
  assert.equal(redirect.status, 200);
  assert.equal(redirect.url, origin + '/script.user.js');
  assert.match(redirect.bytes.toString(), /@version 2.0.0/);
  const headers = { Authorization: 'fixture-secret', Cookie: 'fixture=cookie' };
  const cross = JSON.parse((await scriptFetch(origin + '/cross', { headers })).bytes.toString());
  assert.equal(cross.headers.authorization, undefined);
  assert.equal(cross.headers.cookie, undefined);
  const local = JSON.parse((await scriptFetch(origin + '/local', { headers })).bytes.toString());
  assert.equal(local.headers.authorization, headers.Authorization);
  const before = targetRequests;
  await assert.rejects(scriptFetch(origin + '/cross', { allow: url => new URL(url).origin === origin }), /URL denied/);
  assert.equal(targetRequests, before, 'Denied redirect must not reach target');
  await assert.rejects(scriptFetch(origin + '/denied'), /URL denied/);
  await assert.rejects(scriptFetch(origin + '/loop'), /Too many redirects/);
  const post = JSON.parse((await scriptFetch(origin + '/post', { method: 'POST', body: 'payload', headers: { 'Content-Type': 'text/plain' } })).bytes.toString());
  assert.equal(post.method, 'GET');
  assert.equal(post.body, '');
  assert.equal(post.headers['content-type'], undefined);
  const preserve = JSON.parse((await scriptFetch(origin + '/preserve', { method: 'POST', body: 'payload' })).bytes.toString());
  assert.equal(preserve.method, 'POST');
  assert.equal(preserve.body, 'payload');
  assert.equal((await scriptFetch(origin + '/post', { method: 'HEAD' })).bytes.length, 0);
  assert.equal((await scriptFetch(origin + '/cached')).status, 304);
  for (const route of ['/sized', '/chunked']) await assert.rejects(scriptFetch(origin + route, { maxBytes: 32 }), /size limit/);
  for (const route of ['/slow', '/slow-body']) await assert.rejects(scriptFetch(origin + route, { timeout: 150 }), /timeout/i);
  const controller = new AbortController();
  const aborted = scriptFetch(origin + '/slow-body', { signal: controller.signal });
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(aborted, /abort/i);
  const browsing = session.fromPartition('userscripts-cookie-fixture');
  await browsing.cookies.set({ url: origin, name: 'fixture', value: 'cookie' });
  assert.equal(JSON.parse((await scriptFetch(origin + '/echo', { session: browsing })).bytes.toString()).headers.cookie, undefined);
  assert.match(JSON.parse((await scriptFetch(origin + '/echo', { session: browsing, anonymous: false })).bytes.toString()).headers.cookie, /fixture=cookie/);

  const vault = path.join(root, 'vault');
  const store = new UserscriptStore(vault, path.join(root, 'data'), () => {});
  await store.load();
  const bundle = await prepareBundle(source('1.0.0'));
  const id = await store.install(bundle, { sourceUrl: origin + '/latest.user.js', approve: true });
  await store.setValues(id, { installed: 'preserve me' });
  const reloaded = new UserscriptStore(vault, path.join(root, 'data'), () => {});
  await reloaded.load();
  assert.deepEqual(reloaded.values(id), { installed: 'preserve me' });
  const updater = new UserscriptUpdater(reloaded, error => { throw error; });
  await updater.check(id, true);
  assert.equal(reloaded.get(id).metadata.version, '2.0.0');
  assert.equal(reloaded.get(id).update.state, 'updated');
  assert.deepEqual(reloaded.values(id), { installed: 'preserve me' });
  await updater.stop();
  await reloaded.dispose();
  await store.dispose();
  console.log('Userscripts: real Electron redirects, allow checks, credential stripping, methods, limits, timeout/abort, cookies, orphan cleanup and updater passed');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const instance of [server, target]) {
    instance.closeAllConnections();
    await new Promise<void>(resolve => instance.close(() => resolve()));
  }
  app.exit(process.exitCode || 0);
}
}
void main().catch(error => { console.error(error); app.exit(1); });
