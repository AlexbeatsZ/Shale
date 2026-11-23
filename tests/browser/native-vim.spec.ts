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

test('default Vim cursors follow the ordinary text color in light and dark themes', async ({ page }) => {
  const view = await editor(page);
  for (const theme of ['theme-light', 'theme-dark']) {
    await view.evaluate((element, theme) => {
      const root = element.closest('.theme-light, .theme-dark')!;
      root.classList.remove('theme-light', 'theme-dark'); root.classList.add(theme);
    }, theme);
    const text = await view.locator('.cm-content').evaluate(element => getComputedStyle(element).color);
    const block = view.locator('.cm-fat-cursor').first();
    await expect(block).toHaveCSS('outline-color', text);
    await expect(block).not.toHaveCSS('background-color', 'rgb(255, 150, 150)');
    await page.keyboard.press('i');
    await expect(view.locator('.cm-cursor').first()).toHaveCSS('border-left-color', text);
    await page.keyboard.press('Escape');
  }
});

test('cursor colors update per theme without resetting Vim mode, selection, history or input-method lease', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).vimRequests = [];
    (window as any).webobsidianDesktop = { inputMethod: { supported: true,
      update: async (request: unknown) => { (window as any).vimRequests.push(request); }, list: async () => [] } };
  });
  const view = await editor(page);
  await page.keyboard.press('i'); await page.keyboard.type('hello ');
  const requests = await page.evaluate(() => (window as any).vimRequests.length);
  const selection = await page.evaluate(async () => {
    const { getActiveEditor } = await import('/src/lib/activeEditor.ts');
    return getActiveEditor()!.state.selection.toJSON();
  });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ui: {
    vimEnabled: true, vimInputMethod: false, vimCursorLight: '#123456', vimCursorDark: '#abcdef',
  } } })));
  await expect(view.locator('.cm-cursor').first()).toHaveCSS('border-left-color', 'rgb(18, 52, 86)');
  await expect(view).toHaveAttribute('data-vim-mode', 'insert');
  expect(await page.evaluate(async () => {
    const { getActiveEditor } = await import('/src/lib/activeEditor.ts');
    return getActiveEditor()!.state.selection.toJSON();
  })).toEqual(selection);
  expect(await page.evaluate(() => (window as any).vimRequests.length)).toBe(requests);
  await page.keyboard.press('Escape');
  await expect(view.locator('.cm-fat-cursor').first()).toHaveCSS('outline-color', 'rgb(18, 52, 86)');
  await page.keyboard.press('v');
  await view.evaluate(element => {
    const root = element.closest('.theme-light, .theme-dark')!;
    root.classList.remove('theme-light'); root.classList.add('theme-dark');
  });
  await expect(view).toHaveAttribute('data-vim-mode', 'visual');
  await expect(view.locator('.cm-fat-cursor').first()).toHaveCSS('outline-color', 'rgb(171, 205, 239)');
  await page.keyboard.press('Escape'); await page.keyboard.press('u');
  await expect.poll(() => source(page)).toBe('alpha beta\nsecond line\n');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ui: { vimEnabled: true, vimInputMethod: false } } })));
  const text = await view.locator('.cm-content').evaluate(element => getComputedStyle(element).color);
  await expect(view.locator('.cm-fat-cursor').first()).toHaveCSS('outline-color', text);
  await page.evaluate(() => { const input = document.createElement('input'); document.body.append(input); input.focus(); });
  await expect(view.locator('.cm-fat-cursor').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(view.locator('.cm-fat-cursor').first()).toHaveCSS('outline-color', text);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ui: { vimEnabled: false } } })));
  await expect(view).not.toHaveAttribute('data-vim-mode');
  await expect(view).not.toHaveAttribute('style', /--vim-cursor-/);
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
