import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect } from '@playwright/test';

const base = path.join(os.tmpdir(), '.agents');
await fs.mkdir(base, { recursive: true });
const fixture = await fs.mkdtemp(path.join(base, 'shale-webviewer-lifecycle-'));
const vault = path.join(fixture, 'vault'), profile = path.join(fixture, 'profile');
await fs.mkdir(vault); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'desktop-config.json'), JSON.stringify({ vaultPath: vault }));
const loads = new Map();
const server = createServer((req, res) => {
  loads.set(req.url, (loads.get(req.url) ?? 0) + 1);
  res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>Life ${req.url}</title>
    <input id="draft"><div style="height:4000px">Retained page</div><script>window.instance=crypto.randomUUID()</script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let app;
try {
  app = await electron.launch({ executablePath: process.argv[2], args: [`--user-data-dir=${profile}`, '--use-mock-keychain'], timeout: 120000 });
  const page = await app.firstWindow();
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 120000 });
  await expect(page.locator('.workspace-launcher')).toBeVisible({ timeout: 60000 });
  await page.bringToFront();
  const tabs = page.getByRole('tablist', { name: '已打开的文件' });
  const identities = new Map();
  const guests = () => page.locator('.workspace webview');
  const inspect = async element => {
    const id = await element.evaluate(view => view.getWebContentsId());
    const state = await app.evaluate(({ webContents }, id) => webContents.fromId(id).executeJavaScript(
      '({instance, draft:document.querySelector("#draft").value, scroll:scrollY, history:history.state})'), id);
    return { id, ...state };
  };
  for (const name of ['one', 'two', 'three']) {
    await page.getByRole('button', { name: '新建中央标签页' }).click();
    await page.locator('.workspace').getByRole('button', { name: '打开网页浏览器', exact: true }).click();
    const address = page.locator('.workspace .main-pane').getByRole('textbox', { name: '网页地址' });
    await address.fill(origin + '/' + name); await address.press('Enter');
    await expect(tabs.getByRole('tab', { name: new RegExp('Life /' + name) })).toBeVisible();
    const guest = page.locator('.workspace .main-pane webview'), id = await guest.evaluate(view => view.getWebContentsId());
    await app.evaluate(({ webContents }, { id, name }) => webContents.fromId(id).executeJavaScript(
      `document.querySelector('#draft').value=${JSON.stringify('draft-' + name)};history.replaceState({kept:true},'');scrollTo(0,200);`), { id, name });
    identities.set(name, await inspect(guest));
  }
  const unchanged = async () => {
    assert.equal(await guests().count(), 3);
    for (const name of ['one', 'two', 'three']) {
      // Hidden guests retain their URL attribute and can be inspected by their own identity.
      const guest = guests();
      const found = [];
      for (const element of await guest.all()) found.push(await inspect(element));
      const state = found.find(value => value.id === identities.get(name).id);
      assert.deepEqual(state, identities.get(name), `Retain ${name}'s guest, draft, scroll and history`);
      assert.equal(loads.get('/' + name), 1, `${name} must not reload`);
    }
  };
  const tab = name => tabs.getByRole('tab', { name: new RegExp('Life /' + name) });
  const drag = async (source, target, dwell = 0) => {
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await source.dispatchEvent('dragstart', { dataTransfer: transfer });
    const box = await target.boundingBox();
    const pane = await target.evaluate(element => element.classList.contains('editor-area'));
    const options = { dataTransfer: transfer, clientX: box.x + box.width * (pane ? 0.75 : 0.5), clientY: box.y + box.height * (pane ? 0.25 : 0.5) };
    await target.dispatchEvent('dragenter', options); await target.dispatchEvent('dragover', options);
    if (dwell) await page.waitForTimeout(dwell);
    await target.dispatchEvent('drop', options); await source.dispatchEvent('dragend', { dataTransfer: transfer });
    await transfer.dispose();
  };
  await drag(tab('one'), tab('three'));
  await expect(tabs.locator('[data-tab-path]').first()).toContainText('Life /three');
  await unchanged();
  await drag(tab('one'), tab('three'), 550);
  await expect(tabs.locator('[data-tab-path]').first()).toContainText('Life /one');
  await unchanged();
  await tab('one').click();
  await drag(tab('two'), page.locator('.workspace .editor-area'));
  await expect(page.locator('.workspace .split-pane')).toBeVisible();
  await unchanged();
  await page.getByRole('separator', { name: '调整分屏比例；双击交换两侧页面' }).press('Enter');
  await unchanged();
  await tab('three').click(); await tab('one').click();
  await expect(page.locator('.workspace .split-pane')).toBeVisible();
  await unchanged();
  console.log(JSON.stringify({ ok: true, loads: Object.fromEntries(loads), guests: Object.fromEntries(identities) }, null, 2));
} finally {
  if (app) await app.close();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(fixture, { recursive: true, force: true });
}
