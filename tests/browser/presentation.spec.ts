import { readFileSync } from 'node:fs';
import { test, expect } from './test';
import { makePdfFixture } from './fixtures/pdf';

const pptx = readFileSync('tests/fixtures/presentation.pptx');
const ppt = readFileSync('tests/fixtures/presentation-legacy.ppt');
const paths = ['slides.PPTX', 'legacy.ppt', 'paper.pdf', 'broken.pptx', 'note.md'];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/api/vault-identity' || url.pathname === '/api/writing') return route.fallback();
    if (url.pathname.replace(/\/$/, '') === '/api/uistate')
      return route.fulfill({ json: request.method() === 'PUT' ? { ok: true } : {} });
    if (url.pathname === '/api/files/content') {
      const path = url.searchParams.get('path') ?? '';
      if (/\.(pptx?|pdf)$/i.test(path)) return route.fulfill({ contentType: 'application/octet-stream',
        body: path === 'paper.pdf' ? makePdfFixture({ pages: 3 }) : path === 'legacy.ppt' ? ppt : path === 'broken.pptx' ? Buffer.from('broken') : pptx });
      return route.fulfill({ json: { path, content: '# Note\n\noriginal note', revision: 'initial', vault: 'browser-fixture' } });
    }
    if (url.pathname === '/api/property-types') return route.fulfill({ json: { types: {} } });
    return route.fulfill({ json: { hits: [], matches: [], backlinks: [], enabled: false } });
  });
  await page.goto('/__render-test');
  await page.waitForFunction(() => Boolean(window.renderHarness));
  await page.evaluate(async paths => {
    const load = (path: string) => import(path);
    const [React, ReactDOM, { default: Workspace }, { default: Tabs }, { default: RightSidebar }, store, pdf, { documents }, plugins] = await Promise.all([
      load('/node_modules/.vite/deps/react.js'), load('/node_modules/.vite/deps/react-dom_client.js'),
      load('/src/components/Workspace.tsx'), load('/src/components/WorkspaceTabs.tsx'), load('/src/components/RightSidebar.tsx'),
      load('/src/lib/store.ts'), load('/src/lib/pdf/react.ts'), load('/src/lib/documents.ts'), load('/src/lib/plugins.ts'),
    ]);
    document.getElementById('root')!.hidden = true;
    const host = document.createElement('div'); host.id = 'presentation-fixture'; host.style.cssText = 'position:fixed;inset:0'; document.body.append(host);
    const tree = { name: 'Fixture', path: '', type: 'folder', children: paths.map(path => ({ name: path, path, type: 'file' })) };
    await store.useStore.getState().loadUiState();
    store.useStore.setState({ tree, filePaths: paths, tabs: [],
      rightPanel: 'outline', rightOpen: true, rightActiveId: null, rightTabs: [], leftOpen: false });
    plugins.sharedApp.vault.sync(tree);
    const h = (React.default ?? React).createElement;
    (ReactDOM.createRoot ?? ReactDOM.default.createRoot)(host).render(h('div', { className: 'app theme-dark', style: { height: '100%' } },
      h(Tabs), h(Workspace), h(RightSidebar, { open: true })));
    (window as any).presentationFixture = { ...store, pdf, documents, commands: plugins.sharedApp.commands };
  }, paths);
});

for (const [path, count, title] of [['slides.PPTX', 7, '预设形状库'], ['legacy.ppt', 2, '.ppt 实验性解析']] as const) {
  test(`${path} opens through the ordinary workspace and shares outline, search and thumbnails`, async ({ page }) => {
    await page.evaluate(path => (window as any).presentationFixture.useStore.getState().openFile(path), path);
    const viewer = page.locator('.main-pane .pdf-viewer');
    await expect(viewer).toHaveAttribute('data-document-format', 'ppt');
    await expect(viewer.locator('.pdf-page-surface.is-ready').first()).toBeVisible();
    await expect(viewer.locator('.pdf-page-slot')).toHaveCount(count);
    await expect(page.getByRole('navigation', { name: 'PPT 幻灯片大纲' })).toContainText(title);
    await expect(viewer.locator('.ppt-text-layer').first()).toContainText(title);
    await page.getByRole('button', { name: '显示/隐藏 PPT 工具栏' }).click();
    await expect(page.getByRole('textbox', { name: 'PPT 页码' })).toHaveValue('1');
    await page.getByRole('searchbox', { name: '搜索 PPT' }).fill(title);
    await expect(viewer.locator('.pdf-search [role=status]')).toHaveText('1/1');
    await page.evaluate(() => (window as any).presentationFixture.useStore.getState().setRightPanel('minimap'));
    await expect(page.getByLabel('PPT 页面缩略图')).toBeVisible();
    const image = await page.locator('[data-thumbnail-page="1"] .pdf-thumbnail-image').boundingBox();
    expect(image!.width / image!.height).toBeCloseTo(path === 'legacy.ppt' ? 4 / 3 : 16 / 9, 1);
    await expect(page.locator('.pdf-thumbnail.has-matches')).toHaveCount(1);
    const body = viewer.locator('[data-pdf-page="1"] .pdf-match').first();
    await expect(body).toBeVisible();
    expect(await page.locator('.pdf-thumbnails [data-pdf-page="1"] .pdf-match').first().getAttribute('data-match-box'))
      .toBe(await body.getAttribute('data-match-box'));
    await page.locator(`[data-thumbnail-page="${count}"]`).click();
    await expect(page.getByRole('textbox', { name: 'PPT 页码' })).toHaveValue(String(count));
    await expect(viewer.locator(`[data-pdf-page="${count}"].is-ready`)).toBeVisible();
    await page.getByRole('button', { name: '放大 PPT' }).click();
    await expect(viewer.locator('.pdf-zoom')).toHaveText('125%');
    const state = await page.evaluate(path => {
      const f = (window as any).presentationFixture;
      return { writable: !!f.documents.get(path), stale: f.useStore.getState().vaultSessionStale,
        text: f.pdf.getMainPdfSession(path).getSnapshot().query };
    }, path);
    expect(state).toEqual({ writable: false, stale: false, text: title });
  });
}

