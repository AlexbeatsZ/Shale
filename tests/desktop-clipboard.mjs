import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { _electron as electron, expect } from '@playwright/test';

const base = process.platform === 'win32' ? path.join(os.tmpdir(), '.agents') : '/tmp/.agents';
await fs.mkdir(base, { recursive: true });
const fixture = await fs.mkdtemp(path.join(base, 'shale-clipboard-'));
const vault = path.join(fixture, 'vault'), profile = path.join(fixture, 'profile');
await fs.mkdir(path.join(vault, '.shale'), { recursive: true });
await fs.mkdir(profile);
await fs.writeFile(path.join(vault, 'Note.md'), 'original note\n');
if (process.env.CLIPBOARD_TEST_HOTKEYS) await fs.copyFile(process.env.CLIPBOARD_TEST_HOTKEYS, path.join(vault, '.shale/hotkeys.jsonc'));
await fs.writeFile(path.join(profile, 'desktop-config.json'), JSON.stringify({ vaultPath: vault, trustedPlugins: false }));
const server = createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end(
  '<!DOCTYPE html><title>Clipboard fixture</title><p id="text">guest selection</p><input id="input"><textarea id="textarea"></textarea><div id="editable" contenteditable="true"></div>'));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const [executablePath, ...args] = process.argv.slice(2);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';
const execFile = promisify(execFileCallback);
let app;
const failures = [];
try {
  app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`, '--use-mock-keychain', ...args], cwd: fixture, env, timeout: 120000 });
  // Preserve every clipboard format without reading the user's data into test output.
  await app.evaluate(({ clipboard }) => {
    globalThis.__savedClipboard = clipboard.availableFormats().map(format => [format, clipboard.readBuffer(format)]);
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 120000 });
  await expect(page.locator('.workspace-launcher')).toBeVisible({ timeout: 60000 });
  await page.bringToFront();
  const command = async name => {
    await page.keyboard.press(`${primary}+p`);
    await page.locator('.palette-input').fill(name);
    await page.keyboard.press('Enter');
    await expect(page.locator('.palette-backdrop')).toHaveCount(0);
  };
  const settings = ui => page.evaluate(async ui => {
    const identity = await (await fetch('/api/vault-identity')).json();
    const response = await fetch('/api/settings/', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Vault-Identity': identity.vault }, body: JSON.stringify({ ui }) });
    if (!response.ok) throw new Error(await response.text());
    window.dispatchEvent(new CustomEvent('settings-changed', { detail: await response.json() }));
  }, ui);
  const writeClipboard = text => app.evaluate(({ clipboard }, text) => clipboard.writeText(text), text);
  const readClipboard = () => app.evaluate(({ clipboard }) => clipboard.readText());
  const hostKey = key => app.evaluate(({ BrowserWindow }, { key, primary }) => {
    const view = BrowserWindow.getAllWindows()[0].webContents, modifiers = [primary.toLowerCase()];
    view.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers });
    view.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers });
  }, { key, primary });
  const osKey = async key => {
    if (process.platform !== 'darwin') return;
    if (!process.env.CLIPBOARD_OS_KEYS) return;
    const pid = await app.evaluate(({ app, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]; window.show(); window.focus();
      app.focus({ steal: true });
      return process.pid;
    });
    const code = { c: 8, v: 9, x: 7, a: 0, z: 6 }[key];
    await execFile('/usr/bin/python3', ['-c', `import ctypes, sys, time
api = ctypes.CDLL('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices')
api.AXIsProcessTrusted.restype = ctypes.c_bool
if not api.AXIsProcessTrusted(): raise RuntimeError('OS keyboard acceptance requires existing Accessibility permission')
api.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p, ctypes.c_ushort, ctypes.c_bool]
api.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
api.CGEventSetFlags.argtypes = [ctypes.c_void_p, ctypes.c_ulonglong]
api.CGEventPostToPid.argtypes = [ctypes.c_int, ctypes.c_void_p]
cf = ctypes.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
cf.CFRelease.argtypes = [ctypes.c_void_p]
for down in (True, False):
    event = api.CGEventCreateKeyboardEvent(None, int(sys.argv[2]), down)
    api.CGEventSetFlags(event, 1 << 20)
    api.CGEventPostToPid(int(sys.argv[1]), event)
    cf.CFRelease(event)
    time.sleep(0.03)
