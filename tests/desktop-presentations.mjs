// Production-shell acceptance through the ordinary file picker and command palette.
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { _electron as electron, expect } from '@playwright/test';
import { makePdfFixture } from './browser/fixtures/pdf.ts';

const root = path.resolve(import.meta.dirname, '..');
const base = path.join(os.tmpdir(), '.agents');
await fs.mkdir(base, { recursive: true });
const fixture = await fs.mkdtemp(path.join(base, 'presentation-native-'));
const vault = path.join(fixture, 'vault'), profile = path.join(fixture, 'profile'), evidence = path.join(fixture, 'evidence');
await fs.mkdir(vault); await fs.mkdir(profile); await fs.mkdir(evidence);
const originals = new Map();
for (const [source, filename] of [['presentation.pptx', 'Slides.PPTX'], ['presentation-legacy.ppt', 'Legacy.ppt']]) {
  const bytes = await fs.readFile(path.join(root, 'tests/fixtures', source));
  originals.set(filename, bytes); await fs.writeFile(path.join(vault, filename), bytes);
}
const pdf = makePdfFixture({ pages: 4 });
originals.set('Paper.pdf', pdf); await fs.writeFile(path.join(vault, 'Paper.pdf'), pdf);
await fs.writeFile(path.join(vault, 'Note.md'), '# Native fixture\n\noriginal note');
await fs.writeFile(path.join(profile, 'desktop-config.json'), JSON.stringify({ vaultPath: vault }));
const executablePath = path.resolve(process.argv[2]);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let application;
const errors = [], diagnostics = [];
try {
  application = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`], cwd: fixture, env, timeout: 120000 });
  const page = await application.firstWindow();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()); });
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 120000 });
  await expect(page.locator('.workspace-launcher')).toBeVisible({ timeout: 60000 });
  const main = page.locator('.main-pane');
  const open = async name => {
    await page.keyboard.press('Control+o');
    await page.locator('.palette-input').fill(name.replace(/\.md$/i, ''));
    await page.locator('.palette-file-item').filter({ hasText: name.replace(/\.md$/i, '') }).first().click();
    await expect(page.locator('.palette-backdrop')).toHaveCount(0);
  };
  const command = async name => {
    await page.keyboard.press('Control+p');
    await page.locator('.palette-input').fill(name); await page.keyboard.press('Enter');
    await expect(page.locator('.palette-backdrop')).toHaveCount(0);
  };
  await command('打开设置');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('combobox', { name: '基础颜色', exact: true }).selectOption('shale-dark');
  await expect(page.locator('.settings-content [role="status"]')).toHaveText('已保存');
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await open('Slides.PPTX');
  await expect(main.locator('[data-pdf-page="1"].is-ready')).toBeVisible({ timeout: 30000 });
  await expect(main.locator('.pdf-page-slot')).toHaveCount(7);
  const toggle = page.getByRole('button', { name: '显示/隐藏 PPT 工具栏', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByRole('searchbox', { name: '搜索 PPT', exact: true }).fill('表格 · 图片');
  await expect(main.locator('.pdf-search [role=status]')).toHaveText('1/1');
  await page.getByRole('button', { name: '下一个 PPT 匹配', exact: true }).click();
  await expect(main.locator('[data-pdf-page="5"].is-ready')).toBeVisible();
  await command('切换 PDF / PPT 反色');
  await expect(main.locator('[data-pdf-page="5"]')).toHaveAttribute('data-pdf-dark', 'true');
  await expect(main.locator('[data-pdf-page="5"] canvas')).toHaveCSS('filter', /invert/);
  await command('打开大纲');
  await expect(page.getByRole('navigation', { name: 'PPT 幻灯片大纲' })).toContainText('表格 · 图片');
  await page.getByRole('button', { name: '缩略图', exact: true }).click();
  await expect(page.getByLabel('PPT 页面缩略图')).toBeVisible();
  await expect(page.locator('.pdf-thumbnails [data-pdf-page="5"]')).toHaveAttribute('data-pdf-dark', 'true');
  await expect(page.locator('.pdf-thumbnail.has-matches')).toHaveCount(1);
  const pixels = await main.locator('[data-pdf-page="5"] canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let index = 0; index < data.length; index += 64)
      if (Math.max(data[index], data[index + 1], data[index + 2]) - Math.min(data[index], data[index + 1], data[index + 2]) > 40) colored++;
    return colored;
  });
  assert(pixels > 300, 'Embedded pictures and table slide must paint colored pixels');
  await page.screenshot({ path: path.join(evidence, 'pptx-dark-thumbnails.png') });
  const region = main.getByRole('region', { name: 'PPT 页面', exact: true });
  const before = await main.locator('[data-page-number="5"]').boundingBox();
  const box = await region.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(150, box.height / 2));
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -180); await page.keyboard.up('Control');
  await expect.poll(async () => (await main.locator('[data-page-number="5"]').boundingBox()).width).toBeGreaterThan(before.width);
  await open('Legacy.ppt');
  await expect(main.locator('.pdf-page-surface.is-ready').first()).toBeVisible();
  await expect(main.locator('.pdf-page-slot')).toHaveCount(2);
  await expect(main.locator('.ppt-text-layer').first()).toContainText('.ppt 实验性解析');
  await page.screenshot({ path: path.join(evidence, 'legacy-ppt.png') });
  await open('Paper.pdf');
  await expect(main.locator('.pdf-page-surface.is-ready').first()).toBeVisible();
  await command('切换 PDF / PPT 反色');
  await expect(main.locator('[data-pdf-page="1"]')).toHaveAttribute('data-pdf-dark', 'true');
  await open('Slides.PPTX');
  await expect(main.locator('[data-pdf-page="1"].is-ready')).toBeVisible();
  await expect(main.locator('[data-pdf-page="1"]')).toHaveAttribute('data-pdf-dark', 'true');
  await open('Note.md');
  await expect(main.locator('.cm-content')).toContainText('original note');
  for (const [filename, bytes] of originals) assert((await fs.readFile(path.join(vault, filename))).equals(bytes));
  assert.deepEqual(errors, []); assert.deepEqual(diagnostics, []);
  const result = { version: await application.evaluate(({ app }) => app.getVersion()), executablePath,
    pptx: true, legacyPpt: true, thumbnailsAndOutline: true, search: true, embeddedPictures: true,
    sharedPdfDarkCommand: true, persistedPerPath: true, ctrlWheelZoom: true, sourcesUnchanged: true, errors, diagnostics };
  await fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, evidence }, null, 2));
} catch (error) {
  const page = application && await application.firstWindow().catch(() => undefined);
  await page?.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {});
  const alerts = await page?.locator('[role=alert]').allTextContents().catch(() => []);
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ error: String(error), errors, diagnostics, alerts }, null, 2));
  throw error;
} finally {
  if (application) {
    await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await application.close().catch(() => {});
  }
  await fs.rm(profile, { recursive: true, force: true }); await fs.rm(vault, { recursive: true, force: true });
}
