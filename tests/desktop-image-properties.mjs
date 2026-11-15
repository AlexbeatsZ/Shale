// Run with a packaged native executable. Every file and setting uses a disposable Vault/profile.
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { _electron as electron, expect } from '@playwright/test';
import { makePdfFixture } from './browser/fixtures/pdf.ts';

const require = createRequire(import.meta.url);
const { PNG } = require(path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
const project = path.resolve(import.meta.dirname, '..');
const temporary = path.join(process.platform === 'win32' ? os.tmpdir() : '/tmp', '.agents');
await fs.mkdir(temporary, { recursive: true });
const fixture = await fs.mkdtemp(path.join(temporary, 'image-properties-native-'));
const vault = path.join(fixture, 'vault'), profile = path.join(fixture, 'profile');
const evidence = path.resolve(process.env.IMAGE_PROPERTIES_OUTPUT ?? path.join(fixture, 'evidence'));
await Promise.all([fs.mkdir(vault), fs.mkdir(profile), fs.mkdir(evidence, { recursive: true })]);

const sourceVault = path.resolve(process.env.IMAGE_PROPERTIES_SOURCE_VAULT ?? '/Users/meta/Documents/Obsidian/STEM');
const originals = new Map();
const copySource = async relative => {
  const source = path.join(sourceVault, relative), destination = path.join(vault, relative);
  const bytes = await fs.readFile(source); originals.set(source, bytes);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes);
  return bytes;
};
await Promise.all(['Theme', 'Hider'].map(name => copySource(path.join('.obsidian', 'snippets', `${name}.css`))));
await fs.writeFile(path.join(vault, '.obsidian', 'appearance.json'), JSON.stringify({ enabledCssSnippets: ['Theme', 'Hider'] }, null, 2));
const blockFiles = ['blocks.jsonc', 'merged-table.js', 'list-table.js', 'tables.css'];
await Promise.all(blockFiles.map(filename => copySource(path.join('.obsidian', 'webobsidian', 'blocks', filename))));

const sourceNote = path.join(sourceVault, '02笔记', '化学', '物理化学', '物理化学 07固态.md');
const sourceNoteBytes = await fs.readFile(sourceNote); originals.set(sourceNote, sourceNoteBytes);
const sourceLines = sourceNoteBytes.toString('utf8').split(/\r?\n/);
const latticeRows = sourceLines.slice(162, 169);
assert.equal(latticeRows.length, 7);
assert(latticeRows.every(row => row.startsWith('|')), 'Source lines 163–169 must remain the seven lattice rows');
const latticeImages = [...latticeRows.join('\n').matchAll(/!\[\[([^|\\\]]+)\\?\|(\d+)\]\]/g)]
  .map(match => ({ filename: match[1], width: Number(match[2]) }));
assert.equal(latticeImages.length, 14, 'The source lattice table must contain fourteen image embeds');
assert.equal(new Set(latticeImages.map(image => image.filename)).size, 14);
for (const image of latticeImages) {
  assert.equal(path.basename(image.filename), image.filename);
  const bytes = await copySource(path.join('08附件', 'SVG-Wiki', image.filename));
  assert(bytes.toString('utf8').includes('webobsidian-wiki-palette-v1'), `${image.filename} must contain the converted source palette`);
}
const latticeName = 'Native Bravais lattice.md';
// Keep the original table directive and header alongside the seven requested body rows.
const latticeNote = '# Bravais lattice fixtures\n\n' + sourceLines.slice(157, 169).join('\n') + '\n\nend';
await fs.writeFile(path.join(vault, latticeName), latticeNote);

const raster = new PNG({ width: 240, height: 160 });
for (let y = 0; y < raster.height; y++) for (let x = 0; x < raster.width; x++) {
  const at = (y * raster.width + x) * 4;
  raster.data[at] = 255; raster.data[at + 1] = x < 120 ? 255 : 0;
  raster.data[at + 2] = x < 120 ? 255 : 0; raster.data[at + 3] = 255;
}
const imageBytes = PNG.sync.write(raster);
for (const filename of ['figure.png', 'my-dark-Wiki.png']) await fs.writeFile(path.join(vault, filename), imageBytes);
const noteName = 'Native image properties.md';
const initialNote = '# Figure section\n\n'
  + '![[figure.png|Native alias#width=180#dark]]\n\n'
  + '[[figure.png]] [[figure.png|]] [[figure.png|Explicit alias]]\n\n'
  + '![[my-dark-Wiki.png|Original pixels#width=120]]\n\n'
  + 'Native body text for wheel zoom.\n\nend';
