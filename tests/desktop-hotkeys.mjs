import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { _electron as electron, expect } from '@playwright/test';

const base = '/tmp/.agents';
await fs.mkdir(base, { recursive: true });
const fixture = await fs.mkdtemp(path.join(base, 'shale-hotkeys-'));
const vault = path.join(fixture, 'vault'), profile = path.join(fixture, 'profile');
await fs.mkdir(path.join(vault, '.shale'), { recursive: true });
await fs.mkdir(profile);
await fs.writeFile(path.join(vault, 'Note.md'), 'body title\n\nlast line\n');
const filename = path.join(vault, '.shale/hotkeys.jsonc');
await fs.writeFile(filename, JSON.stringify({ version: 1, bindings: {
  'editor:set-heading-7': [{ modifiers: ['Ctrl', 'Alt'], key: '7' }],
}, platforms: {} }));
await fs.writeFile(path.join(profile, 'desktop-config.json'), JSON.stringify({ vaultPath: vault, trustedPlugins: false }));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';
const [executablePath, ...args] = process.argv.slice(2);
let app;
try {
  app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`, '--use-mock-keychain', ...args], cwd: fixture, env, timeout: 120000 });
  const page = await app.firstWindow();
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 120000 });
  await expect(page.locator('.workspace-launcher')).toBeVisible({ timeout: 60000 });
  const open = async () => {
    await page.keyboard.press(`${primary}+o`);
    await page.locator('.palette-input').fill('Note'); await page.keyboard.press('Enter');
    await expect(page.locator('.workspace .main-pane .cm-content')).toContainText('body title');
  };
  await open();
  const content = page.locator('.workspace .main-pane .cm-content');
  await content.click();
  await page.keyboard.press(`${primary}+Home`);
  if (process.platform === 'darwin') await page.keyboard.press('Meta+ArrowUp');
  await page.keyboard.press(`${primary}+Alt+7`);
  await expect(content).toContainText('body title');
  await page.keyboard.press(`${primary}+s`);
  await expect.poll(() => fs.readFile(path.join(vault, 'Note.md'), 'utf8')).toMatch(/^####### body title/);
  await page.keyboard.press(`${primary}+z`);
  await page.keyboard.press(`${primary}+s`);
  await expect.poll(() => fs.readFile(path.join(vault, 'Note.md'), 'utf8')).toMatch(/^body title/);
  await page.keyboard.press(`${primary}+Shift+Z`);
  await page.keyboard.press(`${primary}+s`);
  await expect.poll(() => fs.readFile(path.join(vault, 'Note.md'), 'utf8')).toMatch(/^####### body title/);
  // Cmd+W must close the tab without the native menu closing the window.
  await page.keyboard.press(`${primary}+w`);
  await expect(page.locator('.workspace-launcher')).toBeVisible();
  assert.equal(app.windows().length, 1);
  await open();
  // Replace the synchronized file externally. The watcher must update the live dispatch index.
  const updated = JSON.parse(await fs.readFile(filename, 'utf8'));
  updated.platforms[process.platform === 'darwin' ? 'mac' : 'windows'] = {
    'editor:set-heading-7': [{ modifiers: ['PhysicalCtrl', 'Alt'], key: '8' }],
  };
  await fs.writeFile(filename, JSON.stringify(updated));
  await page.keyboard.press(`${primary}+p`);
  await page.locator('.palette-input').fill('快捷键设置'); await page.keyboard.press('Enter');
  await page.getByRole('searchbox', { name: '搜索快捷键' }).fill('editor:set-heading-7');
  const row = page.getByRole('group', { name: '设为 7 级标题（正文内标题）' });
  await expect(row.locator(`[data-hotkey-platform="${process.platform === 'darwin' ? 'mac' : 'windows'}"] kbd`))
    .toHaveText(process.platform === 'darwin' ? 'Control + Option + 8' : 'Ctrl + Alt + 8');
  await page.keyboard.press('Escape');
  await content.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home');
  await page.keyboard.press(`${primary}+p`);
  await page.locator('.palette-input').fill('取消标题'); await page.keyboard.press('Enter');
  await page.keyboard.press(`${primary}+s`);
  await expect.poll(() => fs.readFile(path.join(vault, 'Note.md'), 'utf8')).toMatch(/^body title/);
  await content.click();
  if (process.platform === 'darwin') await page.keyboard.press('Meta+ArrowUp');
  else await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+Alt+8');
  await page.keyboard.press(`${primary}+s`);
  await expect.poll(() => fs.readFile(path.join(vault, 'Note.md'), 'utf8')).toMatch(/^####### body title/);
  const disk = JSON.parse(await fs.readFile(filename, 'utf8'));
  assert.deepEqual(disk.platforms, updated.platforms);
  console.log('PASS packaged primary commands, heading 7, shared history, Cmd+W, synchronized Control override and both settings columns');
} finally {
  if (app) {
    await app.evaluate(({ app }) => { setImmediate(() => app.quit()); });
    await app.close().catch(() => {});
  }
  if (path.dirname(fixture) === base) await fs.rm(fixture, { recursive: true, force: true });
}
