import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { _electron as electron, expect } from '@playwright/test';

const base = path.join(os.tmpdir(), '.agents');
await fs.mkdir(base, { recursive: true });
const fixture = await fs.mkdtemp(path.join(base, 'shale-native-shortcuts-'));
const vault = path.join(fixture, 'vault'), profile = path.join(fixture, 'profile');
await fs.mkdir(path.join(vault, '.shale'), { recursive: true }); await fs.mkdir(profile);
await fs.writeFile(path.join(vault, 'Note.md'), 'original text\n');
const configuration = { version: 1, bindings: {
  commands: [{ modifiers: ['Ctrl'], key: 'R' }],
  move: [{ modifiers: ['Ctrl'], key: 'M' }],
  'toggle-source': [{ modifiers: ['Ctrl'], key: 'Q' }],
  'app:toggle-left-sidebar': [{ modifiers: ['Ctrl', 'Shift'], key: 'Z' }],
}, platforms: { mac: { settings: [{ modifiers: ['PhysicalCtrl'], key: '`' }] } } };
const filename = path.join(vault, '.shale/hotkeys.jsonc');
await fs.writeFile(filename, JSON.stringify(configuration));
await fs.writeFile(path.join(profile, 'desktop-config.json'), JSON.stringify({ vaultPath: vault, trustedPlugins: false }));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const [executablePath, ...args] = process.argv.slice(2);
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';
let app;
try {
  app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`, '--use-mock-keychain', ...args], cwd: fixture, env, timeout: 120000 });
  const page = await app.firstWindow();
  page.on('pageerror', error => console.error('PAGE_ERROR', error.message));
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 120000 });
  await expect(page.locator('.workspace-launcher')).toBeVisible({ timeout: 60000 });
  const accelerators = await app.evaluate(({ Menu }) => {
    const flatten = menu => menu.items.flatMap(item => [{ label: item.label, accelerator: item.accelerator }, ...(item.submenu ? flatten(item.submenu) : [])]);
    return flatten(Menu.getApplicationMenu()).filter(item => item.accelerator);
  });
  assert.deepEqual(accelerators, [], 'No app-owned native menu shortcut is registered');
  await page.bringToFront();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '快捷键', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索快捷键' }).fill('commands');
  await expect(page.getByRole('group', { name: '执行命令', exact: true }).locator(`[data-hotkey-platform=${process.platform === 'darwin' ? 'mac' : 'windows'}] kbd`)).toHaveText(process.platform === 'darwin' ? '⌘ + R' : 'Ctrl + R');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__noReloadFixture = true; });
  await page.keyboard.press(`${primary}+r`);
  await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible();
  assert.equal(await page.evaluate(() => window.__noReloadFixture), true);
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${primary}+o`); await page.locator('.palette-input').fill('Note'); await page.keyboard.press('Enter');
  const content = page.locator('.workspace .main-pane .cm-content');
  await expect(content).toContainText('original text'); await content.click();
  await page.keyboard.press(`${primary}+m`);
  await expect(page.getByRole('dialog', { name: '移动到文件夹' })).toBeVisible();
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()), false);
  await page.keyboard.press('Escape'); await content.click();
  await page.keyboard.press(`${primary}+q`);
  await expect(page.locator('.workspace .main-pane [data-mode="source"]')).toBeVisible();
  assert.equal(app.windows().length, 1);
  await content.click(); await page.keyboard.press(`${primary}+End`);
  if (process.platform === 'darwin') await page.keyboard.press('Meta+ArrowDown');
  await page.keyboard.insertText('edit');
  await page.keyboard.press(`${primary}+z`);
  await expect(content).not.toContainText('edit');
  const before = await page.locator('.sidebar-dock').first().getAttribute('class');
  await page.keyboard.press(`${primary}+Shift+Z`);
  await expect.poll(() => page.locator('.sidebar-dock').first().getAttribute('class')).not.toBe(before);
  await expect(content).not.toContainText('edit');
  await page.keyboard.press(`${primary}+y`);
  await expect(content).toContainText('edit');
  await page.keyboard.press(`${primary}+s`);
  await expect.poll(() => fs.readFile(path.join(vault, 'Note.md'), 'utf8')).toContain('edit');
  // Maintenance actions are configurable and unassigned; no native menu consumes recording.
  if (process.platform === 'darwin') await page.keyboard.press('Control+Backquote');
  else {
    await page.keyboard.press(`${primary}+r`); await page.locator('.palette-input').fill('快捷键设置'); await page.keyboard.press('Enter');
  }
  if (process.platform === 'darwin') {
    await page.getByRole('button', { name: '快捷键', exact: true }).click();
  }
  const search = page.getByRole('searchbox', { name: '搜索快捷键' });
  await search.fill('app:reload');
  const row = page.getByRole('group', { name: '重新加载应用', exact: true });
  await expect(row.locator('kbd')).toHaveCount(0);
  const cell = row.locator(`[data-hotkey-platform="${process.platform === 'darwin' ? 'mac' : 'windows'}"]`);
  await cell.getByRole('button', { name: /^为 .* 添加快捷键$/ }).click();
  await cell.getByRole('textbox', { name: /^输入 .* 的组合键$/ }).fill('Ctrl+Shift+9');
  await cell.getByRole('button', { name: '添加', exact: true }).click();
  await expect(cell.locator('kbd')).toHaveText(process.platform === 'darwin' ? '⌘ + Shift + 9' : 'Ctrl + Shift + 9');
  await expect(cell.locator('.hotkey-recording')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await expect(page.locator('.settings-modal')).toHaveCount(0);
  await content.click();
  assert.equal(await page.evaluate(() => typeof window.shaleDesktop.runAction), 'function');
  await page.evaluate(() => window.shaleDesktop.runAction('app:zoom-in'));
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomLevel()), 0.5);
  await page.evaluate(() => window.shaleDesktop.runAction('app:reset-zoom'));
  await app.evaluate(({ BrowserWindow }) => { globalThis.__testInputs = []; BrowserWindow.getAllWindows()[0].webContents.on('before-input-event', (_event, input) => globalThis.__testInputs.push(input)); });
  const navigation = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame(), timeout: 8000 });
  void navigation.catch(() => {});
  try {
    await page.keyboard.press(`${primary}+Shift+9`);
    await navigation;
  } catch (error) {
    console.error('RELOAD_FAILURE', error);
    console.error('INPUTS', await app.evaluate(() => globalThis.__testInputs));
    if (!page.isClosed()) console.error('CONFIG', await page.evaluate(() => fetch('/api/settings/hotkeys').then(response => response.json())));
    if (!page.isClosed()) console.error('RELOAD_BODY', (await page.locator('body').innerText()).slice(-2500));
    console.error('SERVER_LOG', await fs.readFile(path.join(profile, 'logs/server.log'), 'utf8').catch(() => 'missing'));
    throw error;
  }
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('.workspace .main-pane .cm-content')).toContainText('edit');
  assert.equal(await page.evaluate(() => window.__noReloadFixture), undefined);
  await assert.rejects(() => page.evaluate(() => window.shaleDesktop.runAction('unrecognized-action')));
  console.log('PASS no native menu accelerators; user Command R/M/Q, undo vs sidebar/redo, Control-backtick, unassigned native actions, configured reload, saved content and IPC allowlist');
} finally {
  if (app) {
    await app.evaluate(({ app }) => { setImmediate(() => app.quit()); }).catch(() => {});
    await app.close().catch(() => {});
  }
  if (path.dirname(fixture) === base) await fs.rm(fixture, { recursive: true, force: true });
}