test('one persisted dark command applies to PPT and PDF while panes retain independent navigation', async ({ page }) => {
  await page.evaluate(() => (window as any).presentationFixture.useStore.getState().openFile('slides.PPTX'));
  await expect(page.locator('.main-pane .pdf-page-surface.is-ready').first()).toBeVisible();
  expect(await page.evaluate(() => (window as any).presentationFixture.commands.canExecute('pdf:toggle-dark'))).toBe(true);
  await page.evaluate(() => (window as any).presentationFixture.commands.executeCommandById('pdf:toggle-dark'));
  await expect(page.locator('.main-pane [data-pdf-page="1"]')).toHaveAttribute('data-pdf-dark', 'true');
  await page.evaluate(() => (window as any).presentationFixture.useStore.getState().setRightPanel('minimap'));
  await expect(page.locator('.pdf-thumbnails [data-pdf-page="1"]')).toHaveAttribute('data-pdf-dark', 'true');
  const filter = await page.locator('.main-pane [data-pdf-page="1"] canvas').evaluate(canvas => getComputedStyle(canvas).filter);
  expect(filter).not.toBe('none');
  await page.evaluate(async () => {
    const f = (window as any).presentationFixture;
    f.main = f.pdf.getMainPdfSession('slides.PPTX');
    await f.useStore.getState().openRightTab('markdown', { file: 'slides.PPTX' }, 'same-presentation');
  });
  await expect(page.locator('[data-sidebar-tab="same-presentation"] .pdf-page-surface.is-ready').first()).toBeVisible();
  expect(await page.evaluate(() => {
    const f = (window as any).presentationFixture;
    const side = f.pdf.getActivePdfSession();
    return { same: side.resource === f.main.resource, dark: side.getSnapshot().dark };
  })).toEqual({ same: true, dark: true });
  await page.evaluate(async () => {
    const f = (window as any).presentationFixture;
    await f.useStore.getState().closeRightTab('same-presentation');
    f.main.goToPage(5);
  });
  await expect(page.locator('.main-pane [data-pdf-page="5"].is-ready')).toBeVisible();
  // Image and table slide must produce pixels, including embedded blob resources.
  const pixels = await page.locator('.main-pane [data-pdf-page="5"] canvas').evaluate((canvas: HTMLCanvasElement) => {
    const values = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let i = 0; i < values.length; i += 64) if (Math.max(values[i], values[i + 1], values[i + 2]) - Math.min(values[i], values[i + 1], values[i + 2]) > 40) colored++;
    return colored;
  });
  expect(pixels).toBeGreaterThan(300);
  // PDFs default to dark (PRD 1.63); the shared command remembers turning it off.
  await page.evaluate(() => (window as any).presentationFixture.useStore.getState().openFile('paper.pdf'));
  await expect(page.locator('.main-pane .pdf-page-surface.is-ready').first()).toBeVisible();
  await expect(page.locator('.main-pane [data-pdf-page="1"]')).toHaveAttribute('data-pdf-dark', 'true');
  await page.evaluate(() => (window as any).presentationFixture.commands.executeCommandById('pdf:toggle-dark'));
  await expect(page.locator('.main-pane [data-pdf-page="1"]')).not.toHaveAttribute('data-pdf-dark');
  await page.evaluate(() => (window as any).presentationFixture.useStore.getState().openFile('slides.PPTX'));
  await expect(page.locator('.main-pane .pdf-page-surface.is-ready').first()).toBeVisible();
  await expect(page.locator('.main-pane [data-pdf-page="1"]')).toHaveAttribute('data-pdf-dark', 'true');
  expect(await page.evaluate(() => (window as any).presentationFixture.useStore.getState().pdfDarkOverrides)).toEqual({ 'slides.PPTX': true, 'paper.pdf': false });
});

test('damaged and replaced presentations release their sessions without affecting Markdown', async ({ page }) => {
  await page.evaluate(() => (window as any).presentationFixture.useStore.getState().openFile('broken.pptx'));
  await expect(page.locator('.main-pane [role=alert]')).toContainText('无法识别的文件格式');
  await page.evaluate(async () => {
    const f = (window as any).presentationFixture;
    await f.useStore.getState().openFile('slides.PPTX');
    f.old = f.pdf.getMainPdfSession('slides.PPTX');
    await f.useStore.getState().openFile('note.md');
  });
  await expect(page.locator('.main-pane .cm-content')).toContainText('original note');
  await expect(page.locator('.main-pane .pdf-viewer')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).presentationFixture.pdf.getMainPdfSession('slides.PPTX'))).toBeNull();
});