await fs.writeFile(path.join(vault, noteName), initialNote);
await fs.mkdir(path.join(vault, '.obsidian', 'webobsidian'), { recursive: true });
await fs.writeFile(path.join(vault, '.obsidian', 'webobsidian', 'embeds.css'),
  '.embed-property-framed > img { outline: 3px solid rgb(120, 80, 210); }\n');
const pdf = makePdfFixture({ pages: 8 });
await fs.writeFile(path.join(vault, 'Native standalone.pdf'), pdf);
const book = 'Native PDF collection';
await fs.mkdir(path.join(vault, book));
for (const filename of ['Slides 1.pdf', 'Slides 2.pdf', 'Slides 3.pdf']) await fs.writeFile(path.join(vault, book, filename), pdf);
await fs.writeFile(path.join(vault, book, '.virtual-document.json'), JSON.stringify({ version: 1, title: book,
  streams: [{ id: 'pdf', title: 'PDF', files: ['Slides 1.pdf', 'Slides 2.pdf', 'Slides 3.pdf'] }] }, null, 2));
await fs.writeFile(path.join(profile, 'desktop-config.json'), JSON.stringify({ vaultPath: vault, trustedPlugins: false }));

const executablePath = process.argv[2] ? path.resolve(process.argv[2])
  : path.join(project, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const args = process.argv[2] ? [] : [path.join(project, 'desktop/dist/main.js')];
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let application;
const rendererErrors = [], diagnostics = [];
const virtualGeometry = [];
try {
  application = await electron.launch({ executablePath, args: [...args, `--user-data-dir=${profile}`], cwd: fixture, env, timeout: 120000 });
  const page = await application.firstWindow();
  page.on('pageerror', error => rendererErrors.push(String(error)));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text()); });
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 120000 });
  await expect(page.locator('.workspace-launcher')).toBeVisible({ timeout: 60000 });
  for (const name of ['折叠/展开左侧边栏', '折叠/展开右侧边栏']) {
    const button = page.getByRole('button', { name, exact: true });
    if (await button.getAttribute('aria-expanded') === 'true') await button.click();
  }
  const open = async name => {
    await page.keyboard.press('Control+o');
    await page.locator('.palette-input').fill(name); await page.keyboard.press('Enter');
    await expect(page.locator('.palette-backdrop')).toHaveCount(0);
    await page.mouse.move(5, 5);
  };
  const command = async name => {
    await page.keyboard.press('Control+p');
    await page.locator('.palette-input').fill(name); await page.keyboard.press('Enter');
    await expect(page.locator('.palette-backdrop')).toHaveCount(0);
  };
  const appearance = async () => {
    await command('打开设置');
    await page.getByRole('button', { name: '外观', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: '正文字号', exact: true })).toBeVisible();
  };
  const setTheme = async value => {
    await appearance();
    await page.getByRole('combobox', { name: '基础颜色', exact: true }).selectOption(value);
    await expect(page.locator('.settings-content [role="status"]')).toHaveText('已保存');
    await expect(page.locator('body')).toHaveClass(new RegExp(value === 'obsidian-light' ? 'theme-light' : 'theme-dark'));
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  };
  const wheel = async (locator, deltaY, holdControlMs = 0) => {
    const box = await locator.boundingBox(); assert(box, 'Wheel target must have native geometry');
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(180, box.height / 2));
    await page.keyboard.down('Control');
    try {
      if (holdControlMs) await page.waitForTimeout(holdControlMs);
      await page.mouse.wheel(0, deltaY);
    } finally { await page.keyboard.up('Control'); }
  };
  const openProperties = async () => {
    await page.locator('.main-pane [data-image-number="1-1"] > img').click({ button: 'right' });
    const add = page.getByRole('menuitem', { name: '添加属性', exact: true });
    await expect(add).toBeVisible(); await add.hover();
    await expect(page.getByRole('menuitemcheckbox', { name: '深色背景适配 (dark)', exact: true })).toBeVisible();
  };

  await open('Native image properties');
  for (const name of ['Theme', 'Hider']) {
    const stylesheet = page.locator(`link[data-css-snippet="${name}"]`);
    await expect(stylesheet).toHaveCount(1);
    await expect.poll(() => stylesheet.evaluate(link => Boolean(link.sheet?.cssRules.length))).toBe(true);
  }
  await setTheme('obsidian-light');
  const main = page.locator('.main-pane'), first = main.locator('[data-image-number="1-1"]');
  await expect(first.locator('img')).toBeVisible();
  await expect(main.locator('.cm-image-caption')).toHaveText(['图1-1 Native alias', '图1-2 Original pixels']);
  await expect(main.locator('[data-image-reference]')).toHaveText(['图1-1', 'figure.png', 'Explicit alias']);
  await expect(first.locator('img')).toHaveAttribute('width', '180');
  await expect(first.locator('img')).toHaveCSS('filter', 'none');
  await appearance();
  const fontSwitch = page.getByRole('checkbox', { name: 'Ctrl＋滚轮调整正文字号', exact: true });
  await expect(fontSwitch).not.toBeChecked();
  await page.getByRole('combobox', { name: '基础颜色', exact: true }).selectOption('obsidian-dark');
  await expect(page.locator('.settings-content [role="status"]')).toHaveText('已保存');
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await expect(first.locator('img')).toHaveCSS('filter', /invert\([\d.]+\) hue-rotate\(180deg\)/);
  await expect(first).toHaveCSS('filter', 'none');
  await expect(first.locator('.cm-image-caption')).toBeVisible();
  await expect(first.locator('.cm-image-caption')).toHaveCSS('filter', 'none');
  await expect(main.locator('[data-image-number="1-2"] > img')).toHaveCSS('filter', 'none');
  const screenshot = PNG.sync.read(await first.locator('img').screenshot());
  const sample = fraction => {
    const at = (Math.floor(screenshot.height / 2) * screenshot.width + Math.floor(screenshot.width * fraction)) * 4;
    return [...screenshot.data.subarray(at, at + 3)];
  };
  const paper = await first.evaluate(element => getComputedStyle(element).getPropertyValue('--embed-paper'));
  const paperRgb = paper.match(/[\d.]+/g).slice(0, 3).map(Number), white = sample(0.25), red = sample(0.75);
  paperRgb.forEach((value, index) => assert(Math.abs(white[index] - value) <= 2, 'White pixels must match the current paper'));
  assert(red[0] > 200 && red[0] - red[1] > 60 && red[0] - red[2] > 60, 'Red must retain its red identity');

  await openProperties();
  await page.getByRole('menuitemcheckbox', { name: '深色背景适配 (dark)', exact: true }).click();
  await expect(first).not.toHaveAttribute('data-image-dark');
  await expect.poll(() => fs.readFile(path.join(vault, noteName), 'utf8')).not.toContain('#dark');
  await openProperties();
  await page.getByRole('menuitemcheckbox', { name: '深色背景适配 (dark)', exact: true }).click();
  await expect(first).toHaveAttribute('data-image-dark');
  await openProperties();
  await page.getByRole('menuitemcheckbox', { name: '宽度 (width)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').fill('210'); await dialog.getByRole('button', { name: '确定', exact: true }).click();
  await expect(first.locator('img')).toHaveAttribute('width', '210');
  await openProperties(); await page.getByRole('menuitemcheckbox', { name: 'framed', exact: true }).click();
  await expect(first.locator('img')).toHaveCSS('outline-color', 'rgb(120, 80, 210)');
  await expect.poll(() => fs.readFile(path.join(vault, noteName), 'utf8')).toContain('#framed');
  await first.locator('img').click();
  await expect(page.locator('.image-lightbox-img')).toHaveCSS('filter', /invert/);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(evidence, 'native-image-properties.png') });

  const content = main.locator('.cm-content').first();
  const fontBefore = await content.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  const interfaceSize = await page.locator('.status-bar').evaluate(element => getComputedStyle(element).fontSize);
  await wheel(content, -120); await expect(content).toHaveCSS('font-size', `${fontBefore}px`);
  await appearance(); await fontSwitch.check();
  await expect(page.locator('.settings-content [role="status"]')).toHaveText('已保存');
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await wheel(content, -120); await expect(content).toHaveCSS('font-size', `${fontBefore + 1}px`);
  await expect.poll(async () => JSON.parse(await fs.readFile(path.join(profile, 'server-data', 'settings.json'), 'utf8')).ui.fontTextSize).toBe(fontBefore + 1);
  assert.equal(await page.locator('.status-bar').evaluate(element => getComputedStyle(element).fontSize), interfaceSize);

  await open('Native Bravais lattice');
  const latticeEffect = main.locator('.native-block-effect');
  await expect(latticeEffect).toHaveCount(1);
  const latticeTable = latticeEffect.locator('table.cm-table');
  await expect(latticeTable).toHaveCount(1);
  await expect(latticeEffect.locator('[data-render-pending]')).toHaveCount(0);
  await expect(latticeTable.locator('tbody > tr')).toHaveCount(9);
  const headerRows = latticeTable.locator('tbody > tr');
  await expect(headerRows.nth(0).locator(':scope > th')).toHaveCount(3);
  await expect(headerRows.nth(0).locator(':scope > th').nth(0)).toHaveAttribute('rowspan', '2');
  await expect(headerRows.nth(0).locator(':scope > th').nth(1)).toHaveAttribute('colspan', '4');
  await expect(headerRows.nth(0).locator(':scope > th').nth(2)).toHaveAttribute('rowspan', '2');
  await expect(headerRows.nth(1).locator(':scope > td')).toHaveCount(4);
  await expect(latticeTable.locator('.cm-image-wrap')).toHaveCount(14);
  for (const image of await latticeTable.locator('.cm-image-wrap > img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await expect(latticeTable.locator('.cm-image-caption')).toHaveText(latticeImages.map((image, index) => `图1-${index + 1} ${image.filename}`));
  const latticeColumns = await latticeTable.locator('tbody tr').evaluateAll(rows => rows
    .filter(row => row.querySelector('.cm-image-wrap > img'))
    .map(row => [...row.querySelectorAll('.cm-image-wrap > img')].map(image => image.closest('td').cellIndex)));
  assert.deepEqual(latticeColumns, [[1, 3, 4], [1], [1, 3], [1], [1, 2, 3, 4], [1, 2], [1]]);
  const latticeHeaders = await latticeTable.evaluate(table => {
    const [top, bottom] = table.tBodies[0].rows;
    const rectangle = element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    return { top: [...top.cells].map(rectangle), bottom: [...bottom.cells].map(rectangle),
      firstRow: rectangle(top), secondRow: rectangle(bottom) };
  });
  assert(Math.abs(latticeHeaders.top[1].x - latticeHeaders.bottom[0].x) < 1, 'Merged Bravais header must start at the first lattice column');
  assert(Math.abs(latticeHeaders.top[1].right - latticeHeaders.bottom[3].right) < 1, 'Merged Bravais header must span all four lattice columns');
  for (const index of [0, 2]) {
    assert(Math.abs(latticeHeaders.top[index].y - latticeHeaders.firstRow.y) < 1, 'Row-spanning header must start in the first header row');
    assert(Math.abs(latticeHeaders.top[index].bottom - latticeHeaders.secondRow.bottom) < 1, 'Row-spanning header must cover both header rows');
  }
  for (const [index, expected] of latticeImages.entries()) {
    const wrap = latticeTable.locator(`[data-image-number="1-${index + 1}"]`), image = wrap.locator('img');
    await expect(wrap).toHaveAttribute('data-image-source', expected.filename);
    await expect(wrap).not.toHaveAttribute('data-image-dark');
    await expect(image).toHaveAttribute('width', String(expected.width));
    await expect(image).toHaveCSS('width', `${expected.width}px`);
    await expect(image).toHaveCSS('filter', 'none');
    await expect(wrap.locator('.cm-image-caption')).toBeVisible();
    await expect(wrap.locator('.cm-image-caption')).toHaveCSS('filter', 'none');
  }
  const latticeGeometry = await latticeTable.locator('.cm-image-wrap').evaluateAll(wrappers => wrappers.map(wrap => {
    const image = wrap.querySelector('img'), rect = image.getBoundingClientRect();
    return { number: wrap.dataset.imageNumber, source: wrap.dataset.imageSource, width: rect.width, height: rect.height };
  }));
  await headerRows.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, 'native-bravais-lattice-dark.png') });
  await latticeTable.locator('[data-image-number="1-14"] > img').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, 'native-bravais-lattice-dark-bottom.png') });
  await setTheme('obsidian-light');
  for (const image of await latticeTable.locator('.cm-image-wrap > img').all()) await expect(image).toHaveCSS('filter', 'none');
  await headerRows.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, 'native-bravais-lattice-light.png') });
  await latticeTable.locator('[data-image-number="1-14"] > img').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, 'native-bravais-lattice-light-bottom.png') });
  await setTheme('obsidian-dark');

  await open('Native standalone.pdf');
  const pdfPage = main.locator('[data-page-number="1"]');
  await expect(pdfPage.locator('.pdf-page-surface.is-ready')).toBeVisible({ timeout: 30000 });
  const toolbarToggle = page.getByRole('button', { name: '显示/隐藏 PDF 工具栏', exact: true });
  if (await toolbarToggle.getAttribute('aria-expanded') !== 'true') await toolbarToggle.click();
  const pdfToolbar = main.getByRole('toolbar', { name: 'PDF 阅读工具', exact: true });
  await expect(pdfToolbar).toBeVisible();
  await expect(pdfToolbar.getByRole('button', { name: '放大 PDF', exact: true })).toBeVisible();
  assert(await pdfToolbar.evaluate(element => Number(getComputedStyle(element).opacity) > 0), 'Enabled Hider must preserve the PDF toolbar');
  const standaloneWidth = (await pdfPage.boundingBox()).width;
  await wheel(pdfPage, -180);
  await expect.poll(async () => (await pdfPage.boundingBox()).width).toBeGreaterThan(standaloneWidth);
  await command('切换 PDF 深色背景适配滤镜');
  await expect(pdfPage.locator('.pdf-page-surface')).toHaveAttribute('data-pdf-dark', 'true');
  await expect(pdfPage.locator('canvas')).toHaveCSS('filter', /invert/);
  await page.screenshot({ path: path.join(evidence, 'native-pdf-zoom-dark.png') });

  await open(book);
  const index = main.getByRole('navigation', { name: '文档索引' });
  await expect(index).toBeVisible(); await index.getByRole('link', { name: 'Slides 2', exact: true }).click();
  const continuous = main.locator('.virtual-document-scroll');
  const virtualPage = continuous.locator(`[data-virtual-source="${book}/Slides 2.pdf"] [data-page-number="1"]`);
  await expect(virtualPage.locator('.pdf-page-surface.is-ready')).toBeInViewport({ timeout: 30000 });
  await continuous.evaluate((root, sourcePath) => {
    const slot = root.querySelector(`[data-virtual-source="${sourcePath}"] [data-page-number="1"]`);
    const rectangle = element => element?.getBoundingClientRect().toJSON();
    const trace = root.__pdfWheelTrace = [];
    root.__pdfWheelTraceComplete = false;
    const sample = (stage, event) => {
      const bounds = slot.getBoundingClientRect();
      trace.push({ stage, time: performance.now(), scrollTop: root.scrollTop, scrollLeft: root.scrollLeft,
        slot: rectangle(slot), surface: rectangle(slot.querySelector('.pdf-page-surface')), canvas: rectangle(slot.querySelector('canvas')),
        pointer: event ? { x: event.clientX, y: event.clientY,
          fractionX: (event.clientX - bounds.left) / bounds.width, fractionY: (event.clientY - bounds.top) / bounds.height } : undefined,
        text: [...slot.querySelectorAll('.pdf-text-layer span')].slice(0, 3).map(span => ({ text: span.textContent, rectangle: rectangle(span) })),
      });
    };
    root.addEventListener('wheel', event => sample('wheel-capture', event), { capture: true, once: true });
    const resized = new ResizeObserver(() => sample('resize-observer'));
    for (const body of root.querySelectorAll('.virtual-source-body')) resized.observe(body);
    const changed = new MutationObserver(() => {
      sample('zoom-commit');
      let frame = 0;
      const measured = () => {
        sample(`frame-${++frame}`);
        if (frame < 8) requestAnimationFrame(measured);
        else { resized.disconnect(); changed.disconnect(); root.__pdfWheelTraceComplete = true; }
      };
      requestAnimationFrame(measured);
    });
    changed.observe(root, { attributes: true, attributeFilter: ['data-pdf-zoom'] });
  }, `${book}/Slides 2.pdf`);
  const recordVirtualGeometry = async stage => {
    const geometry = await virtualPage.evaluate(slot => {
      const root = slot.closest('.virtual-document-scroll');
      const rectangle = element => element?.getBoundingClientRect().toJSON();
      return { scrollTop: root.scrollTop, scrollLeft: root.scrollLeft, viewport: rectangle(root), slot: rectangle(slot),
        surface: rectangle(slot.querySelector('.pdf-page-surface')), canvas: rectangle(slot.querySelector('canvas')),
        text: [...slot.querySelectorAll('.pdf-text-layer span')].slice(0, 3).map(span => ({ text: span.textContent, rectangle: rectangle(span) })),
      };
    });
    virtualGeometry.push({ stage, ...geometry });
    await fs.writeFile(path.join(evidence, 'virtual-geometry.json'), JSON.stringify(virtualGeometry, null, 2));
  };
  await recordVirtualGeometry('before-wheel');
  const virtualWidth = (await virtualPage.boundingBox()).width;
  await wheel(virtualPage, -400, 80);
  await expect.poll(async () => (await virtualPage.boundingBox()).width).toBeGreaterThan(virtualWidth);
  await expect(virtualPage.locator('.pdf-page-surface.is-ready')).toBeInViewport();
  await expect.poll(() => continuous.evaluate(element => element.__pdfWheelTraceComplete)).toBe(true);
  const virtualWheelTrace = await continuous.evaluate(element => element.__pdfWheelTrace);
  await fs.writeFile(path.join(evidence, 'virtual-wheel-trace.json'), JSON.stringify(virtualWheelTrace, null, 2));
  const input = virtualWheelTrace.find(sample => sample.stage === 'wheel-capture');
  const settled = virtualWheelTrace.find(sample => sample.stage === 'frame-8');
  assert(Math.abs(settled.slot.y + settled.slot.height * input.pointer.fractionY - input.pointer.y) < 3, 'Virtual PDF must preserve the vertical wheel anchor after layout settles');
  assert(Math.abs(settled.slot.x + settled.slot.width * input.pointer.fractionX - input.pointer.x) < 3, 'Virtual PDF must preserve the horizontal wheel anchor after layout settles');
  await recordVirtualGeometry('after-wheel');
  assert(await continuous.evaluate(element => element.scrollWidth > element.clientWidth), 'Enlarged virtual pages must remain horizontally reachable');
  await recordVirtualGeometry('before-dark-command');
  await command('切换 PDF 深色背景适配滤镜');
  await expect(virtualPage.locator('.pdf-page-surface')).toHaveAttribute('data-pdf-dark', 'true');
  await expect(virtualPage.locator('canvas')).toHaveCSS('filter', /invert/);
  await expect(virtualPage.locator('.pdf-page-surface.is-ready')).toBeInViewport();
  await recordVirtualGeometry('after-dark-command');
  const beforeDark = virtualGeometry.find(sample => sample.stage === 'before-dark-command');
  const afterDark = virtualGeometry.find(sample => sample.stage === 'after-dark-command');
  assert(Math.abs(afterDark.scrollTop - beforeDark.scrollTop) < 1, 'The dark command must preserve vertical scroll');
  assert(Math.abs(afterDark.scrollLeft - beforeDark.scrollLeft) < 1, 'The dark command must preserve horizontal scroll');
  assert(Math.abs(afterDark.slot.x - beforeDark.slot.x) < 1 && Math.abs(afterDark.slot.y - beforeDark.slot.y) < 1,
    'The dark command must preserve the page position');
  const zoom = Number(await continuous.getAttribute('data-pdf-zoom'));
  assert(zoom > 1);
  // Pointer-anchored zoom can leave the left-aligned fixture text outside the horizontal viewport.
  await continuous.evaluate(element => { element.scrollLeft = 0; });
  await recordVirtualGeometry('after-horizontal-reset');
  const virtualTitle = virtualPage.locator('.pdf-text-layer').getByText('Page 1', { exact: true });
  await expect(virtualTitle).toBeInViewport();
  await page.mouse.move(1270, 10);
  await page.keyboard.press('Escape');
  await expect(page.locator('.cm-link-preview')).toHaveCount(0);
  await page.screenshot({ path: path.join(evidence, 'native-virtual-pdf-zoom-dark.png') });
  const titlePixels = PNG.sync.read(await page.screenshot({ path: path.join(evidence, 'native-virtual-pdf-title.png'), clip: await virtualTitle.boundingBox() }));
  let brightPixels = 0;
  for (let index = 0; index < titlePixels.data.length; index += 4) {
    if (titlePixels.data[index] > 140 && titlePixels.data[index + 1] > 140 && titlePixels.data[index + 2] > 140) brightPixels++;
  }
  assert(brightPixels > titlePixels.width * titlePixels.height * 0.01, 'The virtual PDF title must paint visible text pixels');

  assert((await fs.readFile(path.join(vault, 'figure.png'))).equals(imageBytes));
  assert((await fs.readFile(path.join(vault, 'Native standalone.pdf'))).equals(pdf));
  assert.equal(await fs.readFile(path.join(vault, latticeName), 'utf8'), latticeNote);
  for (const [source, bytes] of originals) assert((await fs.readFile(source)).equals(bytes), `Read-only fixture source changed at ${source}`);
  assert.deepEqual(rendererErrors, []);
  const version = await application.evaluate(({ app }) => app.getVersion());
  const result = { version, executablePath, numberedCaptions: true, referenceAliasRules: true,
    currentVaultSnippets: ['Theme', 'Hider'], initialFilterTheme: 'obsidian-light', cleanedCssPreservesPdfToolbar: true,
    sourceLatticeTable: { sourceNote, lines: [163, 169], blockFiles, nativeBlockEffect: true,
      images: 14, columns: latticeColumns, mergedHeaders: latticeHeaders, geometry: latticeGeometry },
    sourceVaultUnchanged: true,
    nativeAttributeMenu: true, customCssProperty: true, whiteMappedToPaper: { actual: white, paper: paperRgb }, redRetained: red,
    filenameHeuristicsRemoved: true, lightboxFilter: true, markdownWheelDefaultOff: true, markdownWheelEnabledFontSize: fontBefore + 1,
    standalonePdfZoom: true, standalonePdfFilter: true, virtualPdfZoom: zoom, virtualPdfFilter: true,
    virtualGeometry, virtualWheelTrace, virtualTitlePaint: { brightPixels, totalPixels: titlePixels.width * titlePixels.height },
    immutableImageAndPdfBytes: true, rendererErrors, diagnostics };
  await fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, evidence }, null, 2));
} catch (error) {
  const page = application && await application.firstWindow().catch(() => undefined);
  await page?.screenshot({ path: path.join(evidence, 'native-failure.png') }).catch(() => {});
  const images = await page?.locator('.main-pane img').evaluateAll(elements => elements.map(image => ({
    source: image.closest('[data-image-source]')?.getAttribute('data-image-source'), src: image.src,
    complete: image.complete, naturalWidth: image.naturalWidth, loading: image.loading,
    connected: image.isConnected, rectangle: image.getBoundingClientRect().toJSON(),
  }))).catch(() => []);
  const pdfViewport = await page?.locator('.virtual-document-scroll').evaluateAll(elements => elements.map(root => ({
    scrollTop: root.scrollTop, scrollLeft: root.scrollLeft, rectangle: root.getBoundingClientRect().toJSON(),
    pages: [...root.querySelectorAll('.pdf-page-slot')].filter(slot => slot.getAttribute('data-page-number') === '1').map(slot => ({
      source: slot.closest('[data-virtual-source]')?.getAttribute('data-virtual-source'),
      rectangle: slot.getBoundingClientRect().toJSON(),
      text: [...slot.querySelectorAll('.pdf-text-layer span')].slice(0, 3).map(span => ({
        text: span.textContent, rectangle: span.getBoundingClientRect().toJSON(),
      })),
    })),
  }))).catch(() => []);
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ error: String(error), rendererErrors, diagnostics, images, pdfViewport }, null, 2));
  throw error;
} finally {
  if (application) {
    await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await application.close().catch(() => {});
  }
  await fs.rm(profile, { recursive: true, force: true });
  await fs.rm(vault, { recursive: true, force: true });
}
