import { test, expect } from './test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const { PNG } = require(path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
const pixels = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="white"/><rect x="120" width="120" height="160" fill="red"/></svg>';
const files = ['figure.png', 'other.png', 'my-dark-Wiki.png'].map(name => 'image-properties/' + name);
const mergedTable = readFileSync('tests/fixtures/personal-merged-table.js', 'utf8');
let customCss: string;

test.beforeEach(async ({ page }) => {
  customCss = '.embed-property-framed > img { outline: 3px solid rgb(120, 80, 210); }';
  await page.route('**/image-properties/**', route => route.fulfill({ contentType: 'image/svg+xml', body: pixels }));
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/vault-identity' || url.pathname === '/api/writing') return route.fallback();
    if (url.pathname === '/api/settings/embed-properties') return route.fulfill({ json: {
      path: 'embeds.css', exists: true, content: customCss, revision: 'fixture', vault: 'browser-fixture',
    } });
    return route.fulfill({ json: { hits: [], backlinks: [], enabled: false } });
  });
  await page.goto('/__render-test');
  await page.waitForFunction(() => !!window.renderHarness);
});

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  const errors = await page.evaluate(() => {
    const fixture = (window as any).imagePropertiesFixture;
    fixture?.stopBlocks?.(); fixture?.stopProperties?.(); fixture?.store.getState().closeContextMenu(); fixture?.root.unmount(); fixture?.host.remove();
    return fixture?.errors ?? [];
  });
  expect(errors).toEqual([]);
});

async function reset(page: Page, source: string, blockEffects = false) {
  // The final tiny source edit rebuilds reference widgets after injecting the
  // harness's file resolver and real menu services into its render context.
  await page.evaluate(source => window.renderHarness.reset(source + '\n'), source);
  await expect(page.locator('[data-slot="1"] .cm-content').first()).toContainText('end');
  await page.evaluate(async ({ files, blockEffects }) => {
    const load = (name: string) => import(name);
    const [React, ReactDOM, menu, store, cm, state, context, properties] = await Promise.all([
      load('/node_modules/.vite/deps/react.js'), load('/node_modules/.vite/deps/react-dom_client.js'),
      load('/src/components/ContextMenu.tsx'), load('/src/lib/store.ts'),
      load('/node_modules/.vite/deps/@codemirror_view.js'), load('/node_modules/.vite/deps/@codemirror_state.js'),
      load('/src/lib/renderContext.ts'), load('/src/lib/embedProperties.ts'),
    ]);
    const previous = (window as any).imagePropertiesFixture;
    previous?.stopBlocks?.(); previous?.stopProperties?.(); previous?.root.unmount(); previous?.host.remove();
    document.querySelectorAll('[data-embed-properties]').forEach(element => element.remove());
    const errors: string[] = [], host = document.createElement('div');
    host.id = 'image-properties-menu'; document.body.append(host);
    const root = (ReactDOM.createRoot ?? ReactDOM.default.createRoot)(host);
    root.render((React.default ?? React).createElement(menu.default));
    const stopProperties = properties.initializeEmbedProperties((message: string) => errors.push(message));
    (window as any).imagePropertiesFixture = { root, host, stopProperties, errors, store: store.useStore };
    for (const element of document.querySelectorAll<HTMLElement>('[data-slot] > .cm-host > .cm-editor')) {
      const view = cm.EditorView.findFromDOM(element)!;
      const original = view.state.facet(context.renderContext);
      const services = { ...original, files: () => files,
        allowBlockEffects: blockEffects || original.allowBlockEffects, allowScriptExecution: blockEffects || original.allowScriptExecution,
        rawUrl: (target: string) => target.startsWith('/') ? target : '/' + target,
        openMenu: (value: unknown) => store.useStore.getState().openContextMenu(value),
        reportError: (message: string) => errors.push(message),
      };
      services.mountFragment = (host: HTMLElement, source: string, options: any) => original.mountFragment(host, source, {
        ...options, context: { ...services, ...options.context },
      });
      view.dispatch({ effects: state.StateEffect.appendConfig.of(state.Prec.highest(context.renderContext.of({
        ...services,
      }))) });
    }
  }, { files, blockEffects });
  await page.evaluate(source => {
    window.renderHarness.edit(0, [{ from: source.length, to: source.length + 1, insert: '' }]);
    window.renderHarness.cursor(0, source.length);
  }, source);
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  await expect(page.locator('[data-render-pending]')).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
  });
}

