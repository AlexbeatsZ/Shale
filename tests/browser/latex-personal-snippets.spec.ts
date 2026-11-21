import { test, expect } from './test';
import type { Page } from '@playwright/test';

// Rules mirror the STEM personal snippet file: selection (visual) rules, the
// frac auto-expansion with tabstops, and the `@ n m ` equation-number pair.
const SNIPPETS = String.raw`[
{trigger: "mk", replacement: "\\($0\\)", options: "tA"},
{trigger: /@ (\d+) (\d+) /, replacement: "\\(\\text{([[0]]-[[1]])}\\)式$0", options: "tA"},
{trigger: /@ (\d+) (\d+) /, replacement: "\\tag{[[0]]-[[1]]}", options: "mA"},
{trigger: /(?<![A-Za-z\\])\\?frac/, replacement: "\\frac{$0}{$1}$2", options: "mA"},
{trigger: "(", replacement: "(\${VISUAL})", options: "mA"},
{trigger: "u", replacement: "\\underbrace{ \${VISUAL} }_{ $0 }", options: "mA"},
{trigger: "a", replacement: "\\begin{align}\${VISUAL}\\end{align}", options: "mA"},
{trigger: "t", replacement: "$\\text{\${VISUAL}}$", options: "tA"},
{trigger: "t", replacement: "\\text{\${VISUAL}}", options: "mA"},
]`;

async function editor(page: Page, source: string) {
  await page.route('**/api/writing', route => route.fulfill({ json: {
    version: 1, migration: 'fixture',
    latex: { loadSnippetsFromFile: false, loadSnippetVariablesFromFile: false, snippets: SNIPPETS, snippetVariables: '{}',
      snippetsTrigger: 'Tab', taboutEnabled: true },
    linter: {}, hotkeys: {},
  } }));
  await page.goto('/__render-test');
  await page.waitForFunction(() => Boolean(window.renderHarness));
  await page.evaluate(async source => {
    const { ensureWriting } = await import('/src/lib/writing/config.ts');
    await ensureWriting();
    window.renderHarness.reset(source);
  }, source);
  await page.evaluate(async () => {
    window.renderHarness.cursor(0, 0); window.renderHarness.focus(0);
    const { getActiveEditor } = await import('/src/lib/activeEditor.ts');
    const { StateEffect } = await import('/node_modules/.vite/deps/@codemirror_state.js');
    const { nativeWritingExtensions } = await import('/src/lib/writing/extensions.ts');
    getActiveEditor()!.dispatch({ effects: StateEffect.appendConfig.of(nativeWritingExtensions()) });
  });
}
const source = (page: Page) => page.evaluate(() => window.renderHarness.source(0));

for (const [name, src, from, to, key, expected] of [
  ['dollar inline', '$x+1$', 1, 4, 'a', '$\\begin{align}x+1\\end{align}$'],
  ['paren inline', '\\(x+1\\)', 2, 5, 'u', '\\(\\underbrace{ x+1 }_{  }\\)'],
  ['bracket display', '\\[x+1\\]', 2, 5, '(', '\\[(x+1)\\]'],
  ['multiline display', '\\[\nx+1\n\\]', 3, 6, 'a', '\\[\n\\begin{align}x+1\\end{align}\n\\]'],
  ['text mode', 'abc', 0, 3, 't', '$\\text{abc}$'],
  ['backward selection', '$x+1$', 4, 1, 'a', '$\\begin{align}x+1\\end{align}$'],
] as const) {
  test(`selected text + ${key}: ${name}`, async ({ page }) => {
    await editor(page, src);
    await page.evaluate(([f, t]) => window.renderHarness.cursor(0, f, t), [from, to] as const);
    await page.keyboard.press(key);
    await expect.poll(() => source(page)).toBe(expected);
  });
}

test('frac expands to \\frac{}{} and Tab moves from numerator to denominator', async ({ page }) => {
  await editor(page, '$$\n\n$$');
  await page.evaluate(() => window.renderHarness.cursor(0, 3));
  await page.keyboard.type('frac');
  await expect.poll(() => source(page)).toBe('$$\n\\frac{}{}\n$$');
  await page.keyboard.type('a');
  await page.keyboard.press('Tab');
  await page.keyboard.type('b');
  await expect.poll(() => source(page)).toBe('$$\n\\frac{a}{b}\n$$');
  await page.keyboard.press('Tab');
  await page.keyboard.type('c');
  await expect.poll(() => source(page)).toBe('$$\n\\frac{a}{b}c\n$$');
});

test('a typed backslash does not duplicate in \\frac and words ending in frac are untouched', async ({ page }) => {
  await editor(page, '$$\n\n$$');
  await page.evaluate(() => window.renderHarness.cursor(0, 3));
  await page.keyboard.type('\\frac');
  await expect.poll(() => source(page)).toBe('$$\n\\frac{}{}\n$$');
  await editor(page, '$$\n\n$$');
  await page.evaluate(() => window.renderHarness.cursor(0, 3));
  await page.keyboard.type('xfrac');
  await expect.poll(() => source(page)).toBe('$$\nxfrac\n$$');
});

test('@ n m expands to a text label outside math and \\tag inside math', async ({ page }) => {
  await editor(page, '');
  await page.keyboard.type('@ 1 2 ');
  await expect.poll(() => source(page)).toBe('\\(\\text{(1-2)}\\)式');
  await editor(page, '$$\nx\n$$');
  await page.evaluate(() => { window.renderHarness.cursor(0, 4); window.renderHarness.focus(0); });
  await page.keyboard.type(' @ 3 4 ');
  await expect.poll(() => source(page)).toBe('$$\nx \\tag{3-4}\n$$');
});
