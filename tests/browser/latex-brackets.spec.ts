import type { Page } from '@playwright/test';
import { test, expect } from './test';

const live = '[data-slot="0"]';
const colorClass = 'latex-suite-color-bracket-';
const errorClass = 'latex-suite-mismatched-bracket';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/writing', route => route.fulfill({ json: {
    version: 1, migration: 'fixture', linter: {}, hotkeys: {},
    latex: { loadSnippetsFromFile: false, loadSnippetVariablesFromFile: false, snippets: '[]', snippetVariables: '{}' },
  } }));
});

async function reveal(page: Page, source: string, cursor: string) {
  await page.goto('/__render-test');
  await page.waitForFunction(() => !!window.renderHarness);
  await page.evaluate(source => window.renderHarness.reset(source), source);
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  await page.evaluate(async position => {
    const { ensureWriting } = await import('/src/lib/writing/config.ts');
    const { nativeWritingExtensions } = await import('/src/lib/writing/extensions.ts');
    const { getActiveEditor } = await import('/src/lib/activeEditor.ts');
    const { StateEffect } = await import('/node_modules/.vite/deps/@codemirror_state.js');
    await ensureWriting();
    window.renderHarness.focus(0);
    getActiveEditor()!.dispatch({
      effects: StateEffect.appendConfig.of(nativeWritingExtensions()),
      selection: { anchor: position },
    });
  }, source.indexOf(cursor));
}

async function marks(page: Page) {
  return page.locator(`${live} .cm-content`).evaluate((content, { colorClass, errorClass }) => {
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const elements = new Map<Element, { text: string; depth: string; colors: string[]; wavy: boolean }>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement!;
      const mark = parent.closest(`[class*="${colorClass}"], .${errorClass}`);
      if (!mark) continue;
      const depth = [...mark.classList].find(name => name.startsWith(colorClass))?.slice(colorClass.length) ?? 'error';
      const entry = elements.get(mark) ?? {
        text: '', depth, colors: [], wavy: getComputedStyle(mark).textDecorationStyle === 'wavy',
      };
      entry.text += node.textContent;
      const color = getComputedStyle(parent).color;
      if (!entry.colors.includes(color)) entry.colors.push(color);
      elements.set(mark, entry);
    }
    return [...elements.values()];
  }, { colorClass, errorClass });
}

test('LaTeX brackets use six nested colors in light and dark themes', async ({ page }) => {
  const tex = String.raw`([{([{\langle x \rangle}])}]) + (y) + [z]`;
  const source = 'Intro $' + tex + '$ end';
  await reveal(page, source, 'x');
  const sequence = [
    ['(', '0'], ['[', '1'], ['{', '2'], ['(', '3'], ['[', '4'], ['{', '5'], ['\\langle', '0'],
    ['\\rangle', '0'], ['}', '5'], [']', '4'], [')', '3'], ['}', '2'], [']', '1'], [')', '0'],
    ['(', '0'], [')', '0'], ['[', '0'], [']', '0'],
  ];
  const checkTheme = async () => {
    const result = await marks(page);
    expect(result.map(({ text, depth }) => [text, depth])).toEqual(sequence);
    const effective = new Map<string, string>();
    for (const { depth, colors, wavy } of result) {
      expect(wavy).toBe(false);
      expect(colors).toHaveLength(1);
      if (effective.has(depth)) expect(colors[0]).toBe(effective.get(depth));
      effective.set(depth, colors[0]);
    }
    expect(new Set(effective.values()).size).toBe(6);
    return effective;
  };

  const light = await checkTheme();
  await page.locator('.theme-light').first().evaluate(element => element.classList.replace('theme-light', 'theme-dark'));
  expect(await checkTheme()).not.toEqual(light);
  await expect(page.locator(`${live} .latex-suite-highlighted-bracket`)).toHaveText(['\\langle', '\\rangle']);
  await expect(page.locator('[data-slot="1"] [data-mathjax-version]')).toHaveCount(1);
  await expect(page.locator('[data-slot="1"] [class*="latex-suite-color-bracket"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.renderHarness.source(0))).toBe(source);
});

test('unmatched and mismatched brackets are underlined and recover after an edit', async ({ page }) => {
  const source = 'Intro $[x) + (y) + z]$ end';
  await reveal(page, source, 'x');
  const actual = await marks(page);
  expect(actual.map(({ text, depth, wavy }) => [text, depth, wavy])).toEqual([
    ['[', 'error', true], [')', 'error', true], ['(', '0', false], [')', '0', false], [']', 'error', true],
  ]);
  expect(new Set(actual.filter(mark => mark.wavy).flatMap(mark => mark.colors)).size).toBe(1);
  await page.evaluate(({ close, extra }) => window.renderHarness.edit(0, [
    { from: close, to: close + 1, insert: ']' },
    { from: extra, to: extra + 1, insert: '' },
  ]), { close: source.indexOf(')'), extra: source.indexOf(']') });
  await expect(page.locator(`${live} .${errorClass}`)).toHaveCount(0);
  expect((await marks(page)).map(({ text, depth }) => [text, depth])).toEqual([
    ['[', '0'], [']', '0'], ['(', '0'], [')', '0'],
  ]);
  await page.evaluate(() => window.renderHarness.cursor(0, 0));
  await expect(page.locator(`${live} .math-inline [data-mathjax-version]`)).toHaveCount(1);
  await page.evaluate(position => window.renderHarness.cursor(0, position), source.indexOf('x'));
  await expect(page.locator(`${live} .${colorClass}0`)).toHaveCount(4);
});

test('scalable brackets respect delimiter types and accept an invisible side', async ({ page }) => {
  const tex = String.raw`\left. [x] \right\} + \left( y \right] + \left( z`;
  await reveal(page, '$' + tex + '$', 'x');
  expect((await marks(page)).map(({ text, depth }) => [text, depth])).toEqual([
    ['\\left.', '0'], ['[', '1'], [']', '1'], ['\\right\\}', '0'],
    ['\\left(', 'error'], ['\\right]', 'error'], ['\\left(', 'error'],
  ]);
});
