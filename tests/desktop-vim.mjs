import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { _electron as electron, expect } from '@playwright/test';

const base = path.join(os.tmpdir(), '.agents');
await fs.mkdir(base, { recursive: true });
const fixture = await fs.mkdtemp(path.join(base, 'shale-vim-'));
const vault = path.join(fixture, 'vault'), profile = path.join(fixture, 'profile');
await fs.mkdir(path.join(vault, '.obsidian/webobsidian'), { recursive: true }); await fs.mkdir(profile);
await fs.writeFile(path.join(vault, 'Note.md'), 'alpha beta\nsecond line\n');
await fs.writeFile(path.join(profile, 'desktop-config.json'), JSON.stringify({ vaultPath: vault, trustedPlugins: false }));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';
const [executablePath, ...args] = process.argv.slice(2);
const run = promisify(execFile);
let app, initial, helper, pid, page;
const native = async (action, state) => JSON.parse((await run(helper, [action, ...(action === 'list' ? [] : [String(pid)]), ...(state ? [JSON.stringify(state)] : [])], { timeout: 5000, windowsHide: true })).stdout);
try {
  app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`, ...args], cwd: fixture, env, timeout: 120000 });
  page = await app.firstWindow();
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 120000 });
  await expect(page.locator('.workspace-launcher')).toBeVisible({ timeout: 60000 });
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.show(); win.focus(); });
  await page.keyboard.press(`${primary}+o`);
  await page.locator('.palette-input').fill('Note'); await page.keyboard.press('Enter');
  const view = page.locator('.workspace .main-pane .cm-editor').first(), content = view.locator('.cm-content');
  await expect(content).toContainText('alpha beta'); await content.focus();
  const nativeHost = await app.evaluate(() => ({ pid: process.pid, resources: process.resourcesPath, platform: process.platform }));
  pid = nativeHost.pid; helper = path.join(nativeHost.resources, 'input-method', nativeHost.platform === 'win32' ? 'im-select.exe' : 'im-select');
  initial = await native('get');
  const sources = await native('list');
  const english = sources.find(source => source.english);
  const chinese = sources.find(source => /Squirrel|Pinyin|pinyin|0804|0404|Chinese/i.test(source.id) && !source.english);
  assert.ok(english, 'an enabled English input source must exist');
  assert.ok(chinese, 'an enabled Chinese input source must exist for this acceptance');
  const chineseState = { source: chinese.id, open: true, conversion: 1 };
  const englishID = english.id.replace(/^ime:/, '');
  const settings = async ui => page.evaluate(async ui => {
    const identity = await (await fetch('/api/vault-identity')).json();
    const response = await fetch('/api/settings/', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Vault-Identity': identity.vault }, body: JSON.stringify({ ui }) });
    if (!response.ok) throw new Error(await response.text());
    const settings = await response.json(); window.dispatchEvent(new CustomEvent('settings-changed', { detail: settings }));
  }, ui);
  const settled = async () => expect(view).not.toHaveAttribute('data-vim-input-pending');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '编辑器', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '启用 Vim', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: '启用 Vim', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '启用 Vim', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '自动切换输入法', exact: true })).toBeChecked();
  await page.keyboard.press('Escape'); await content.focus();
  await page.keyboard.press('i'); await settled();
  await native('select', chineseState);
  await page.keyboard.press('Escape'); await settled();
  await settings({ vimEnabled: true, vimInputMethod: true });
  await expect(view).toHaveAttribute('data-vim-mode', 'normal'); await settled();
  await expect.poll(async () => (await native('get')).source).toBe(englishID);
  await page.keyboard.press('i'); await expect(view).toHaveAttribute('data-vim-mode', 'insert'); await settled();
  await expect.poll(async () => (await native('get')).source).toBe(chinese.id);
  if (process.platform === 'win32') assert.equal((await native('get')).open, true);
  if (process.env.VIM_OS_KEYS) {
    // Optional OS-level composition acceptance. CGEvent goes through the actual
    // input method, unlike Chromium's synthetic text insertion.
    const keys = process.platform === 'darwin' ? ['45', '34', '4', '0', '31', '49'] : ['78', '73', '72', '65', '79', '32'];
    await run(process.env.VIM_OS_KEYS, [String(pid), ...keys]);
    await expect(content).toContainText('你好');
    await page.keyboard.press('Escape'); await settled(); await page.keyboard.press('u');
    await page.keyboard.press('i'); await settled();
  }
  await page.keyboard.insertText('中文测试');
  await page.keyboard.press('Escape'); await settled();
  await expect.poll(async () => (await native('get')).source).toBe(englishID);
  await page.keyboard.press('u'); await expect(content).toHaveText('alpha betasecond line');
  await page.keyboard.press('Control+r'); await expect(content).toContainText('中文测试');
  await page.keyboard.press('i'); await settled();
  await native('select', { source: english.id, open: false });
  await page.keyboard.press('Escape'); await page.keyboard.press('a'); await settled();
  await expect.poll(async () => (await native('get')).source).toBe(englishID);
  await native('select', chineseState);
  await page.keyboard.press('Escape'); await page.keyboard.press('i'); await page.keyboard.press('Escape'); await page.keyboard.press('a'); await settled();
  await expect.poll(async () => (await native('get')).source).toBe(chinese.id);
  await page.keyboard.press('Escape'); await settled();
  await page.keyboard.type(':w'); await page.keyboard.press('Enter');
  await expect.poll(() => fs.readFile(path.join(vault, 'Note.md'), 'utf8')).toContain('中文测试');
  await settings({ vimEnabled: false }); await expect(view).not.toHaveAttribute('data-vim-mode'); await settled();
  await expect.poll(async () => (await native('get')).source).toBe(chinese.id);
  console.log(`PASS packaged Vim modes, Chinese/English restoration, remembered English, rapid transitions, native undo/redo, :w and disable restoration (${process.platform})`);
  console.log(JSON.stringify({ english: english.id, chinese: chinese.id, original: initial }));
} finally {
  if (app) {
    if (initial) {
      await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.show(); win.focus(); }).catch(() => {});
      if (page) await page.evaluate(() => window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ui: { vimEnabled: false } } }))).catch(() => {});
      await native('select', initial).catch(error => { console.error('Could not restore original input source:', error.message); process.exitCode = 1; });
    }
    await app.evaluate(({ app }) => { setImmediate(() => app.quit()); }).catch(() => {});
    await app.close().catch(() => {});
  }
  if (path.dirname(fixture) === base) await fs.rm(fixture, { recursive: true, force: true });
}
