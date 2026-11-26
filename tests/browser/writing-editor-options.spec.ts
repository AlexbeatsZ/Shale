import { test, expect } from './test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/settings/', route => route.fulfill({ json: { ui: { lineNumbers: 'off' } } }));
  await page.goto('/__render-test');
  await page.waitForFunction(() => !!window.renderHarness);
});

test('Option digits turn inline-math prose into headings, change levels, clear and undo without touching display math', async ({ page }) => {
  const source = 'Wigner 的 $2k+1$ 规则\n\n$$\nx \\tag{1}\n$$\n\nplain';
  await page.route('**/api/settings/hotkeys', route => route.fulfill({ json: { version: 1, bindings: Object.fromEntries(Array.from({ length: 8 }, (_, level) => ['editor:set-heading-' + level, [{ modifiers: ['Alt'], key: String(level) }]])), platforms: {} } }));
  await page.evaluate(source => window.renderHarness.reset(source), source);
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const { sharedApp } = await load('/src/lib/plugins.ts');
    const { useStore } = await load('/src/lib/store.ts');
    const { refreshHotkeys } = await load('/src/lib/search.ts');
    await refreshHotkeys();
    useStore.setState({ activePath: 'a.md' });
    window.addEventListener('keydown', event => {
      if (sharedApp.commands.dispatchHotkey(event)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    window.renderHarness.cursor(0, 9); window.renderHarness.focus(0);
  });
  await page.keyboard.press('Alt+2');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe('## ' + source);
  await page.keyboard.press('Alt+7');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe('####### ' + source);
  await page.keyboard.press('Alt+0');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe('####### ' + source);
  await page.evaluate(() => {
    const text = window.renderHarness.source(0);
    window.renderHarness.cursor(0, text.indexOf('x \\tag'));
  });
  await page.keyboard.press('Alt+3');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe('####### ' + source);
});

test('absolute and relative gutters follow the cursor, edits, view modes and saved settings', async ({ page }) => {
  const source = 'first\nsecond\nthird\nfourth\nfifth';
  await page.evaluate(source => window.renderHarness.reset(source), source);
  const gutter = page.locator('[data-slot="0"] .cm-lineNumbers');
  const numbers = () => gutter.locator('.cm-gutterElement').evaluateAll(elements => elements
    .filter(element => !(element as HTMLElement).style.visibility.includes('hidden')).map(element => element.textContent));
  await expect(gutter).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ui: { lineNumbers: 'absolute' } } })));
  await expect.poll(numbers).toEqual(['1', '2', '3', '4', '5']);
  await expect(page.locator('[data-slot="1"] .cm-lineNumbers')).toHaveCount(0);
  await page.evaluate(() => {
    window.renderHarness.cursor(0, 'first\nsecond\n'.length);
    window.dispatchEvent(new CustomEvent('settings-changed', { detail: { ui: { lineNumbers: 'relative' } } }));
  });
  await expect.poll(numbers).toEqual(['2', '1', '0', '1', '2']);
  await page.evaluate(() => window.renderHarness.cursor(0, 0));
  await expect.poll(numbers).toEqual(['0', '1', '2', '3', '4']);
  await page.evaluate(() => window.renderHarness.edit(0, [{ from: 0, insert: 'new\n' }]));
  await expect.poll(numbers).toEqual(['0', '1', '2', '3', '4', '5']);
  await page.evaluate(() => window.renderHarness.cursor(0, 4));
  await expect.poll(numbers).toEqual(['1', '0', '1', '2', '3', '4']);
  await page.evaluate(() => window.renderHarness.mode(0, 'reading'));
  await expect(gutter).toHaveCount(0);
  await page.evaluate(() => window.renderHarness.mode(0, 'source'));
  await expect.poll(numbers).toEqual(['1', '0', '1', '2', '3', '4']);
  expect(await page.evaluate(() => window.renderHarness.source(0))).toBe('new\n' + source);
  await page.screenshot({ path: test.info().outputPath('relative-line-numbers.png') });
});

test('pasting formula source into code stays literal and the paste cleanup has an independent opt-out', async ({ page }) => {
  const paste = () => page.evaluate(() => {
    const data = new DataTransfer(); data.setData('text/plain', String.raw`$$x \tag{1}$$`);
    document.querySelector('[data-slot="0"] .cm-content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    return window.renderHarness.source(0);
  });
  await page.evaluate(() => window.renderHarness.reset('```tex\n\n```'));
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe('```tex\n\n```');
  await page.evaluate(() => window.renderHarness.cursor(0, 7));
  expect(await paste()).toBe('```tex\n$$x \\tag{1}$$\n```');
  await page.route('**/api/writing', route => route.fulfill({ json: {
    version: 1, latex: { snippets: '[]', snippetVariables: '{}', loadSnippetsFromFile: false, loadSnippetVariablesFromFile: false },
    linter: { ruleConfigs: { 'remove-math-tags-on-paste': { enabled: false } } }, hotkeys: {},
  } }));
  await page.evaluate(async () => {
    const load = (path: string) => import(path);
    await (await load('/src/lib/writing/config.ts')).refreshWriting(true);
    window.renderHarness.reset('');
  });
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe('');
  expect(await paste()).toBe(String.raw`$$x \tag{1}$$`);
});

test('native and menu paste clean tags once, preserve copy output and support one-step undo', async ({ page }) => {
  const source = String.raw`$$x \tag{1} \label{eq:x}$$`;
  await page.evaluate(source => window.renderHarness.reset(source, false), source);
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  const result = await page.evaluate(() => {
    window.renderHarness.cursor(0, 0, window.renderHarness.source(0).length);
    const data = new DataTransfer();
    document.querySelector('[data-slot="0"] .cm-content')!.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    window.renderHarness.cursor(0, window.renderHarness.source(0).length);
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    document.querySelector('[data-slot="0"] .cm-content')!.dispatchEvent(event);
    return { copied: data.getData('text/plain'), after: window.renderHarness.source(0), prevented: event.defaultPrevented };
  });
  expect(result).toEqual({ copied: source, after: source + String.raw`$$x \label{eq:x}$$`, prevented: true });
  await page.evaluate(() => window.renderHarness.undo(0));
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(async () => {
    await navigator.clipboard.writeText(String.raw`\[y \tag*{\text{A {B}}}\]`);
    window.renderHarness.cursor(0, window.renderHarness.source(0).length);
    window.renderHarness.focus(0);
  });
  await page.keyboard.press('Control+v');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source + String.raw`\[y\]`);
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
});