const slot = (page: Page, index = 0) => page.locator(`[data-slot="${index}"]`);

async function openImageProperties(page: Page, method: 'hover' | 'keyboard' | 'click' = 'hover') {
  await slot(page).locator('.cm-image-wrap > img').first().click({ button: 'right' });
  const add = page.getByRole('menuitem', { name: '添加属性', exact: true });
  await expect(add).toBeVisible();
  if (method === 'hover') await add.hover();
  else if (method === 'keyboard') { await add.focus(); await page.keyboard.press('ArrowRight'); }
  else await add.click();
  await expect(page.getByRole('menuitemcheckbox', { name: '深色背景适配 (dark)', exact: true })).toBeVisible();
}

test('English parameters render numbered alias-first captions and figure links follow equation alias rules', async ({ page }) => {
  const source = '# Empty\n\nNo figures here.\n\n# First\n\n'
    + '![[/image-properties/figure.png|别名#width=120#dark]]\n\n'
    + '[[/image-properties/figure.png]] [[/image-properties/figure.png|]] [[/image-properties/figure.png|参见示意]]\n\n'
    + '![[/image-properties/figure.png|重复#width=100]]\n\n[[/image-properties/figure.png]]\n\n'
    + '# Second\n\n![[/image-properties/other.png|第二张#width=90]]\n\n[[/image-properties/other.png]]\n\nend';
  await reset(page, source);
  for (const index of [0, 1]) {
    const host = slot(page, index);
    await expect(host.locator('.cm-image-caption')).toHaveText(['图1-1 别名', '图1-2 重复', '图2-1 第二张']);
    await expect(host.locator('[data-image-reference]')).toHaveText(['图1-1', 'figure.png', '参见示意', '图1-2', '图2-1']);
    await expect(host.locator('[data-image-number="1-1"]')).toHaveAttribute('data-image-dark');
    await expect(host.locator('[data-image-number="1-1"] > img')).toHaveAttribute('width', '120');
    expect(await host.locator('.cm-image-caption').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize)))
      .toBeLessThan(await host.locator('.cm-content').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize)));
  }
  expect(await page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  await slot(page, 1).locator('.cm-image-wrap > img').first().hover();
  await page.waitForTimeout(350);
  await expect(page.locator('.cm-link-preview')).toHaveCount(0);
  await slot(page, 1).locator('[data-image-reference]').first().hover();
  await page.waitForTimeout(350);
  await expect(page.locator('.cm-link-preview')).toHaveCount(0);
});

test('property menus toggle only the clicked instance and preserve unknown parameters through undo', async ({ page }) => {
  const source = '![[/image-properties/figure.png|别名#width=120#dark#mystery=a\\#b]]\n\n'
    + '![[/image-properties/figure.png|另一个#width=90#dark]]\n\nend';
  await reset(page, source);
  await openImageProperties(page);
  const dark = page.getByRole('menuitemcheckbox', { name: '深色背景适配 (dark)', exact: true });
  await expect(dark).toHaveAttribute('aria-checked', 'true');
  await dark.click();
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0)))
    .toBe('![[/image-properties/figure.png|别名#width=120#mystery=a\\#b]]\n\n![[/image-properties/figure.png|另一个#width=90#dark]]\n\nend');
  await expect(slot(page).locator('.cm-image-wrap').first()).not.toHaveAttribute('data-image-dark');
  await expect(slot(page).locator('.cm-image-wrap').nth(1)).toHaveAttribute('data-image-dark');
  await page.evaluate(() => window.renderHarness.undo(0));
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  await expect(slot(page).locator('.cm-image-wrap').first()).toHaveAttribute('data-image-dark');
});

