import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { _electron as electron, expect } from '@playwright/test';

const base = path.join(os.tmpdir(), '.agents');
await fs.mkdir(base, { recursive: true });
const fixture = await fs.mkdtemp(path.join(base, 'shale-webviewer-'));
const vault = path.join(fixture, 'vault'), profile = path.join(fixture, 'profile');
await fs.mkdir(vault);
await fs.mkdir(profile);
await fs.writeFile(path.join(vault, 'Note.md'), '# WebViewer fixture');
await fs.writeFile(path.join(profile, 'desktop-config.json'), JSON.stringify({
  vaultPath: vault, trustedPlugins: process.env.WEBVIEWER_TEST_TRUSTED === '1',
}));

let version = '1.0.0', updateRequests = 0;
const source = (name, version, extra = '') => `// ==UserScript==
// @name ${name}
// @namespace shale.fixture
// @version ${version}
// @match http://127.0.0.1/*
// @grant none
// @run-at document-end
${extra}// ==/UserScript==
document.body.dataset.fixtureScript = '${version}';
`;
const server = createServer((req, res) => {
  if (req.url === '/fixture.user.js') {
    updateRequests++;
    const extra = version === '3.0.0' ? '// @match https://example.com/*\n' : '';
    res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(source('URL fixture', version, extra));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!DOCTYPE html>
    <title>Fixture ${req.url}</title>
    <a href="/second">Next page</a>
    <a href="/popup" target="_blank">New tab</a>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const [executablePath, ...launchArgs] = process.argv.slice(2);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const launch = () => electron.launch({
  executablePath, args: [`--user-data-dir=${profile}`, ...launchArgs], cwd: fixture, env, timeout: 120000,
});
const quit = async () => {
  await Promise.all([
    app.waitForEvent('close', { timeout: 25000 }),
    app.evaluate(({ app }) => { setImmediate(() => app.quit()); }),
  ]);
  app = undefined;
};
try {
  app = await launch();
  const page = await app.firstWindow();
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 120000 });
  await expect(page.locator('.workspace-launcher')).toBeVisible({ timeout: 60000 });
  const command = async name => {
    await page.keyboard.press('Control+p');
    await page.locator('.palette-input').fill(name);
    await page.keyboard.press('Enter');
    await expect(page.locator('.palette-backdrop')).toHaveCount(0);
  };
  const address = page.getByRole('textbox', { name: '网页地址' });
  const refresh = page.getByRole('button', { name: '刷新网页' });
  const tabs = page.getByRole('tablist', { name: '右侧标签页' });
  const open = async url => {
    await address.fill(url);
    await address.press('Enter');
    await expect(refresh).toBeEnabled();
  };
  const evaluateGuest = async expression => {
    const id = await page.locator('.sidebar-view:visible webview').evaluate(element => element.getWebContentsId());
    return app.evaluate(({ webContents }, { id, expression }) => webContents.fromId(id).executeJavaScript(expression, true), { id, expression });
  };
  await page.getByRole('button', { name: '打开网页浏览器', exact: true }).click();
  await expect(address).toBeFocused();
  await address.fill('file:///invalid');
  await address.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('请输入有效的 HTTP(S) 网页地址');
  await open(origin);
  await expect.poll(() => evaluateGuest('document.title')).toBe('Fixture /');
  assert.deepEqual(await evaluateGuest('[typeof require, typeof process, typeof webobsidianDesktop, window.opener === null]'),
    ['undefined', 'undefined', 'undefined', true]);
  assert.equal(await evaluateGuest(`fetch(${JSON.stringify(new URL('/healthz', page.url()).href)}, { mode: 'no-cors' }).then(() => true, () => false)`), false);
  await evaluateGuest('document.querySelector("a").click()');
  await expect(address).toHaveValue(origin + '/second');
  await page.getByRole('button', { name: '后退', exact: true }).click();
  await expect(address).toHaveValue(origin + '/');
  await page.getByRole('button', { name: '前进', exact: true }).click();
  await expect(address).toHaveValue(origin + '/second');
  await evaluateGuest('document.querySelector("[target]").click()');
  await expect(address).toHaveValue(origin + '/popup');
  const second = tabs.getByRole('tab', { name: 'Fixture /second', exact: true });
  const popup = tabs.getByRole('tab', { name: 'Fixture /popup', exact: true });
  await expect(popup).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('.right-sidebar .sidebar-tab-header')).toHaveCount(0);
  await expect(page.locator('webview')).toHaveCount(2);
  await expect(refresh).toBeEnabled();
  await second.click();
  await expect(address).toHaveValue(origin + '/second');
  await popup.click();
  await expect(address).toHaveValue(origin + '/popup');
  await popup.press('Delete');
  await expect(address).toHaveValue(origin + '/second');
  await expect(page.locator('webview')).toHaveCount(1);

  await command('内置浏览器：管理用户脚本');
  const settings = page.getByRole('region', { name: '内置浏览器用户脚本' });
  await expect(settings).toBeVisible();
  const script = name => settings.locator('.setting-group').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const urlRow = settings.getByRole('group', { name: '.user.js URL' });
  await urlRow.getByRole('textbox').fill(origin + '/fixture.user.js');
  await urlRow.getByRole('button', { name: '导入', exact: true }).click();
  const entry = script('URL fixture');
  const enable = async checkbox => {
    await checkbox.click();
    await expect(checkbox).toBeChecked();
  };
  await expect(entry).toContainText('1.0.0');
  await expect(entry.getByRole('checkbox', { name: '启用脚本' })).not.toBeChecked();
  await entry.getByText('匹配、权限与兼容提示', { exact: true }).click();
  await entry.getByRole('checkbox', { name: '已检查当前源码、匹配范围与权限' }).check();
  await entry.getByRole('button', { name: '批准当前版本权限' }).click();
  await enable(entry.getByRole('checkbox', { name: '启用脚本' }));
  await enable(entry.getByRole('checkbox', { name: '允许自动更新' }));
  await enable(settings.getByRole('checkbox', { name: '自动更新调度' }));

  await settings.getByLabel('从文件导入用户脚本').setInputFiles({
    name: 'local.user.js', mimeType: 'text/javascript', buffer: Buffer.from(source('File fixture', '1.0.0')),
  });
  await expect(script('File fixture')).toBeVisible();
  await page.getByRole('button', { name: '关闭设置' }).click();
  await refresh.click();
  await expect.poll(() => evaluateGuest('document.body?.dataset.fixtureScript')).toBe('1.0.0');

  // A real scheduler tick should update without clicking a check/install action.
  const previousRequests = updateRequests;
  version = '2.0.0';
  await expect.poll(() => updateRequests, { timeout: 75000, intervals: [1000] }).toBeGreaterThan(previousRequests);
  await command('内置浏览器：管理用户脚本');
  await expect(entry).toContainText('2.0.0');
  await expect(entry).toContainText('updated');
  version = '3.0.0';
  await entry.getByRole('button', { name: '更新', exact: true }).click();
  await expect(entry.getByText('待更新版本 3.0.0', { exact: true })).toBeVisible();
  await expect(entry).toContainText('approval-required');
  await page.getByRole('button', { name: '关闭设置' }).click();
  await refresh.click();
  await expect.poll(() => evaluateGuest('document.body?.dataset.fixtureScript')).toBe('2.0.0');
  await command('打开网页浏览器');
  await expect(address).toBeFocused();
  await expect(address).toHaveValue('');
  await tabs.getByRole('tab', { name: '浏览器', exact: true }).press('Delete');
  await expect(address).toHaveValue(origin + '/second');
  await expect.poll(async () => {
    const state = await (await page.request.get(new URL('/api/uistate/', page.url()).href)).json();
    return state.rightTabs?.map(tab => tab.state.url);
  }).toEqual([origin + '/second']);
  await expect(page.getByText(/工作区保存失败/)).toHaveCount(0);
  await quit();

  app = await launch();
  const resumed = await app.firstWindow();
  await expect(resumed.getByRole('textbox', { name: '网页地址' })).toHaveValue(origin + '/second', { timeout: 30000 });
  await expect(resumed.getByRole('button', { name: '刷新网页' })).toBeEnabled();
  await quit();
  console.log('Desktop WebViewer: launcher, side tabs, guest isolation, navigation, imports, automatic update, permission review, layout persistence and normal quit passed');
} finally {
  const process = app?.process();
  if (process && process.exitCode === null && process.signalCode === null) {
    const exited = new Promise(resolve => process.once('exit', resolve));
    process.kill('SIGKILL');
    await exited;
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(fixture, { recursive: true, force: true });
}
