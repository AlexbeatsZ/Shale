import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect } from '@playwright/test';

const base = process.platform === 'win32' ? path.join(os.tmpdir(), '.agents') : '/tmp/.agents';
await fs.mkdir(base, { recursive: true });
const fixture = await fs.mkdtemp(path.join(base, 'shale-writing-'));
const vault = path.join(fixture, 'vault'), profile = path.join(fixture, 'profile');
await fs.mkdir(path.join(vault, '.shale'), { recursive: true });
await fs.mkdir(profile);
const note = path.join(vault, 'Note.md');
const original = 'Wigner 的 $2k+1$ 规则\n\n$$x \\tag{1} \\label{eq:x}$$\n\nlast line';
await fs.writeFile(note, original);
await fs.writeFile(path.join(vault, '.shale/writing.jsonc'), JSON.stringify({ version: 1, latex: {}, linter: { lintOnSave: false }, hotkeys: {} }));
await fs.writeFile(path.join(vault, '.shale/hotkeys.jsonc'), JSON.stringify({ version: 1, bindings: {
  'editor:set-heading-2': [{ modifiers: ['Alt'], key: '2' }],
  'editor:set-heading-0': [{ modifiers: ['Alt'], key: '0' }],
}, platforms: {} }));
await fs.writeFile(path.join(profile, 'desktop-config.json'), JSON.stringify({ vaultPath: vault, trustedPlugins: false }));
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';
const [executablePath, ...args] = process.argv.slice(2);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`, '--use-mock-keychain', ...args], cwd: fixture, env, timeout: 120000 });
  await app.evaluate(({ clipboard }) => { globalThis.__writingClipboard = clipboard.availableFormats().map(type => [type, clipboard.readBuffer(type)]); });
  const page = await app.firstWindow();
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 120000 });
  await expect(page.locator('.workspace-launcher')).toBeVisible({ timeout: 60000 });
  await page.bringToFront();
  await page.keyboard.press(`${primary}+o`);
  await page.locator('.palette-input').fill('Note'); await page.keyboard.press('Enter');
  const content = page.locator('.workspace .main-pane .cm-content');
  const view = page.locator('.workspace .main-pane .cm-editor');
  await expect(content).toContainText('Wigner');
  await content.focus();
  const home = () => page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home');
  const save = async () => { await page.keyboard.press(`${primary}+s`); };
  await home(); await page.keyboard.press('Alt+2'); await save();
  await expect.poll(() => fs.readFile(note, 'utf8')).toBe('## ' + original);
  await page.keyboard.press(`${primary}+z`); await save();
  await expect.poll(() => fs.readFile(note, 'utf8')).toBe(original);
  await page.keyboard.press('Alt+2'); await page.keyboard.press('Alt+0'); await save();
  await expect.poll(() => fs.readFile(note, 'utf8')).toBe(original);
  await page.keyboard.press(`${primary}+a`); await page.keyboard.press(`${primary}+c`);
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), original);

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '编辑器', exact: true }).click();
  await page.getByRole('combobox', { name: '行号', exact: true }).selectOption('absolute');
  await expect(page.getByRole('combobox', { name: '行号', exact: true })).toHaveValue('absolute');
  await page.keyboard.press('Escape');
  const gutter = view.locator('.cm-lineNumbers');
  const numbers = () => gutter.locator('.cm-gutterElement').evaluateAll(elements => elements
    .filter(element => !(element.style.visibility.includes('hidden'))).map(element => element.textContent));
  await expect(gutter).toHaveCount(1);
  await expect.poll(numbers).toContain('1');
  const geometry = await view.evaluate(root => {
    const content = root.querySelector('.cm-content').getBoundingClientRect();
    const gutter = root.querySelector('.cm-gutters').getBoundingClientRect();
    const title = root.querySelector('.cm-note-title-row')?.getBoundingClientRect();
    return { content: { top: content.top, left: content.left }, gutter: { top: gutter.top, right: gutter.right }, title: title && { bottom: title.bottom } };
  });
  assert.ok(Math.abs(geometry.content.top - geometry.gutter.top) < 2, JSON.stringify(geometry));
  assert.ok(geometry.gutter.right <= geometry.content.left + 2, JSON.stringify(geometry));

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '编辑器', exact: true }).click();
  await page.getByRole('combobox', { name: '行号', exact: true }).selectOption('relative');
  await page.keyboard.press('Escape'); await content.focus(); await home();
  await expect.poll(numbers).toContain('0');
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => {
    const values = await numbers();
    return { zeros: values.filter(value => value === '0').length, first: values[0] };
  }).toEqual({ zeros: 1, first: '1' });
  // Sidebars intentionally float over the document; close the isolated fixture's
  // docks to verify the gutter is actually visible, not merely present in DOM.
  const docks = ['折叠/展开左侧边栏', '折叠/展开右侧边栏'];
  const closed = [];
  for (const name of docks) {
    const button = page.getByRole('button', { name, exact: true });
    if (await button.getAttribute('aria-expanded') === 'true') { await button.click(); closed.push(name); }
  }
  for (const side of ['left', 'right']) await expect(page.locator('.dock-' + side)).toHaveCSS('visibility', 'hidden');
  await expect.poll(() => view.locator('.cm-gutterElement').filter({ hasText: /^0$/ }).evaluate(element => {
    const r = element.getBoundingClientRect();
    return !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.cm-gutters');
  })).toBe(true);
  if (process.env.WRITING_SCREENSHOT) await page.screenshot({ path: process.env.WRITING_SCREENSHOT });
  for (const name of closed) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '编辑器', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '行号', exact: true })).toHaveValue('relative');
  await page.keyboard.press('Escape'); await content.focus();

  const incoming = String.raw`\[y \tag*{\text{A {B}}} \label{eq:y}\]`;
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), incoming);
  await page.keyboard.press(`${primary}+a`); await page.keyboard.press(`${primary}+v`); await save();
  await expect.poll(() => fs.readFile(note, 'utf8')).toBe(String.raw`\[y \label{eq:y}\]`);
  await page.keyboard.press(`${primary}+z`); await save();
  await expect.poll(() => fs.readFile(note, 'utf8')).toBe(original);
  // Manual format cleans existing source too, separately from paste.
  await page.keyboard.press(`${primary}+p`); await page.locator('.palette-input').fill('格式化当前文档'); await page.keyboard.press('Enter');
  await save();
  await expect.poll(() => fs.readFile(note, 'utf8')).toBe(original.replace(' \\tag{1}', ''));
  console.log('PASS packaged Option headings with inline math, copy preservation, paste/format tag cleanup, undo, persisted absolute/relative gutters and title geometry');
} finally {
  if (app) {
    await app.evaluate(({ clipboard, app }) => {
      if (globalThis.__writingClipboard) { clipboard.clear(); for (const [type, buffer] of globalThis.__writingClipboard) clipboard.writeBuffer(type, buffer); }
      setImmediate(() => app.quit());
    }).catch(() => {});
    await app.close().catch(() => {});
  }
  if (path.dirname(fixture) === base) await fs.rm(fixture, { recursive: true, force: true });
}