test('numeric property editing and enum submenus write canonical embed parameters', async ({ page }) => {
  const source = '![[/image-properties/figure.png|别名#width=120]]\n\nend';
  await reset(page, source);
  await openImageProperties(page, 'keyboard');
  await page.getByRole('menuitemcheckbox', { name: '宽度 (width)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('input').fill('180');
  await dialog.getByRole('button', { name: '确定', exact: true }).click();
  await expect(slot(page).locator('.cm-image-wrap > img')).toHaveAttribute('width', '180');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toContain('#width=180');
  await openImageProperties(page, 'click');
  await page.getByRole('menuitemcheckbox', { name: '对齐 (align)', exact: true }).hover();
  await page.getByRole('menuitemcheckbox', { name: '居中', exact: true }).click();
  await expect(slot(page).locator('.cm-image-wrap')).toHaveAttribute('data-image-align', 'center');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toContain('#align=center');
});

test('Vault CSS properties appear in the same menu and reload their visual definition', async ({ page }) => {
  await reset(page, '![[/image-properties/figure.png|别名#width=120]]\n\nend');
  await openImageProperties(page);
  const framed = page.getByRole('menuitemcheckbox', { name: 'framed', exact: true });
  await expect(framed).toBeVisible();
  await framed.click();
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toContain('#framed');
  const image = slot(page).locator('.embed-property-framed > img');
  await expect(image).toHaveCSS('outline-color', 'rgb(120, 80, 210)');
  customCss = '.embed-property-framed > img { outline: 4px solid rgb(20, 160, 90); filter: brightness(0.8); }';
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vault-configuration-changed', {
    detail: { path: '.obsidian/webobsidian/embeds.css' },
  })));
  await expect(image).toHaveCSS('outline-color', 'rgb(20, 160, 90)');
  await expect(image).toHaveCSS('outline-width', '4px');
  await page.emulateMedia({ media: 'print' });
  await expect(image).toHaveCSS('filter', 'brightness(0.8)');
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => (window as any).imagePropertiesFixture.stopProperties());
  await expect(image).toHaveCSS('outline-style', 'none');
});

test('dark maps white to the current paper, preserves red identity and excludes filename heuristics', async ({ page }) => {
  await reset(page, '![[/image-properties/figure.png|适配#width=120#dark]]\n\n'
    + '![[/image-properties/my-dark-Wiki.png|原图#width=120]]\n\nend');
  const host = slot(page, 1), image = host.locator('[data-image-dark] > img');
  await expect(image).toHaveCSS('filter', 'none');
  await page.evaluate(() => { document.querySelector('[data-slot="0"]')!.parentElement!.className = 'theme-dark'; });
  await expect(image).toHaveCSS('filter', /invert\([\d.]+\) hue-rotate\(180deg\)/);
  await expect(host.locator('[data-image-source="/image-properties/my-dark-Wiki.png"] > img')).toHaveCSS('filter', 'none');
  const screenshot = PNG.sync.read(await image.screenshot());
  const sample = (x: number) => [...screenshot.data.subarray((Math.floor(screenshot.height / 2) * screenshot.width + Math.floor(screenshot.width * x)) * 4,
    (Math.floor(screenshot.height / 2) * screenshot.width + Math.floor(screenshot.width * x)) * 4 + 3)];
  for (const channel of sample(0.25)) expect(Math.abs(channel - 30)).toBeLessThanOrEqual(2);
  const [red, green, blue] = sample(0.75);
  expect(red).toBeGreaterThan(200); expect(red - green).toBeGreaterThan(60); expect(red - blue).toBeGreaterThan(60);
  await expect(host.locator('.cm-image-caption').first()).toHaveCSS('filter', 'none');
  await page.emulateMedia({ media: 'print' });
  await expect(image).toHaveCSS('filter', 'none');
  await page.emulateMedia({ media: 'screen' });
  await expect(image).toHaveCSS('filter', /invert/);
});

