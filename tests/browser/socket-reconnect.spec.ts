import { test as base, expect } from './test';
import type { WebSocketRoute } from '@playwright/test';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The application socket carries file events and the editing-state confirmation background sync needs.
// A dropped socket (Android WebView, sleeping desktop) must reconnect and reread what it missed.
const test = base.extend<{ backend: { url: string; vault: string } }>({
  backend: async ({ page }, use) => {
    const parent = path.join(os.tmpdir(), '.agents'); await fs.mkdir(parent, { recursive: true });
    const directory = await fs.mkdtemp(path.join(parent, 'socket-reconnect-browser-'));
    const vault = path.join(directory, 'vault'), data = path.join(directory, 'data');
    await fs.mkdir(vault); await fs.mkdir(data);
    await fs.writeFile(path.join(vault, 'note.md'), '# Note\n\nBefore external edit\n');
    await fs.writeFile(path.join(data, 'uistate.json'), JSON.stringify({ tabs: [{ path: 'note.md', title: 'note.md' }], activePath: 'note.md' }));
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], { cwd: process.cwd(), windowsHide: true,
      env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: data, VAULT_PATH: vault, ALLOWED_ROOTS: directory,
        SHALE_INITIAL_VAULT: '', NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = ''; child.stdout!.on('data', chunk => { logs += chunk; }); child.stderr!.on('data', chunk => { logs += chunk; });
    try {
      const endpoint = path.join(data, 'operations-endpoint.json');
      await expect.poll(async () => {
        if (child.exitCode !== null) throw new Error(logs);
        return fs.readFile(endpoint, 'utf8').then(text => JSON.parse(text).url, () => '');
      }, { timeout: 20000 }).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      await use({ url: JSON.parse(await fs.readFile(endpoint, 'utf8')).url, vault });
    } finally {
      await page.close();
      if (child.exitCode === null) { const closed = new Promise(resolve => child.once('close', resolve)); child.kill(); await closed; }
      if (!path.resolve(directory).startsWith(path.join(parent, 'socket-reconnect-browser-'))) throw new Error('Invalid fixture path');
      await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  },
});

test('reconnects a dropped application socket, rereads missed changes and syncs on returning to the foreground', async ({ page, backend }) => {
  test.setTimeout(60000);
  const syncRuns: string[] = [];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/file-sync/run') syncRuns.push(route.request().method());
    try {
      await route.fulfill({ response: await route.fetch({ url: backend.url + url.pathname + url.search }) });
    } catch (error) {
      if (!page.isClosed() && route.request().failure()?.errorText !== 'net::ERR_ABORTED') throw error;
    }
  });
  await page.routeWebSocket(url => url.searchParams.has('token'), socket => socket.send(JSON.stringify({ type: 'connected' })));
  const connections: WebSocketRoute[] = [];
  let dropFileEvents = false;
  await page.routeWebSocket('**/ws', socket => {
    connections.push(socket);
    // Later connections are deliberately silent: only the reconnect resynchronization can show the edit.
    if (connections.length > 1) return;
    const upstream = new WebSocket(backend.url.replace('http:', 'ws:') + '/ws');
    const pending: string[] = [];
    socket.onMessage(message => {
      const text = typeof message === 'string' ? message : message.toString('utf8');
      if (upstream.readyState === WebSocket.OPEN) upstream.send(text); else pending.push(text);
    });
    upstream.addEventListener('open', () => { for (const text of pending.splice(0)) upstream.send(text); });
    upstream.addEventListener('message', event => {
      const text = String(event.data);
      if (dropFileEvents && JSON.parse(text).type === 'fs') return;
      socket.send(text);
    });
    socket.onClose(() => upstream.close());
  });
  await page.route('**/', async route => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    const entry = '/@fs/' + path.resolve('tests/browser/appearanceFixture.tsx').replaceAll('\\', '/');
    await route.fulfill({ response, body: (await response.text()).replace('/src/main.tsx', entry) });
  });
  await page.goto('/');
  const editor = page.locator('.main-pane .cm-content');
  await expect(editor).toContainText('Before external edit');
  await expect.poll(() => connections.length).toBe(1);

  // The edit's file event is lost, exactly as when the socket silently died.
  dropFileEvents = true;
  await fs.writeFile(path.join(backend.vault, 'note.md'), '# Note\n\nAfter external edit\n');
  await page.waitForTimeout(1500);
  await expect(editor).toContainText('Before external edit');

  await connections[0].close();
  await expect.poll(() => connections.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  await expect(editor).toContainText('After external edit', { timeout: 10000 });

  const before = syncRuns.length;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => syncRuns.length).toBe(before + 1);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(300);
  expect(syncRuns.length, 'foreground sync is throttled').toBe(before + 1);
});
