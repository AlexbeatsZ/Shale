import { test, expect } from './test';
import { resolve, sep } from 'node:path';
import type { Hotkey } from '../../packages/search-core/src/hotkeys';

test.beforeEach(async ({ page }) => {
  await page.goto('/__render-test');
  await page.waitForFunction(() => !!window.renderHarness);
  await page.evaluate(() => window.renderHarness.reset('first line\n\nlast line'));
  await expect(page.locator('[data-slot="0"] .cm-content')).toContainText('last line');
  await page.evaluate(() => window.renderHarness.focus(0));
});

test('literal Control moves through the document, selects all and uses shared undo/redo', async ({ page }) => {
  const source = 'first line\n\nlast line';
  await page.keyboard.press('Control+End');
  await expect.poll(() => page.evaluate(() => window.renderHarness.location(0)?.anchor)).toBe(source.length);
  await page.keyboard.press('Control+Home');
  await expect.poll(() => page.evaluate(() => window.renderHarness.location(0)?.anchor)).toBe(0);
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('replacement');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe('replacement');
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  await page.keyboard.press('Control+Shift+Z');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe('replacement');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe('replacement');
});

for (const [mode, key] of [['live', 'Backspace'], ['source', 'Delete']] as const) {
  test(`${key} removes an empty bracket pair in ${mode} mode in one undoable edit`, async ({ page }) => {
    const source = 'a{}b a()b a[]b';
    await page.evaluate(source => window.renderHarness.reset(source), source);
    await expect(page.locator('[data-slot="0"] .cm-content')).toContainText(source);
    await page.evaluate(mode => window.renderHarness.mode(0, mode), mode);

    for (const pair of ['{}', '()', '[]']) {
      const start = source.indexOf(pair);
      await page.evaluate(position => {
        window.renderHarness.cursor(0, position);
        window.renderHarness.focus(0);
      }, start + 1);
      await page.keyboard.press(key);
      expect(await page.evaluate(() => window.renderHarness.source(0))).toBe(source.replace(pair, ''));
      expect(await page.evaluate(() => window.renderHarness.location(0)?.anchor)).toBe(start);
      await page.keyboard.press('Control+z');
      expect(await page.evaluate(() => window.renderHarness.source(0))).toBe(source);
    }
  });
}

test('Backspace keeps normal deletion at bracket edges, with selections or with content inside', async ({ page }) => {
  const source = 'a{}b a( )b a[x]b a{]b';
  await page.evaluate(source => window.renderHarness.reset(source), source);
  await expect(page.locator('[data-slot="0"] .cm-content')).toContainText(source);
  const cases = [
    { anchor: 3, head: 3, replacement: '{', original: '{}' },
    { anchor: 1, head: 2, replacement: '}', original: '{}' },
    { anchor: source.indexOf('( )') + 2, head: source.indexOf('( )') + 2, replacement: '()', original: '( )' },
    { anchor: source.indexOf('[x]') + 2, head: source.indexOf('[x]') + 2, replacement: '[]', original: '[x]' },
    { anchor: source.indexOf('{]') + 1, head: source.indexOf('{]') + 1, replacement: ']', original: '{]' },
  ];
  for (const { anchor, head, replacement, original } of cases) {
    await page.evaluate(({ anchor, head }) => {
      window.renderHarness.cursor(0, anchor, head);
      window.renderHarness.focus(0);
    }, { anchor, head });
    await page.keyboard.press('Backspace');
    expect(await page.evaluate(() => window.renderHarness.source(0))).toBe(source.replace(original, replacement));
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  }
});

test('Control clipboard shortcuts use the source policy and preserve readonly notes', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const source = 'first line\n\nlast line';
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(source);
  await page.keyboard.press('Control+x');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe('');
  await page.keyboard.press('Control+v');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  await page.evaluate(() => { window.renderHarness.mode(0, 'reading'); window.renderHarness.focus(0); });
  await page.keyboard.press('Control+a'); await page.keyboard.press('Control+x');
  expect(await page.evaluate(() => window.renderHarness.source(0))).toBe(source);
});

