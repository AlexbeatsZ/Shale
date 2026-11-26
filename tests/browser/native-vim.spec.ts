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

test('Insert undo stops at a pause, caret movement and a separate insertion', async ({ page }) => {
  await editor(page);
  await page.keyboard.press('i'); await page.keyboard.type('first');
  await page.waitForTimeout(650);
  await page.keyboard.type('second'); await page.keyboard.press('Escape'); await page.keyboard.press('u');
  await expect.poll(() => source(page)).toBe('firstalpha beta\nsecond line\n');
  await page.keyboard.press('Control+r');
  await expect.poll(() => source(page)).toBe('firstsecondalpha beta\nsecond line\n');
  await page.keyboard.press('i'); await page.keyboard.type('third');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.type('X');
  await page.keyboard.press('Escape'); await page.keyboard.press('u');
  expect(await source(page)).toContain('third'); expect(await source(page)).not.toContain('X');
  await page.keyboard.press('u');
  await expect.poll(() => source(page)).toBe('firstsecondalpha beta\nsecond line\n');
});

test('native clipboard fallback leaves Vim Control chords and shared undo with the editor', async ({ page }) => {
  const view = await editor(page);
  await page.evaluate(async () => {
    const { dispatchNativeEdit } = await import('/src/lib/nativeEditShortcuts.ts');
    (window as any).nativeEditCalls = [];
    (window as any).shaleDesktop = { platform: 'win32', runEditAction: async (action: string) => { (window as any).nativeEditCalls.push(action); } };
    window.addEventListener('keydown', event => {
      if (dispatchNativeEdit(event)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
  });
  await page.keyboard.press('Control+v');
  await expect(view).toHaveAttribute('data-vim-mode', 'visual');
  expect(await page.evaluate(() => (window as any).nativeEditCalls)).toEqual([]);
  await page.keyboard.press('Escape'); await page.keyboard.press('i');
  await page.keyboard.press('Control+v');
  expect(await page.evaluate(() => (window as any).nativeEditCalls)).toEqual(['paste']);
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => (window as any).nativeEditCalls)).toEqual(['paste']);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const input = document.createElement('input'); input.id = 'address-fixture'; document.body.append(input); input.focus(); });
  await page.keyboard.press('Control+v'); await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => (window as any).nativeEditCalls)).toEqual(['paste', 'paste', 'undo']);
  await expect(view).toHaveAttribute('data-vim-mode', 'normal');
});

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
    await expect(view.locator('.cm-content')).toHaveCSS('caret-color', text);
    await page.keyboard.press('Escape');
  }
});

test('cursor colors update per theme without resetting Vim mode, selection, history or input-method lease', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).vimRequests = [];
    (window as any).shaleDesktop = { inputMethod: { supported: true,
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
  await expect(view.locator('.cm-content')).toHaveCSS('caret-color', 'rgb(18, 52, 86)');
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
    (window as any).shaleDesktop = { inputMethod: { supported: true,
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
  await page.route('**/api/writing', route => route.fulfill({ json: { version: 1, latex: { loadSnippetsFromFile: false, loadSnippetVariablesFromFile: false,
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


test('native caret and text ranges survive Vim toggles and opaque callouts in both themes', async ({ page }) => {
  const view = await editor(page, false);
  for (const theme of ['theme-light', 'theme-dark']) {
    await view.evaluate((element, theme) => {
      const root = element.closest('.theme-light, .theme-dark')!;
      root.classList.remove('theme-light', 'theme-dark'); root.classList.add(theme);
    }, theme);
    await expect(view.locator('.cm-selectionLayer')).toHaveCount(0);
    const text = await view.locator('.cm-content').evaluate(element => getComputedStyle(element).color);
    await expect(view.locator('.cm-content')).toHaveCSS('caret-color', text);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ui: { vimEnabled: true, vimInputMethod: false } } })));
    await expect(view).toHaveAttribute('data-vim-mode', 'normal');
    await page.keyboard.press('i'); await expect(view).toHaveAttribute('data-vim-mode', 'insert');
    await expect(view.locator('.cm-content')).toHaveCSS('caret-color', text);
    await expect(view.locator('.cm-selectionLayer')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.renderHarness.cursor(0, 0));
    await page.keyboard.type('ve');
    await expect(view).toHaveAttribute('data-vim-mode', 'visual');
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('alpha');
    const colors = await view.locator('.cm-line').first().evaluate(element => {
      const marker = document.createElement('span'); marker.style.backgroundColor = 'var(--text-selection)'; element.append(marker);
      const expected = getComputedStyle(marker).backgroundColor; marker.remove();
      return { expected, actual: getComputedStyle(element, '::selection').backgroundColor };
    });
    expect(colors.actual).toBe(colors.expected);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ui: { vimEnabled: false } } })));
    await expect(view).not.toHaveAttribute('data-vim-mode');
    await expect(view.locator('.cm-selectionLayer')).toHaveCount(0);
    await expect(view.locator('.cm-content')).toHaveCSS('caret-color', text);
  }
  await page.evaluate(() => { window.renderHarness.reset('> [!note] Title\n> **alpha** beta\n> next line\n'); window.renderHarness.mode(0, 'live'); });
  await expect(view.locator('.cm-content')).toContainText('alpha');
  await page.evaluate(() => { const start = window.renderHarness.source(0).indexOf('alpha'); window.renderHarness.cursor(0, start, start + 5); window.renderHarness.focus(0); });
  await expect(view.locator('.cm-selectionLayer')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('alpha');
});
