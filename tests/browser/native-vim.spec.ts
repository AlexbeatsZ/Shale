import { test, expect } from './test';
import type { Page } from '@playwright/test';

async function editor(page: Page, enabled = true) {
  await page.route('**/api/settings/**', route => route.fulfill({ json: { ui: { vimEnabled: enabled, vimInputMethod: false } } }));
  await page.goto('/__render-test');
  await page.waitForFunction(() => Boolean(window.renderHarness));
  await page.evaluate(async () => {
    const { ensureVimSettings } = await import('/src/lib/vimSettings.ts'); await ensureVimSettings();
    window.renderHarness.reset('alpha beta\nsecond line\n');
    window.renderHarness.cursor(0, 0); window.renderHarness.focus(0);
  });
  const view = page.locator('.cm-editor').first();
  await expect(view.locator('.cm-content')).toContainText('alpha beta');
  if (enabled) await expect(view).toHaveAttribute('data-vim-mode', 'normal');
  await page.evaluate(() => { window.renderHarness.cursor(0, 0); window.renderHarness.focus(0); });
  await expect(view.locator('.cm-content')).toBeFocused();
  return view;
}
const source = (page: Page) => page.evaluate(() => window.renderHarness.source(0));

test('Vim is opt-in and changing the setting reconfigures the existing editor', async ({ page }) => {
  const view = await editor(page, false);
  await expect(view).not.toHaveAttribute('data-vim-mode');
  await page.keyboard.type('i');
  await expect.poll(() => source(page)).toBe('ialpha beta\nsecond line\n');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ui: { vimEnabled: true, vimInputMethod: false } } })));
  await expect(view).toHaveAttribute('data-vim-mode', 'normal');
  await page.evaluate(() => window.renderHarness.cursor(0, 0));
  await page.keyboard.type('x');
  await expect.poll(() => source(page)).toBe('alpha beta\nsecond line\n');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ui: { vimEnabled: false } } })));
  await expect(view).not.toHaveAttribute('data-vim-mode');
});

test('Normal motions/delete, Insert, Visual and native undo/redo share one history', async ({ page }) => {
  const view = await editor(page);
  await page.keyboard.type('dw');
  await expect.poll(() => source(page)).toBe('beta\nsecond line\n');
  await page.keyboard.press('u');
  await expect.poll(() => source(page)).toBe('alpha beta\nsecond line\n');
  await page.keyboard.press('Control+r');
  await expect.poll(() => source(page)).toBe('beta\nsecond line\n');
  await page.keyboard.press('i');
  await expect(view).toHaveAttribute('data-vim-mode', 'insert');
  await page.keyboard.type('中文 XYZ');
  await page.keyboard.press('Escape');
  await expect(view).toHaveAttribute('data-vim-mode', 'normal');
  await page.keyboard.press('u');
  await expect.poll(() => source(page)).toBe('beta\nsecond line\n');
  await page.keyboard.press('v');
  await expect(view).toHaveAttribute('data-vim-mode', 'visual');
  await page.keyboard.press('Escape');
  await expect(view).toHaveAttribute('data-vim-mode', 'normal');
  await page.evaluate(() => window.renderHarness.mode(0, 'reading'));
  await expect(view).not.toHaveAttribute('data-vim-mode');
});

test('rapid native mode requests preserve focus ownership and release on blur/disable', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).vimRequests = [];
    (window as any).webobsidianDesktop = { inputMethod: { supported: true,
      update: async (request: unknown) => { (window as any).vimRequests.push(request); }, list: async () => [] } };
  });
  const view = await editor(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ui: { vimEnabled: true, vimInputMethod: true } } })));
  await page.keyboard.press('i'); await page.keyboard.press('Escape'); await page.keyboard.press('a');
  await expect(view).toHaveAttribute('data-vim-mode', 'insert');
  await expect.poll(() => page.evaluate(() => (window as any).vimRequests.filter((r: any) => r.mode === 'insert').length)).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => { const input = document.createElement('input'); document.body.append(input); input.focus(); });
  await expect.poll(() => page.evaluate(() => (window as any).vimRequests.at(-1)?.mode)).toBe('release');
  await view.locator('.cm-content').focus();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ui: { vimEnabled: false } } })));
  await expect(view).not.toHaveAttribute('data-vim-mode');
  await expect.poll(() => page.evaluate(() => (window as any).vimRequests.at(-1)?.mode)).toBe('release');
});

test('change-word and its insertion undo together; dot repeats the last Vim edit', async ({ page }) => {
  await editor(page);
  await page.keyboard.type('ciw');
  await page.keyboard.type('hello'); await page.keyboard.press('Escape');
  await expect.poll(() => source(page)).toBe('hello beta\nsecond line\n');
  await page.keyboard.press('u');
  await expect.poll(() => source(page)).toBe('alpha beta\nsecond line\n');
  await page.keyboard.press('Control+r');
  await page.keyboard.type('w.');
  await expect.poll(() => source(page)).toBe('hello hello\nsecond line\n');
});

test('native snippets run in Insert and remain in the Vim insertion undo group', async ({ page }) => {
  await page.route('**/api/writing', route => route.fulfill({ json: { version: 1, migration: 'vim fixture',
    latex: { loadSnippetsFromFile: false, loadSnippetVariablesFromFile: false,
      snippets: '[{trigger:"mk",replacement:"\\\\($0\\\\)",options:"tA"}]', snippetVariables: '{}' }, linter: {}, hotkeys: {} } }));
  await editor(page);
  await page.evaluate(async () => {
    const { ensureWriting } = await import('/src/lib/writing/config.ts'); await ensureWriting();
    const { StateEffect } = await import('/node_modules/.vite/deps/@codemirror_state.js');
    const { getActiveEditor } = await import('/src/lib/activeEditor.ts');
    const { nativeWritingExtensions } = await import('/src/lib/writing/extensions.ts');
    getActiveEditor()!.dispatch({ effects: StateEffect.appendConfig.of(nativeWritingExtensions()) });
  });
  await page.keyboard.type('i'); await page.keyboard.type('mk');
  await expect.poll(() => source(page)).toBe('\\(\\)alpha beta\nsecond line\n');
  await page.keyboard.press('Escape'); await page.keyboard.press('u');
  await expect.poll(() => source(page)).toBe('alpha beta\nsecond line\n');
});