test('clicking the blank scroll area of a short note still places native input at its end', async ({ page }) => {
  const box = await page.locator('[data-slot="0"] .cm-scroller').boundingBox();
  await page.mouse.click(box!.x + 80, box!.y + box!.height - 20);
  await page.keyboard.insertText(' appended');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe('first line\n\nlast line appended');
});

test('physical Option/Alt key events record Alt independently of Command', async ({ page }) => {
  await page.evaluate(async modulePath => {
    const { eventHotkey } = await import(modulePath);
    document.addEventListener('keydown', event => {
      if (event.altKey && event.code === 'KeyZ') {
        event.preventDefault();
        (window as Window & { recordedOptionBinding?: Hotkey }).recordedOptionBinding = eventHotkey(event);
      }
    });
  }, '/@fs/' + resolve('packages/search-core/src/hotkeys.ts').split(sep).join('/'));
  await page.keyboard.press('Alt+z');
  expect(await page.evaluate(() => (window as Window & { recordedOptionBinding?: Hotkey }).recordedOptionBinding)).toEqual({ modifiers: ['Alt'], key: 'Z' });
});

test('Mac Command owns selection, shared history, clipboard and document navigation', async ({ page }) => {
  test.skip(!await page.evaluate(() => /Mac/.test(navigator.platform)), 'Native Mac keymap');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const source = 'first line\n\nlast line';
  await page.keyboard.press('Meta+ArrowDown');
  await expect.poll(() => page.evaluate(() => window.renderHarness.location(0)?.anchor)).toBe(source.length);
  await page.keyboard.press('Meta+ArrowUp');
  await expect.poll(() => page.evaluate(() => window.renderHarness.location(0)?.anchor)).toBe(0);
  await page.keyboard.press('Meta+a');
  await page.keyboard.press('Meta+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(source);
  await page.keyboard.press('Meta+x');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe('');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  await page.keyboard.press('Meta+Shift+Z');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe('');
  await page.keyboard.press('Meta+v');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
});

test('level 7 is available in the actual native command catalog and edits BodyHeading syntax', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const { sharedApp } = await load('/src/lib/plugins.ts');
    const { useStore } = await load('/src/lib/store.ts');
    useStore.setState(s => ({ panes: { ...s.panes, main: { ...s.panes.main, path: 'a.md', tabId: 'a.md' } } }));
    const command = sharedApp.commands.findCommand('editor:set-heading-7');
    if (!command) return null;
    window.renderHarness.focus(0);
    sharedApp.commands.executeCommandById(command.id);
    return { title: command.name, source: window.renderHarness.source(0) };
  });
  expect(result).toEqual({ title: '设为 7 级标题（正文内标题）', source: '####### first line\n\nlast line' });
});


test('body headings can become ordinary headings and plain paragraphs through the same command catalog', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const { sharedApp } = await load('/src/lib/plugins.ts');
    const { useStore } = await load('/src/lib/store.ts');
    useStore.setState(s => ({ panes: { ...s.panes, main: { ...s.panes.main, path: 'a.md', tabId: 'a.md' } } })); window.renderHarness.focus(0);
    sharedApp.commands.executeCommandById('editor:set-heading-7');
    const body = window.renderHarness.source(0);
    sharedApp.commands.executeCommandById('editor:set-heading-2');
    const ordinary = window.renderHarness.source(0);
    sharedApp.commands.executeCommandById('editor:set-heading-7');
    sharedApp.commands.executeCommandById('editor:set-heading-0');
    return { body, ordinary, plain: window.renderHarness.source(0) };
  });
  expect(result).toEqual({ body: '####### first line\n\nlast line', ordinary: '## first line\n\nlast line', plain: 'first line\n\nlast line' });
});
