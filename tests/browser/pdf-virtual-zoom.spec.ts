import { test, expect } from './test';
import { makePdfFixture } from './fixtures/pdf';
import type { Page } from '@playwright/test';

async function mountPdfBook(page: Page, beforePdf?: (path: string) => Promise<void>) {
  const pdf = makePdfFixture({ pages: 10 });
  const folder = 'Zoom book';
  const files = Array.from({ length: 5 }, (_, index) => ({ path: `${folder}/Slides ${index + 1}.pdf`, title: `Slides ${index + 1}`,
    kind: 'pdf', size: pdf.length, headings: [] }));
  const collection = { path: folder, title: 'PDF zoom', revision: 'initial', streams: [{ id: 'pdf', title: 'PDF', files }] };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/vault-identity' || url.pathname === '/api/writing') return route.fallback();
    if (url.pathname === '/api/files/content') {
      await beforePdf?.(url.searchParams.get('path') ?? '');
      return route.fulfill({ contentType: 'application/pdf', body: route.request().method() === 'HEAD' ? Buffer.alloc(0) : pdf });
    }
    if (url.pathname === '/api/property-types') return route.fulfill({ json: { types: {} } });
    return route.fulfill({ json: { hits: [], matches: [], backlinks: [], outgoing: [], enabled: false } });
  });
  await page.goto('/__render-test'); await page.waitForFunction(() => Boolean(window.renderHarness));
  await page.evaluate(async collection => {
    const load = (path: string) => import(path);
    const [React, ReactDOM, { default: VirtualDocumentView }, { useVirtualReading }] = await Promise.all([
      load('/node_modules/.vite/deps/react.js'), load('/node_modules/.vite/deps/react-dom_client.js'),
      load('/src/components/VirtualDocumentView.tsx'), load('/src/lib/virtualReading.ts'),
    ]);
    document.getElementById('root')!.hidden = true;
    const host = document.createElement('div'); host.id = 'pdf-virtual-zoom'; host.style.cssText = 'position:fixed;inset:0'; document.body.append(host);
    function Probe() { (window as any).zoomReader = useVirtualReading(collection.path, 'main'); return null; }
    const h = (React.default ?? React).createElement;
    (ReactDOM.createRoot ?? ReactDOM.default.createRoot)(host).render(h('div', { className: 'theme-dark', style: { height: '100%' } },
      h(VirtualDocumentView, { document: collection }), h(Probe)));
  }, collection);
  await page.waitForFunction(() => Boolean((window as any).zoomReader));
  return { files, root: page.locator('#pdf-virtual-zoom .virtual-document-scroll') };
}

async function waitForLayoutFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => {
    let frames = 0;
    const measured = () => { if (++frames < 8) requestAnimationFrame(measured); else resolve(); };
    requestAnimationFrame(measured);
  }));
}

test('continuous PDF wheel zoom keeps the pointed page, horizontal access and multiplier after chapter remount', async ({ page }) => {
  test.setTimeout(60000);
  const { files, root } = await mountPdfBook(page);
  await page.evaluate(path => (window as any).zoomReader.go({ path, page: 5 }), files[1].path);
  const slot = root.locator(`[data-virtual-source="${files[1].path}"] [data-page-number="5"]`);
  await expect(slot.locator('.pdf-page-surface.is-ready')).toBeInViewport();
  await expect(root.locator('[data-mounted="true"] [data-virtual-loading]')).toHaveCount(0);
  const initial = await slot.boundingBox(), viewport = await root.boundingBox();
  const pointer = { x: initial!.x + initial!.width * 0.5, y: Math.max(initial!.y + 80, viewport!.y + 160) };
  const fractions = { x: (pointer.x - initial!.x) / initial!.width, y: (pointer.y - initial!.y) / initial!.height };
  await page.mouse.move(pointer.x, pointer.y);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -400); await page.keyboard.up('Control');
  await expect.poll(async () => Number(await root.getAttribute('data-pdf-zoom'))).toBeGreaterThan(1);
  await expect(slot.locator('.pdf-page-surface.is-ready')).toBeInViewport();
  const enlarged = await slot.boundingBox();
  expect(Math.abs(enlarged!.y + enlarged!.height * fractions.y - pointer.y)).toBeLessThan(3);
  expect(Math.abs(enlarged!.x + enlarged!.width * fractions.x - pointer.x)).toBeLessThan(3);
  const zoom = await root.getAttribute('data-pdf-zoom');
  expect(await root.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.evaluate(path => (window as any).zoomReader.go({ path, page: 1 }), files[4].path);
  await expect(root.locator(`[data-virtual-source="${files[4].path}"] [data-page-number="1"] .is-ready`)).toBeInViewport();
  await page.evaluate(path => (window as any).zoomReader.go({ path, page: 5 }), files[1].path);
  await expect(slot.locator('.pdf-page-surface.is-ready')).toBeInViewport();
  expect(await root.getAttribute('data-pdf-zoom')).toBe(zoom);
  await expect.poll(async () => (await slot.boundingBox())!.width).toBeCloseTo(enlarged!.width, 0);
  expect(await root.locator('[data-mounted="true"]').count()).toBeLessThanOrEqual(5);
});

