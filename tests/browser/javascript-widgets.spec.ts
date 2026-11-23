import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const pasted = readFileSync(path.resolve('tests/fixtures/js-widget-undeclared-root.md'), 'utf8');
const fence = (source: string) => 'intro\n\n```js-widget\n' + source + '\n```\n\nend';

async function mount(page: Page, source: string) {
  await page.goto('/__render-test');
  await page.waitForFunction(() => Boolean(window.renderHarness));
  await page.evaluate(async source => {
    const { mountMarkdownFragment } = await import('/src/components/MarkdownFragment.tsx');
    const { installJavascript } = await import('/src/lib/javascript/runtime.ts');
    const { sharedApp } = await import('/src/lib/shale/runtime.ts');
    const stop = installJavascript(sharedApp);
    const host = document.createElement('section');
    host.id = 'javascript-fixture'; host.className = 'theme-light'; host.style.width = '700px';
    document.body.prepend(host);
    const context = {
      sourcePath: 'chart.md', allowScriptExecution: true,
      openLink() {}, openMenu() {}, rawUrl: (path: string) => path, files: () => [],
      tags: async () => [], properties: async () => [], propertyTypes: () => ({}),
      setPropertyType: async () => ({}), renderEmbed: async () => null,
      mountFragment: mountMarkdownFragment,
    };
    const unmount = mountMarkdownFragment(host, source, { id: 'chart.md', mode: 'live', context });
    (window as any).javascriptFixture = { stop, unmount, appRoot: document.getElementById('root') };
  }, source);
}

const frame = (page: Page) => page.frameLocator('#javascript-fixture iframe');

test('widget fence aliases retain ordinary JavaScript syntax colors in editing and source modes', async ({ page }) => {
  await page.goto('/__render-test');
  await page.waitForFunction(() => Boolean(window.renderHarness));
  const samples: { colors: string[]; background: string }[] = [];
  for (const language of ['js', 'js-widget', 'javascript-widget']) {
    const source = 'intro\n\n```' + language + '\nconst value = "hello"; // comment\n```\n\nend';
    await page.evaluate(source => window.renderHarness.reset(source), source);
    await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
    await page.evaluate(position => window.renderHarness.cursor(0, position), source.indexOf('value'));
    const line = page.locator('[data-slot="0"] .HyperMD-codeblock-bg', { hasText: 'const value' });
    await expect.poll(() => line.locator('span').count()).toBeGreaterThan(2);
    samples.push(await line.evaluate(element => ({
      colors: [...element.querySelectorAll('span')].map(span => getComputedStyle(span).color),
      background: getComputedStyle(element.closest('.md-code') ?? element).backgroundColor,
    })));
    await page.evaluate(() => window.renderHarness.mode(0, 'source'));
    await expect(page.locator('[data-slot="0"] .cm-line', { hasText: 'const value' }).locator('span')).not.toHaveCount(0);
  }
  expect(samples[1]).toEqual(samples[0]);
  expect(samples[2]).toEqual(samples[0]);
  expect(samples[0].background).not.toBe('rgba(0, 0, 0, 0)');
  expect(new Set(samples[0].colors).size).toBeGreaterThan(2);
});

test('the original undeclared-root script reports a local error and preserves the application', async ({ page }) => {
  await mount(page, 'intro\n' + pasted + '\nend');
  await expect(page.locator('#javascript-fixture .interactive-js-error')).toContainText('root is not defined');
  expect(await page.evaluate(() => document.getElementById('root') === (window as any).javascriptFixture.appRoot)).toBe(true);
  await expect(page.locator('[data-slot="0"] .cm-editor')).toBeVisible();
  await expect(page.locator('#javascript-fixture iframe')).toHaveCount(0);
});

test('the corrected supplied canvas script draws and its quantum-number slider works', async ({ page }) => {
  await mount(page, 'intro\n' + pasted.replace('const host = container;', "const host = container;\nconst root = document.createElement('div');") + '\nend');
  await expect(frame(page).locator('canvas')).toBeVisible();
  await expect(frame(page).locator('.info')).toContainText('l = 1');
  await frame(page).locator('.l-slider').fill('4');
  await expect(frame(page).locator('.info')).toContainText('l = 4');
  expect(await frame(page).locator('canvas').evaluate(canvas => {
    const context = (canvas as HTMLCanvasElement).getContext('2d')!;
    return context.getImageData(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height).data.some(value => value !== 0);
  })).toBe(true);
});

test('scripts only access their frame DOM and have no application or native capabilities', async ({ page }) => {
  await mount(page, fence(`
const result = { app: typeof app, native: typeof shaleDesktop, require: typeof require, android: typeof shaleAndroid };
for (const key of ['parent', 'top']) {
  try { window[key].document.getElementById('root').innerHTML = 'destroyed'; result[key] = 'escaped'; }
  catch (error) { result[key] = error.name; }
}
try { localStorage.setItem('unsafe', 'value'); result.storage = 'escaped'; }
catch (error) { result.storage = error.name; }
document.body.style.background = 'red';
container.textContent = JSON.stringify(result);
`));
  await expect(frame(page).locator('#widget-container')).toContainText('SecurityError');
  const result = JSON.parse(await frame(page).locator('#widget-container').textContent() ?? '{}');
  expect(result).toEqual({ app: 'undefined', native: 'undefined', require: 'undefined', android: 'undefined', parent: 'SecurityError', top: 'SecurityError', storage: 'SecurityError' });
  expect(await page.locator('body').evaluate(body => getComputedStyle(body).backgroundColor)).not.toBe('rgb(255, 0, 0)');
  await expect(page.locator('[data-slot="0"] .cm-editor')).toBeVisible();
  expect(await page.locator('#javascript-fixture iframe').getAttribute('sandbox')).toBe('allow-scripts');
  expect(await page.locator('#javascript-fixture iframe').getAttribute('csp')).toContain("connect-src 'none'");
});

