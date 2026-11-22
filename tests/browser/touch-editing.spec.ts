import type { Page } from '@playwright/test';
import { test, expect } from './test';

// Android tablet feedback 2026-11-22: long-press menu paste, soft keyboard and
// the keyboard-time page jump. Touch events are synthesized as Chromium on
// Android delivers them: pointerdown(touch), focus + word selection, then a
// PointerEvent contextmenu with pointerType "touch".

const lines = ['First line with words', '', 'Second paragraph here', '', ...Array.from({ length: 80 }, (_, index) => `Filler line ${index}`)];
const source = lines.join('\n');

test.beforeEach(async ({ page }) => {
  await page.goto('/__render-test');
  await page.waitForFunction(() => !!window.renderHarness);
  await page.evaluate(source => { window.renderHarness.reset(source, false); window.renderHarness.closeSecondary(); }, source);
  await expect(page.locator('[data-slot="0"] .cm-content')).toContainText('Second paragraph');
  // The harness routes editor menus to the shared store; mount the real menu for this suite.
  await page.evaluate(async () => {
    const load = (name: string) => import(name);
    const [React, ReactDOM, menu] = await Promise.all([load('/node_modules/.vite/deps/react.js'),
      load('/node_modules/.vite/deps/react-dom_client.js'), load('/src/components/ContextMenu.tsx')]);
    const host = document.createElement('div');
    host.className = 'theme-light'; document.body.append(host);
    (ReactDOM.createRoot ?? ReactDOM.default.createRoot)(host).render((React.default ?? React).createElement(menu.default));
  });
  await page.evaluate(() => {
    // Slow, Android-bridge-like asynchronous clipboard read.
    navigator.clipboard.read = () => new Promise(resolve => setTimeout(() => resolve([
      new ClipboardItem({ 'text/plain': new Blob(['PASTED'], { type: 'text/plain' }) })]), 80));
  });
});

async function longPress(page: Page, word: string, focusedBefore: boolean) {
  return page.evaluate(({ word, focusedBefore }) => {
    const view = window.renderHarness.view(0)!;
    view.dispatch({ selection: { anchor: 0 } });
    if (focusedBefore) view.focus(); else (document.activeElement as HTMLElement | null)?.blur();
    const line = [...view.contentDOM.querySelectorAll('.cm-line')].find(element => element.textContent!.includes(word))!;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    while ((node = walker.nextNode() as Text | null) && !node.data.includes(word)) { /* find text node */ }
    const from = node!.data.indexOf(word);
    const range = document.createRange();
    range.setStart(node!, from); range.setEnd(node!, from + word.length);
    const rect = range.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    line.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y }));
    // Chromium selects the pressed word (focusing the editable) before contextmenu.
    view.contentDOM.focus();
    getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
    line.dispatchEvent(new PointerEvent('contextmenu', { bubbles: true, cancelable: true, pointerType: 'touch', clientX: x, clientY: y }));
    const offset = view.state.doc.toString().indexOf(word);
    return { offset, selection: [view.state.selection.main.from, view.state.selection.main.to] };
  }, { word, focusedBefore });
}

const editorFocused = (page: Page) => page.evaluate(() => document.activeElement?.classList.contains('cm-content') ?? false);

test('touch long-press paste replaces the pressed word without raising the keyboard', async ({ page }) => {
  const pressed = await longPress(page, 'paragraph', false);
  expect(pressed.selection).toEqual([pressed.offset, pressed.offset + 'paragraph'.length]);
  expect(await editorFocused(page)).toBe(false);
  await page.locator('.context-menu .context-item', { hasText: '粘贴' }).click();
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toContain('Second PASTED here');
  expect(await page.evaluate(() => window.renderHarness.source(0)).then(text => text.startsWith('First line'))).toBe(true);
  // Neither the menu's focus restore nor the paste focuses the editor (no soft keyboard).
  await page.waitForTimeout(150);
  expect(await editorFocused(page)).toBe(false);
});

