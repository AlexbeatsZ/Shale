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
await fs.writeFile(path.join(vault, 'Plain.txt'), 'A plain text fixture');
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
  const main = page.locator('.workspace .main-pane');
  const left = page.getByRole('complementary', { name: '左侧栏' });
  const right = page.getByRole('complementary', { name: '右侧栏' });
  const mainTabs = page.getByRole('tablist', { name: '已打开的文件' });
  const address = right.getByRole('textbox', { name: '网页地址' });
  const refresh = right.getByRole('button', { name: '刷新网页' });
  const tabs = page.getByRole('tablist', { name: '右侧标签页' });
  const open = async (url, area = right) => {
    const field = area.getByRole('textbox', { name: '网页地址' });
    await field.fill(url);
    await field.press('Enter');
    await expect(area.getByRole('button', { name: '刷新网页' })).toBeEnabled();
  };
  const evaluateGuest = async (expression, area = right) => {
    const id = await area.locator('.webviewer-tab:visible webview').evaluate(element => element.getWebContentsId());
    return app.evaluate(({ webContents }, { id, expression }) => webContents.fromId(id).executeJavaScript(expression, true), { id, expression });
  };
  const browserButton = area => area.getByRole('button', { name: '打开网页浏览器', exact: true });
  const centralNewTab = page.getByRole('button', { name: '新建中央标签页' });
  const centralHomepages = mainTabs.locator('[data-tab-path^="home://"]');
  await centralNewTab.click();
  await expect(centralHomepages).toHaveCount(1);
  await browserButton(page.locator('.workspace')).click();
  const mainAddress = main.getByRole('textbox', { name: '网页地址' });
  await expect(mainAddress).toBeFocused();
  await expect(tabs.getByRole('tab')).toHaveCount(0);
  await open(origin + '/central', main);
  const centralTab = mainTabs.getByRole('tab', { name: /Fixture \/central/ });
  await expect(centralTab).toBeVisible();
  await expect(centralHomepages).toHaveCount(0);
  await expect(mainTabs.getByRole('tab')).toHaveCount(1);
  await evaluateGuest('document.querySelector("[target]").click()', main);
  await expect(mainAddress).toHaveValue(origin + '/popup');
  await expect(mainTabs.getByRole('tab', { name: /Fixture \/popup/ })).toBeVisible();
  await expect(mainTabs.getByRole('tab')).toHaveCount(2);
  await expect(tabs.getByRole('tab')).toHaveCount(0);
  await mainTabs.getByRole('button', { name: '关闭 Fixture /popup', exact: true }).click();
  await expect(mainAddress).toHaveValue(origin + '/central');
  await centralNewTab.click();
  await centralNewTab.click();
  await expect(centralHomepages).toHaveCount(2);
  const firstHomepage = await centralHomepages.first().getAttribute('data-tab-path');
  const lastHomepage = await centralHomepages.last().getAttribute('data-tab-path');
  await centralHomepages.first().click();
  await mainTabs.getByRole('tab', { name: /Fixture \/central/ }).locator('.title').click();
  await expect(centralHomepages).toHaveCount(2);
  await centralHomepages.first().click();
  await expect(browserButton(page.locator('.workspace'))).toBeVisible();
  await command('打开网页浏览器');
  await expect(mainAddress).toBeFocused();
  await expect(mainTabs.locator('[data-tab-path]').nth(1)).toHaveAttribute('data-tab-path', /^webviewer:\/\//);
  await expect(mainTabs.locator(`[data-tab-path="${firstHomepage}"]`)).toHaveCount(0);
  await expect(mainTabs.locator('[data-tab-path]').nth(2)).toHaveAttribute('data-tab-path', lastHomepage);
  await mainTabs.getByRole('button', { name: '关闭 浏览器', exact: true }).click();
  await expect(browserButton(page.locator('.workspace'))).toBeVisible();
  const launcher = page.locator('.workspace .workspace-launcher');
  const pickFile = async name => {
    await page.locator('.palette-input').fill(name);
    await page.locator('.palette-file-item').filter({ hasText: name }).first().click();
  };
  await launcher.getByRole('button', { name: /打开文件/ }).click();
  await pickFile('Note');
  await expect(main.locator('.cm-content')).toContainText('WebViewer fixture');
  await expect(centralHomepages).toHaveCount(0);
  await expect(mainTabs.getByRole('tab')).toHaveCount(2);
  // Selecting an already open file reuses its existing tab and consumes the launcher.
  await centralNewTab.click();
  await launcher.getByRole('button', { name: /打开文件/ }).click();
  await pickFile('Note');
  await expect(centralHomepages).toHaveCount(0);
  await expect(mainTabs.getByRole('tab')).toHaveCount(2);
  await centralNewTab.click();
  await launcher.getByRole('button', { name: /新建笔记/ }).click();
  await expect(mainTabs.locator('[data-tab-path="Untitled.md"]')).toHaveAttribute('aria-selected', 'true');
  await expect(centralHomepages).toHaveCount(0);
  await expect(mainTabs.getByRole('tab')).toHaveCount(3);
  await centralNewTab.click();
  await launcher.getByRole('button', { name: '打开关系图谱', exact: true }).click();
  await expect(main.locator('.graph-view')).toBeVisible();
  await expect(centralHomepages).toHaveCount(0);
  await expect(mainTabs.getByRole('tab')).toHaveCount(4);
  await centralTab.locator('.title').click();
  await expect(mainAddress).toHaveValue(origin + '/central');

  const openSideFile = async (side, area, name) => {
    await page.getByRole('button', { name: `新建${side}标签页` }).click();
    await area.getByRole('button', { name: /打开文件/ }).click();
    await pickFile(name);
  };
  await openSideFile('左侧', left, 'Note');
  await expect(left.getByRole('tab', { name: 'Note', exact: true })).toBeVisible();
  await expect(left.getByRole('tab', { name: 'Homepage', exact: true })).toHaveCount(0);
  await expect(left.locator('.cm-content')).toContainText('WebViewer fixture');
  await openSideFile('右侧', right, 'Plain');
  await expect(tabs.getByRole('tab', { name: 'Plain.txt', exact: true })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: 'Homepage', exact: true })).toHaveCount(0);
  await expect(right.locator('.cm-content')).toContainText('A plain text fixture');
  await tabs.getByRole('tab', { name: 'Plain.txt', exact: true }).press('Delete');
  await page.getByRole('button', { name: '新建右侧标签页' }).click();
  await right.getByRole('button', { name: '打开关系图谱' }).click();
  await expect(right.locator('.graph-view')).toBeVisible();
  await tabs.getByRole('tab', { name: '关系图谱' }).press('Delete');
  await page.getByRole('button', { name: '新建左侧标签页' }).click();
  await browserButton(left).click();
  await open(origin + '/left', left);
  await expect(left.getByRole('tab', { name: 'Fixture /left', exact: true })).toBeVisible();
  await expect(left.getByRole('tab', { name: 'Homepage', exact: true })).toHaveCount(0);
  await left.getByRole('tab', { name: 'Fixture /left', exact: true }).press('Delete');
  await page.getByRole('button', { name: '新建右侧标签页' }).click();
  await browserButton(right).click();
  await expect(address).toBeFocused();
  await expect(tabs.getByRole('tab', { name: 'Homepage', exact: true })).toHaveCount(0);
  const rightToggle = page.getByRole('button', { name: '折叠/展开右侧边栏' });
  const checkSidebarExpansion = async () => {
    await rightToggle.click();
    await expect(page.locator('.dock-right')).toHaveCSS('visibility', 'hidden');
    const movement = await rightToggle.evaluate(button => new Promise(resolve => {
      const workspace = document.querySelector('.workspace');
      const startLeft = workspace.getBoundingClientRect().left;
      const startScroll = window.scrollX;
      const startTime = performance.now();
      let maxMovement = 0;
      // The scroll can return to zero by the end of the transition.
      function sample(now) {
        maxMovement = Math.max(maxMovement, Math.abs(window.scrollX - startScroll),
          Math.abs(workspace.getBoundingClientRect().left - startLeft));
        if (now - startTime < 200) requestAnimationFrame(sample);
        else resolve(maxMovement);
      }
      button.click();
      requestAnimationFrame(sample);
    }));
    assert.equal(movement, 0, 'Opening an empty side browser should not scroll the workspace');
    await expect(address).toBeFocused();
  };
  await checkSidebarExpansion();
  if (process.platform === 'darwin') {
    const setFullScreen = async fullscreen => {
      await app.evaluate(async ({ BrowserWindow }, enabled) => {
        const window = BrowserWindow.getAllWindows()[0];
        await new Promise(resolve => {
          window.once(enabled ? 'enter-full-screen' : 'leave-full-screen', resolve);
          window.setFullScreen(enabled);
        });
      }, fullscreen);
      await page.waitForFunction(enabled => document.documentElement.hasAttribute('data-desktop-fullscreen') === enabled, fullscreen);
    };
    await setFullScreen(true);
    await checkSidebarExpansion();
    await setFullScreen(false);
  }
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
  await right.getByRole('button', { name: '后退', exact: true }).click();
  await expect(address).toHaveValue(origin + '/');
  await right.getByRole('button', { name: '前进', exact: true }).click();
  await expect(address).toHaveValue(origin + '/second');
  await evaluateGuest('document.querySelector("[target]").click()');
  await expect(address).toHaveValue(origin + '/popup');
  const second = tabs.getByRole('tab', { name: 'Fixture /second', exact: true });
  const popup = tabs.getByRole('tab', { name: 'Fixture /popup', exact: true });
  await expect(popup).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('.right-sidebar .sidebar-tab-header')).toHaveCount(0);
  await expect(right.locator('webview')).toHaveCount(2);
  await expect(refresh).toBeEnabled();
  await second.click();
  await expect(address).toHaveValue(origin + '/second');
  await popup.click();
  await expect(address).toHaveValue(origin + '/popup');
  await popup.press('Delete');
  await expect(address).toHaveValue(origin + '/second');
  await expect(right.locator('webview')).toHaveCount(1);

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
  await address.focus();
  await command('打开网页浏览器');
  await expect(address).toBeFocused();
  await expect(address).toHaveValue('');
  try {
    await centralTab.press('Enter');
    await expect(centralTab).toHaveAttribute('aria-selected', 'true');
    await expect(mainAddress).toHaveValue(origin + '/central');
  } catch (error) {
    console.error('Central tab state:', await mainTabs.ariaSnapshot());
    throw error;
  }
  await tabs.getByRole('tab', { name: '浏览器', exact: true }).press('Delete');
  await expect(address).toHaveValue(origin + '/second');
  await expect.poll(async () => {
    const state = await (await page.request.get(new URL('/api/uistate/', page.url()).href)).json();
    return { center: state.tabs?.find(tab => tab.path === state.activePath)?.webUrl,
      right: state.rightTabs?.find(tab => tab.id === state.rightActiveId)?.state.url };
  }).toEqual({ center: origin + '/central', right: origin + '/second' });
  await expect(page.getByText(/工作区保存失败/)).toHaveCount(0);
  await quit();

  app = await launch();
  const resumed = await app.firstWindow();
  await expect(resumed.locator('.main-pane').getByRole('textbox', { name: '网页地址' })).toHaveValue(origin + '/central', { timeout: 30000 });
  await expect(resumed.locator('.dock-right').getByRole('textbox', { name: '网页地址' })).toHaveValue(origin + '/second');
  await expect(resumed.getByRole('button', { name: '刷新网页' })).toHaveCount(2);
  await quit();
  console.log('Desktop WebViewer: launcher, side tabs, stable sidebar expansion, guest isolation, navigation, imports, automatic update, permission review, layout persistence and normal quit passed');
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