test('holding Control while a predecessor PDF loads preserves navigation until the zoom starts', async ({ page }) => {
  test.setTimeout(60000);
  let releasePredecessor!: () => void;
  const predecessor = new Promise<void>(resolve => { releasePredecessor = resolve; });
  const { files, root } = await mountPdfBook(page, path => path.endsWith('/Slides 1.pdf') ? predecessor : Promise.resolve());
  await page.evaluate(path => (window as any).zoomReader.go({ path, page: 1 }), files[1].path);
  const slot = root.locator(`[data-virtual-source="${files[1].path}"] [data-page-number="1"]`);
  await expect(slot.locator('.pdf-page-surface.is-ready')).toBeInViewport();
  await root.focus();
  await page.keyboard.down('Control');
  try {
    releasePredecessor();
    await expect(root.locator('[data-mounted="true"] [data-virtual-loading]')).toHaveCount(0);
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => (window as any).zoomReader.getSnapshot().target?.path)).toBe(files[1].path);
    const initial = await slot.boundingBox(), viewport = await root.boundingBox();
    expect(initial!.y).toBeGreaterThanOrEqual(viewport!.y - 1);
    const pointer = { x: initial!.x + initial!.width / 2, y: initial!.y + 180 };
    const fraction = 180 / initial!.height;
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => Number(await root.getAttribute('data-pdf-zoom'))).toBeGreaterThan(1);
    await expect(slot.locator('.pdf-page-surface.is-ready')).toBeInViewport();
    const enlarged = await slot.boundingBox();
    expect(Math.abs(enlarged!.y + enlarged!.height * fraction - pointer.y)).toBeLessThan(3);
    await expect(slot.locator('.pdf-text-layer').getByText('Page 1', { exact: true })).toBeInViewport();
  } finally {
    releasePredecessor();
    await page.keyboard.up('Control');
  }
});

test('zoom waits for predecessor placeholder height commits before restoring a page anchor', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1280, height: 860 });
  const { files, root } = await mountPdfBook(page);
  await page.addStyleTag({ content: '#pdf-virtual-zoom { --font-text-size: 19px; --font-text-custom: Georgia, serif; } #pdf-virtual-zoom .virtual-source-header { height: 350px; }' });
  await page.evaluate(path => (window as any).zoomReader.go({ path, page: 1 }), files[1].path);
  const slot = root.locator(`[data-virtual-source="${files[1].path}"] [data-page-number="1"]`);
  await expect(slot.locator('.pdf-page-surface.is-ready')).toBeInViewport();
  await expect(root.locator('[data-mounted="true"] [data-virtual-loading]')).toHaveCount(0);
  await page.evaluate(() => {
    // Keep normal React height commits behind animation frames, as in the native production race.
    const prototype = MessagePort.prototype as any, send = prototype.postMessage;
    prototype.postMessage = function(this: MessagePort, ...args: unknown[]) {
      if (args[0] === null) setTimeout(() => send.apply(this, args), 80);
      else send.apply(this, args);
    };
    (window as any).restorePdfScheduler = () => { prototype.postMessage = send; };
  });
  const initial = await slot.boundingBox();
  const pointer = { x: initial!.x + initial!.width / 2, y: initial!.y + 180 };
  const fraction = 180 / initial!.height;
  await root.focus();
  await page.mouse.move(pointer.x, pointer.y);
  await page.keyboard.down('Control');
  try {
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => Number(await root.getAttribute('data-pdf-zoom'))).toBeGreaterThan(1);
    await waitForLayoutFrames(page);
    const enlarged = await slot.boundingBox();
    expect(Math.abs(enlarged!.y + enlarged!.height * fraction - pointer.y)).toBeLessThan(3);
    await expect(slot.locator('.pdf-page-surface.is-ready')).toBeInViewport();
  } finally {
    await page.keyboard.up('Control');
    await page.evaluate(() => (window as any).restorePdfScheduler());
  }
});

for (const delayed of ['predecessor', 'target']) {
  test(`PDF page navigation survives height correction when the ${delayed} loads last`, async ({ page }) => {
    test.setTimeout(60000);
    let release!: () => void;
    const loading = new Promise<void>(resolve => { release = resolve; });
    const delayedFile = delayed === 'predecessor' ? '/Slides 1.pdf' : '/Slides 2.pdf';
    const { files, root } = await mountPdfBook(page, path => path.endsWith(delayedFile) ? loading : Promise.resolve());
    try {
      await page.evaluate(path => (window as any).zoomReader.go({ path, page: 5 }), files[1].path);
      const slot = root.locator(`[data-virtual-source="${files[1].path}"] [data-page-number="5"]`);
      if (delayed === 'predecessor') await expect(slot.locator('.pdf-page-surface.is-ready')).toBeInViewport();
      else await expect(root.locator(`[data-virtual-source="${files[0].path}"] [data-virtual-loading]`)).toHaveCount(0);
      await waitForLayoutFrames(page);
      release();
      await expect(root.locator('[data-mounted="true"] [data-virtual-loading]')).toHaveCount(0);
      await expect(slot.locator('.pdf-page-surface.is-ready')).toBeInViewport();
      await waitForLayoutFrames(page);
      const targetTop = await root.evaluate(element => element.getBoundingClientRect().top + parseFloat(getComputedStyle(element).scrollPaddingTop));
      expect(Math.abs((await slot.boundingBox())!.y - targetTop)).toBeLessThan(2);
      await expect(slot.locator('.pdf-text-layer').getByText('Page 5', { exact: true })).toBeInViewport();
    } finally { release(); }
  });
}