test('touch long-press copy uses the pressed word and keeps the keyboard closed', async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { copied: string[] }).copied = [];
    navigator.clipboard.write = async items => {
      (window as unknown as { copied: string[] }).copied.push(await (await items[0].getType('text/plain')).text());
    };
  });
  await longPress(page, 'paragraph', false);
  await page.locator('.context-menu .context-item', { hasText: '复制' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual(['paragraph']);
  expect(await editorFocused(page)).toBe(false);
});

test('a long-press on an already focused editor keeps focus after paste', async ({ page }) => {
  await longPress(page, 'paragraph', true);
  await page.locator('.context-menu .context-item', { hasText: '粘贴' }).click();
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toContain('Second PASTED here');
  await expect.poll(() => editorFocused(page)).toBe(true);
});

test('focus and decoration transactions during the clipboard read do not drop the paste', async ({ page }) => {
  await page.evaluate(() => {
    const view = window.renderHarness.view(0)!;
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('Second') } });
  });
  await page.keyboard.press('Control+v');
  // Effects-only transaction while the asynchronous read is pending.
  await page.evaluate(() => { const view = window.renderHarness.view(0)!; view.dispatch({}); view.dispatch({ effects: [] }); view.contentDOM.blur(); view.focus(); });
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toContain('PASTEDSecond paragraph');
});

test('Android keyboard resize undoes the browser focus scroll and reveals the caret minimally', async ({ page }) => {
  const before = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: navigator.userAgent + ' WebObsidianAndroid/0.1.81' });
    // Like the application shell, the editor fills the WebView and shrinks with the keyboard.
    document.querySelector<HTMLElement>('[data-slot="0"]')!.style.height = '100vh';
    const view = window.renderHarness.view(0)!;
    view.scrollDOM.scrollTop = 1200;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // Caret on a visible line that the keyboard will cover.
    const target = view.posAtCoords({ x: view.contentDOM.getBoundingClientRect().left + 20, y: innerHeight - 100 })!;
    view.focus();
    view.dispatch({ selection: { anchor: target } });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // Chromium's ScrollFocusedEditableNodeIntoView after the soft keyboard resize, in the wrong direction.
    addEventListener('resize', () => { view.scrollDOM.scrollTop -= 249; }, { once: true });
    return { top: view.scrollDOM.scrollTop, caretBottom: view.coordsAtPos(target)!.bottom };
  });
  await page.setViewportSize({ width: 1480, height: 420 });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const view = window.renderHarness.view(0)!;
    const caret = view.coordsAtPos(view.state.selection.main.head)!, box = view.scrollDOM.getBoundingClientRect();
    return { top: view.scrollDOM.scrollTop, caretTop: caret.top, caretBottom: caret.bottom, boxTop: box.top, boxBottom: Math.min(box.bottom, innerHeight) };
  });
  // No backwards jump; only the distance the keyboard covered plus the reveal margin.
  expect(after.top).toBeGreaterThanOrEqual(before.top - 1);
  expect(after.top - before.top).toBeLessThanOrEqual(before.caretBottom - 420 + 40);
  expect(after.caretTop).toBeGreaterThanOrEqual(after.boxTop);
  expect(after.caretBottom).toBeLessThanOrEqual(after.boxBottom);
});

test('desktop window resizes leave editor scrolling to the browser', async ({ page }) => {
  const before = await page.evaluate(async () => {
    const view = window.renderHarness.view(0)!;
    view.scrollDOM.scrollTop = 1200;
    view.focus();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    addEventListener('resize', () => { view.scrollDOM.scrollTop -= 249; }, { once: true });
    return view.scrollDOM.scrollTop;
  });
  await page.setViewportSize({ width: 1480, height: 420 });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.renderHarness.view(0)!.scrollDOM.scrollTop)).toBeCloseTo(before - 249, 0);
});