test('official controls update charts, preserve custom colors and follow native dark mode', async ({ page }, info) => {
  await mount(page, fence(`
const plot = chart({ animation: false, tooltip: {}, legend: {}, xAxis: { type: 'value' }, yAxis: { type: 'value' },
  series: [{ name: 'V(r)', type: 'line', data: [[0, 0], [1, 1], [2, 4]] },
    { name: 'reference', type: 'line', lineStyle: { color: '#ff00ff' }, data: [[0, 1], [2, 1]] }] }, { renderer: 'svg', height: 280 });
window.plot = plot;
const slider = ui.slider({ label: '角量子数 l', value: 1, min: 0, max: 8, step: 1,
  onChange: value => plot.setOption({ series: [{ data: [[0, 0], [1, value], [2, 4 * value]] }] }) });
ui.button({ label: '重置', onClick: () => slider.setValue(1) });
ui.toggle({ label: '显示参考线', value: true, onChange: value => { container.dataset.reference = String(value); } });
ui.segmented({ label: '横轴', value: 'linear', options: [{label:'线性',value:'linear'}, {label:'对数',value:'log'}],
  onChange: value => { container.dataset.axis = value; } });
`));
  await expect(frame(page).getByRole('slider')).toBeVisible();
  const slider = frame(page).getByRole('slider');
  await slider.focus(); await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '2');
  expect(await frame(page).locator('.interactive-js-chart').evaluate(() => (window as any).plot.getOption().series[0].data[1][1])).toBe(2);
  await frame(page).getByRole('button', { name: '重置' }).click();
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await frame(page).getByRole('switch').click();
  await expect(frame(page).locator('#widget-container')).toHaveAttribute('data-reference', 'false');
  await frame(page).getByRole('radio', { name: '对数' }).click();
  await expect(frame(page).locator('#widget-container')).toHaveAttribute('data-axis', 'log');
  const light = await frame(page).locator('.interactive-js-chart').evaluate(() => (window as any).plot.getOption().textStyle.color);
  await page.locator('#javascript-fixture').evaluate(host => host.className = 'theme-dark');
  await expect(frame(page).locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => frame(page).locator('.interactive-js-chart').evaluate(() => (window as any).plot.getOption().textStyle.color)).not.toBe(light);
  expect(await frame(page).locator('.interactive-js-chart').evaluate(() => (window as any).plot.getOption().series[1].lineStyle.color)).toBe('#ff00ff');
  await expect.poll(() => frame(page).getByRole('radio', { name: '对数' }).evaluate(button =>
    getComputedStyle(button).color === getComputedStyle(document.body).color)).toBe(true);
  await page.screenshot({ path: info.outputPath('openai-controls-dark.png') });
});

test('explicit source keeps its background and highlighting and remounts a fresh frame', async ({ page }) => {
  await mount(page, fence('const label = "hello"; container.textContent = label;'));
  await expect(frame(page).locator('#widget-container')).toHaveText('hello');
  await page.locator('#javascript-fixture .native-js-code-block > .cm-source-toggle').click({ force: true });
  await expect(page.locator('#javascript-fixture iframe')).toHaveCount(0);
  const source = page.locator('#javascript-fixture .HyperMD-codeblock-bg', { hasText: 'const label' });
  await expect(source.locator('span')).not.toHaveCount(0);
  expect(await source.evaluate(line => getComputedStyle(line.closest('.md-code')!).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await page.locator('#javascript-fixture .cm-content').press('Escape');
  await expect(frame(page).locator('#widget-container')).toHaveText('hello');
});

test('read-only Markdown bridge uses the native renderer and suppresses nested scripts', async ({ page }) => {
  const markdown = '**Native output**\n\n<div class="settings-overlay">overlay attempt</div>\n\n```js-widget\nthrow new Error("nested");\n```';
  await mount(page, fence(`await renderMarkdown(${JSON.stringify(markdown)});`));
  await expect(page.locator('#javascript-fixture .interactive-js-native-output .cm-strong')).toHaveText('Native output');
  await expect(page.locator('#javascript-fixture iframe')).toHaveCount(1);
  await expect(page.locator('#javascript-fixture .interactive-js-error')).toHaveCount(0);
  expect(await page.locator('#javascript-fixture .interactive-js-native-output').evaluate(element => getComputedStyle(element).contain)).toBe('content');
  expect(await page.evaluate(() => document.elementFromPoint(innerWidth - 5, innerHeight - 5)?.closest('.settings-overlay') === null)).toBe(true);
  await page.evaluate(() => (window as any).javascriptFixture.unmount());
  await expect(page.locator('#javascript-fixture iframe')).toHaveCount(0);
});

test.describe('network policy', () => {
  test.use({ expectedErrors: ["connect-src 'none'", 'Fetch API cannot load'] });
  test('blocks direct network requests inside the frame', async ({ page }) => {
    await mount(page, fence('try { await fetch("https://example.com/"); container.textContent = "escaped"; } catch { container.textContent = "network blocked"; }'));
    await expect(frame(page).locator('#widget-container')).toHaveText('network blocked');
  });
});