`, String(pid), String(code)]);
  };
  const check = (label, actual, expected) => {
    console.log(JSON.stringify({ label, actual, expected, pass: actual === expected }));
    if (actual !== expected) failures.push(label);
  };
  await page.getByRole('button', { name: '打开网页浏览器', exact: true }).first().click();
  const main = page.locator('.workspace .main-pane');
  const address = main.getByRole('textbox', { name: '网页地址' });
  await address.fill(origin); await address.press('Enter');
  const guestId = await main.locator('webview').evaluate(element => element.getWebContentsId());
  const guest = expression => app.evaluate(({ webContents }, { guestId, expression }) => webContents.fromId(guestId).executeJavaScript(expression, true), { guestId, expression });
  await expect.poll(() => guest('!!document.getElementById("input")')).toBe(true);
  const guestKey = key => app.evaluate(({ webContents }, { guestId, key, primary }) => {
    const view = webContents.fromId(guestId), modifiers = [primary.toLowerCase()];
    view.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers });
    view.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers });
  }, { guestId, key, primary });
  for (const vimEnabled of [false, true]) {
    await settings({ vimEnabled, vimInputMethod: false });
    const label = `vim=${vimEnabled}`;
    await address.fill(''); await address.focus(); await writeClipboard('https://clipboard.example/中文');
    await page.keyboard.press(`${primary}+v`);
    await page.waitForTimeout(100);
    check(`${label} address paste`, await address.inputValue(), 'https://clipboard.example/中文');
    await address.fill('host selection'); await address.selectText(); await page.keyboard.press(`${primary}+c`);
    await page.waitForTimeout(100);
    check(`${label} address copy`, await readClipboard(), 'host selection');
    await address.fill(''); await address.focus(); await writeClipboard('native address paste');
    await hostKey('V'); await page.waitForTimeout(100);
    check(`${label} native address paste`, await address.inputValue(), 'native address paste');
    if (process.platform === 'darwin' && process.env.CLIPBOARD_OS_KEYS) {
      await address.fill(''); await address.focus(); await writeClipboard('system address paste');
      await osKey('v'); await page.waitForTimeout(150);
      check(`${label} OS address paste`, await address.inputValue(), 'system address paste');
    }
    await main.locator('webview').click();
    for (const id of ['input', 'textarea', 'editable']) {
      await guest(`document.getElementById('${id}').focus(); true`);
      await writeClipboard(`guest paste ${label}`); await guestKey('V');
      await page.waitForTimeout(100);
      check(`${label} guest ${id} paste`, await guest(`document.getElementById('${id}').${id === 'editable' ? 'textContent' : 'value'}`), `guest paste ${label}`);
      await guestKey('A'); await writeClipboard('before field copy'); await guestKey('C'); await page.waitForTimeout(100);
      check(`${label} guest ${id} select/copy`, await readClipboard(), `guest paste ${label}`);
      await guestKey('X'); await page.waitForTimeout(100);
      check(`${label} guest ${id} cut`, await guest(`document.getElementById('${id}').${id === 'editable' ? 'textContent' : 'value'}`), '');
      await guestKey('Z'); await page.waitForTimeout(100);
      check(`${label} guest ${id} undo`, await guest(`document.getElementById('${id}').${id === 'editable' ? 'textContent' : 'value'}`), `guest paste ${label}`);
      await guest(`document.getElementById('${id}').${id === 'editable' ? 'textContent' : 'value'} = ''; true`);
    }
    await guest('document.activeElement.blur(); getSelection().selectAllChildren(document.getElementById("text")); true');
    await writeClipboard('before copy'); await guestKey('C'); await page.waitForTimeout(100);
    check(`${label} guest copy`, await readClipboard(), 'guest selection');
    await guest('document.getElementById("input").focus(); true');
    await writeClipboard(`menu paste ${label}`);
    await app.evaluate(({ Menu }) => {
      const edit = Menu.getApplicationMenu().items.find(item => item.label === '编辑');
      edit.submenu.items.find(item => item.id === 'native:paste').click();
    });
    await page.waitForTimeout(100);
    check(`${label} guest menu paste`, await guest('document.getElementById("input").value'), `menu paste ${label}`);
    await guest('document.getElementById("input").value = ""; true');
    // The page still owns editing keys, while application commands reach the host.
    await guestKey('P'); await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(failures, [], 'Native clipboard regressions');
  await page.keyboard.press(`${primary}+o`); await page.locator('.palette-input').fill('Note'); await page.keyboard.press('Enter');
  const note = main.locator('.cm-content'), editor = main.locator('.cm-editor');
  await expect(editor).toHaveAttribute('data-vim-mode', 'normal');
  await note.click(); await page.keyboard.press('i'); await expect(editor).toHaveAttribute('data-vim-mode', 'insert');
  await page.keyboard.press(`${primary}+a`); await writeClipboard('Vim Insert clipboard');
  await hostKey('V'); await expect(note).toHaveText('Vim Insert clipboard');
  await page.keyboard.press(`${primary}+z`); await expect(note).toContainText('original note');
  await page.keyboard.press('Escape'); await page.keyboard.press('Control+v');
  await expect(editor).toHaveAttribute('data-vim-mode', 'visual');
  await page.keyboard.press('Escape');
  // A custom application binding still has priority over a host edit fallback.
  await command('快捷键设置');
  await page.getByRole('searchbox', { name: '搜索快捷键' }).fill('commands');
  const cell = page.getByRole('group', { name: '执行命令', exact: true }).locator(`[data-hotkey-platform="${process.platform === 'darwin' ? 'mac' : 'windows'}"]`);
  await cell.getByRole('button', { name: /^为 .* 添加快捷键$/ }).click();
  await cell.getByRole('textbox', { name: /^输入 .* 的组合键$/ }).fill('Ctrl+V');
  await cell.getByRole('button', { name: '添加', exact: true }).click();
  await expect(cell.getByRole('textbox', { name: /^输入 .* 的组合键$/ })).toHaveCount(0);
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await note.click(); await page.keyboard.press('i'); await page.keyboard.press(`${primary}+v`);
  await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible();
  await page.keyboard.press('Escape');
  await assert.rejects(() => page.evaluate(() => window.shaleDesktop.runEditAction('reload')));
  assert.deepEqual(failures, [], 'Native clipboard regressions');
  console.log('PASS: native host and WebViewer clipboard with Vim off/on');
} finally {
  if (app) {
    await app.evaluate(({ clipboard }) => {
      if (!globalThis.__savedClipboard) return;
      clipboard.clear();
      for (const [format, buffer] of globalThis.__savedClipboard) clipboard.writeBuffer(format, buffer);
      delete globalThis.__savedClipboard;
    }).catch(() => {});
    await app.close().catch(() => {});
  }
  server.close();
  await fs.rm(fixture, { recursive: true, force: true });
}