test('dark also maps white to a colored paper without changing image source bytes', async ({ page }) => {
  const source = '![[/image-properties/figure.png|色纸#width=120#dark]]\n\nend';
  await reset(page, source);
  await page.evaluate(() => {
    const theme = document.querySelector('[data-slot="0"]')!.parentElement as HTMLElement;
    theme.className = 'theme-dark'; theme.style.setProperty('--background-primary', 'rgb(30, 40, 50)');
  });
  const image = slot(page, 1).locator('[data-image-dark] > img');
  await expect(image).toHaveCSS('filter', /url\(/);
  const screenshot = PNG.sync.read(await image.screenshot());
  const at = (Math.floor(screenshot.height / 2) * screenshot.width + Math.floor(screenshot.width / 4)) * 4;
  const actual = [...screenshot.data.subarray(at, at + 3)];
  for (const [index, expected] of [30, 40, 50].entries()) expect(Math.abs(actual[index] - expected)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  await page.screenshot({ path: test.info().outputPath('image-properties-colored-paper.png') });
});

test('table images keep escaped aliases, figure links and cell boundaries after property menu edits', async ({ page }) => {
  const source = '| Image | References |\n| --- | --- |\n'
    + '| ![[/image-properties/figure.png\\|别名\\|部分\\|120x80#dark#mystery=a\\#b]] | '
    + '[[/image-properties/figure.png]] [[/image-properties/figure.png\\|]] [[/image-properties/figure.png\\|参见\\|示意]] |\n\nend';
  await reset(page, source);
  // Existing cells mounted before the harness injected Vault/menu services.
  // Re-enter their normal render path with the fixture's scoped context.
  await page.evaluate(() => { window.renderHarness.mode(0, 'source'); window.renderHarness.mode(1, 'source'); });
  await expect(page.locator('.cm-table')).toHaveCount(0);
  await page.evaluate(() => { window.renderHarness.mode(0, 'live'); window.renderHarness.mode(1, 'reading'); });
  for (const index of [0, 1]) {
    const host = slot(page, index);
    await expect(host.locator('.cm-image-caption')).toHaveText('图1-1 别名|部分');
    await expect(host.locator('[data-image-reference]')).toHaveText(['图1-1', 'figure.png', '参见|示意']);
    await expect(host.locator('tbody tr')).toHaveCount(1);
    await expect(host.locator('tbody td')).toHaveCount(2);
    await host.locator('.cm-table').evaluate(table => { (table as HTMLElement).style.width = '40px'; });
    await expect(host.locator('.cm-image-wrap > img')).toHaveCSS('width', '120px');
  }
  await openImageProperties(page);
  const dark = page.getByRole('menuitemcheckbox', { name: '深色背景适配 (dark)', exact: true });
  await expect(dark).toBeEnabled();
  await expect(dark).toHaveAttribute('aria-checked', 'true');
  await dark.click();
  const changed = source.replace('别名\\|部分\\|120x80#dark#mystery', '别名\\|部分#width=120#height=80#mystery');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(changed);
  for (const index of [0, 1]) {
    const host = slot(page, index);
    await expect(host.locator('.cm-image-caption')).toHaveText('图1-1 别名|部分');
    await expect(host.locator('tbody td')).toHaveCount(2);
    await expect(host.locator('.cm-image-wrap')).not.toHaveAttribute('data-image-dark');
    await expect(host.locator('[data-image-reference]')).toHaveText(['图1-1', 'figure.png', '参见|示意']);
  }
  await page.evaluate(() => window.renderHarness.undo(0));
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  await expect(slot(page).locator('.cm-image-wrap')).toHaveAttribute('data-image-dark');
});

test('explicit dimensions and fit control the displayed image rectangle', async ({ page }) => {
  await reset(page, '![[/image-properties/figure.png|裁切#width=120#height=120#fit=cover]]\n\nend');
  for (const index of [0, 1]) {
    const image = slot(page, index).locator('.cm-image-wrap > img');
    await expect(image).toHaveCSS('width', '120px');
    await expect(image).toHaveCSS('height', '120px');
    await expect(image).toHaveCSS('object-fit', 'cover');
  }
});

test('touch-sized property menus keep nested choices inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await reset(page, '![[/image-properties/figure.png|小屏#width=100]]\n\nend');
  await openImageProperties(page, 'click');
  const properties = page.getByRole('menuitemcheckbox', { name: '对齐 (align)', exact: true });
  await properties.click();
  const right = page.getByRole('menuitemcheckbox', { name: '右对齐', exact: true });
  await expect(right).toBeVisible();
  const bounds = await right.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await right.click();
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toContain('#align=right');
});

test('personal exTable source spans give identical image cells independent numbers and parent-owned property edits', async ({ page }) => {
  await page.route('**/api/native-features/blocks', route => route.fulfill({ json: { vault: 'browser-fixture', definitions: [
    { names: ['exTable'], classes: [], script: 'merged-table.js', code: mergedTable },
  ] } }));
  const image = '![[/image-properties/figure.png\\|Same#width=90#dark#mystery=a\\#b]]';
  const source = '# Chapter\n\n[exTable]\n\n| Images | < |\n| --- | --- |\n| ' + image + ' | ' + image + ' |\n\nend';
  await reset(page, source, true);
  await page.evaluate(async () => {
    const load = (name: string) => import(name);
    const [effects, runtime] = await Promise.all([
      load('/src/lib/blocks/runtime.ts'), load('/src/lib/obsidian/runtime.ts'),
    ]);
    (window as any).imagePropertiesFixture.stopBlocks = effects.installBlockEffects(runtime.sharedApp);
  });
  for (const index of [0, 1]) {
    const table = slot(page, index).locator('.native-block-effect table');
    await expect(table).toHaveCount(1);
    await expect(table.locator('th')).toHaveAttribute('colspan', '2');
    await expect(table.locator('.cm-image-caption')).toHaveText(['图1-1 Same', '图1-2 Same']);
    await expect(table.locator('[data-image-dark]')).toHaveCount(2);
  }
  await expect(page.locator('[data-render-pending]')).toHaveCount(0);
  await slot(page).locator('.native-block-effect [data-image-number="1-2"] > img').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '添加属性', exact: true }).hover();
  const dark = page.getByRole('menuitemcheckbox', { name: '深色背景适配 (dark)', exact: true });
  await expect(dark).toBeEnabled(); await dark.click();
  const changed = source.replace(image + ' |\n', image.replace('#dark', '') + ' |\n');
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(changed);
  for (const index of [0, 1]) {
    const table = slot(page, index).locator('.native-block-effect table');
    await expect(table.locator('.cm-image-caption')).toHaveText(['图1-1 Same', '图1-2 Same']);
    await expect(table.locator('[data-image-number="1-1"]')).toHaveAttribute('data-image-dark');
    await expect(table.locator('[data-image-number="1-2"]')).not.toHaveAttribute('data-image-dark');
    await expect(table.locator('td')).toHaveCount(2);
  }
  await page.evaluate(() => window.renderHarness.undo(0));
  await expect.poll(() => page.evaluate(() => window.renderHarness.source(0))).toBe(source);
  await expect(slot(page).locator('.native-block-effect [data-image-dark]')).toHaveCount(2);
  await slot(page, 1).locator('.native-block-effect [data-image-number="1-2"] > img').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '添加属性', exact: true }).hover();
  await expect(page.getByRole('menuitemcheckbox', { name: '深色背景适配 (dark)', exact: true })).toBeDisabled();
});
