// Real native-shell acceptance, with an isolated profile and disposable Vault.
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { _electron as electron, expect } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const base = path.join(os.tmpdir(), '.agents');
await fs.mkdir(base, { recursive: true });
const fixture = await fs.mkdtemp(path.join(base, 'javascript-native-'));
const vault = path.join(fixture, 'vault'), profile = path.join(fixture, 'profile');
const evidence = path.join(fixture, 'evidence');
await fs.mkdir(vault); await fs.mkdir(profile); await fs.mkdir(evidence);
const pasted = await fs.readFile(path.join(root, 'tests/fixtures/js-widget-undeclared-root.md'), 'utf8');
const examples = await fs.readFile(path.join(root, 'docs/examples/javascript-blocks.md'), 'utf8');
const official = examples.split('## Effective potential with an OpenAI slider')[1].match(/```js-widget\n([\s\S]*?)\n```/)[1];
const wrap = source => '# Widget fixture\n\n' + source + '\n\nend';
const fence = source => wrap('```js-widget\n' + source + '\n```');
await fs.writeFile(path.join(vault, 'Broken.md'), wrap(pasted));
await fs.writeFile(path.join(vault, 'Canvas.md'), wrap(pasted.replace('const host = container;', "const host = container;\nconst root = document.createElement('div');")));
await fs.writeFile(path.join(vault, 'Official.md'), fence(official));
await fs.writeFile(path.join(vault, 'Isolation.md'), fence(`
const result = { app: typeof app, process: typeof process, require: typeof require,
  desktop: typeof webobsidianDesktop, nativeRequire: typeof webobsidianNativeRequire };
try { parent.document.getElementById('root').innerHTML = 'destroyed'; result.parent = 'escaped'; }
catch (error) { result.parent = error.name; }
try { await fetch('/api/vault-identity'); result.network = 'escaped'; }
catch { result.network = 'blocked'; }
container.textContent = JSON.stringify(result);
`));
// Exercise isolation even when the main application explicitly trusts plugins.
await fs.writeFile(path.join(profile, 'desktop-config.json'), JSON.stringify({ vaultPath: vault, trustedPlugins: true }));
const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const args = process.argv[2] ? [] : [path.join(root, 'desktop/dist/main.js')];
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ executablePath, args: [...args, `--user-data-dir=${profile}`], cwd: fixture, env, timeout: 120000 });
  const page = await app.firstWindow();
  const diagnostics = [];
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text()); });
  page.on('pageerror', error => diagnostics.push(String(error)));
  page.on('requestfailed', request => diagnostics.push(request.url() + ' ' + request.failure()?.errorText));
  app.on('close', () => { void fs.writeFile(path.join(evidence, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2)); });
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 120000 });
  await expect(page.locator('.workspace-launcher')).toBeVisible({ timeout: 60000 });
  assert.equal(await page.evaluate(() => typeof window.webobsidianNativeRequire), 'function');
  await page.evaluate(() => { window.widgetAcceptanceRoot = document.getElementById('root'); });
  const open = async name => {
    await page.keyboard.press('Control+o');
    await page.locator('.palette-input').fill(name);
    await page.keyboard.press('Enter');
  };
  const frame = () => page.frameLocator('.main-pane .interactive-js-frame');
  await open('Broken');
  await expect(page.locator('.main-pane .interactive-js-error')).toContainText('root is not defined', { timeout: 35000 });
  assert.equal(await page.evaluate(() => document.getElementById('root') === window.widgetAcceptanceRoot), true);
  await open('Canvas');
  await expect(frame().locator('canvas')).toBeVisible();
  await frame().locator('.l-slider').fill('4');
  await expect(frame().locator('.info')).toContainText('l = 4');
  await open('Isolation');
  await expect(frame().locator('#widget-container')).toContainText('blocked');
  const isolated = JSON.parse(await frame().locator('#widget-container').textContent());
  assert.deepEqual(isolated, { app: 'undefined', process: 'undefined', require: 'undefined', desktop: 'undefined', nativeRequire: 'undefined', parent: 'SecurityError', network: 'blocked' });
  const runtimeResponse = await page.request.get(new URL('/javascript-widget-runtime.js', page.url()).href);
  assert.equal(runtimeResponse.headers()['cross-origin-resource-policy'], 'cross-origin');
  const denied = await page.request.get(new URL('/api/vault-identity', page.url()).href, { headers: { Origin: 'null' } });
  assert.equal(denied.status(), 403);
  await open('Official');
  const slider = frame().getByRole('slider');
  await expect(slider).toBeVisible();
  await slider.focus(); await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '2');
  await frame().getByRole('button', { name: '重置', exact: true }).click();
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(frame().locator('canvas')).toBeVisible();
  await page.screenshot({ path: path.join(evidence, 'native-openai-potential.png') });
  const version = await app.evaluate(({ app }) => app.getVersion());
  const result = { version, isolated, originalRejected: true, correctedCanvas: true, openaiControls: true, apiDenied: denied.status(), runtimeCORP: runtimeResponse.headers()['cross-origin-resource-policy'] };
  await fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, evidence }, null, 2));
} finally {
  await app?.close();
  await fs.rm(profile, { recursive: true, force: true });
  await fs.rm(vault, { recursive: true, force: true });
}
