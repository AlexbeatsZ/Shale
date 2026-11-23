import { expect, test } from './test';
import { emptyHotkeys, type VaultHotkeys } from '../../packages/search-core/src/hotkeys';

test('both platform columns persist, inherit, disable and retain physical Control after a synchronized reload', async ({ page }) => {
  let config: VaultHotkeys = { ...emptyHotkeys(), vault: 'browser-fixture', revision: '0' };
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/vault-identity' || pathname === '/api/writing') return route.fallback();
    if (pathname === '/api/settings/hotkeys') {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        expect(body.revision).toBe(config.revision);
        const map = (config.platforms ??= {})[body.platform as 'mac' | 'windows'] ??= {};
        if (body.bindings === null) delete map[body.command]; else map[body.command] = body.bindings;
        config.revision = String(Number(config.revision) + 1);
      }
      return route.fulfill({ json: config });
    }
    return route.fulfill({ json: pathname === '/api/catalog' ? { entries: [] }
      : /^\/api\/settings\/?$/.test(pathname) ? { search: { chinese: {} } } : {} });
  });
  const mount = async () => {
    await page.goto('/__render-test');
    await page.waitForFunction(() => !!window.renderHarness);
    await page.evaluate(async () => {
      const load = (path: string) => import(path);
      const [React, DOM, { default: Settings }, search] = await Promise.all([
        load('/node_modules/.vite/deps/react.js'), load('/node_modules/.vite/deps/react-dom_client.js'),
        load('/src/components/HotkeySettings.tsx'), load('/src/lib/search.ts'),
      ]);
      await search.refreshSearch();
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div'); host.className = 'settings-content'; document.body.append(host);
      (DOM.createRoot ?? DOM.default.createRoot)(host).render((React.default ?? React).createElement(Settings));
    });
    await page.getByRole('searchbox', { name: '搜索快捷键' }).fill('editor:set-heading-7');
  };
  await mount();
  const row = page.getByRole('group', { name: '设为 7 级标题（正文内标题）' });
  const windows = row.locator('[data-hotkey-platform="windows"]'), mac = row.locator('[data-hotkey-platform="mac"]');
  const add = async (platform: 'mac' | 'windows', value: string) => {
    const cell = platform === 'mac' ? mac : windows;
    await cell.getByRole('button', { name: /^为 .* 添加快捷键$/ }).click();
    await cell.getByRole('textbox', { name: /^输入 .* 的组合键$/ }).fill(value);
    await cell.getByRole('button', { name: '添加', exact: true }).click();
    await expect(cell.locator('.hotkey-recording')).toHaveCount(0);
  };
  await add('windows', 'Ctrl+Alt+7');
  await expect(windows.locator('kbd')).toHaveText('Ctrl + Alt + 7');
  await expect(mac.locator('kbd')).toHaveText('⌘ + Option + 7');
  await mac.getByRole('button', { name: /^禁用 / }).click();
  await expect(mac.locator('kbd')).toHaveCount(0);
  await add('mac', 'Control+Alt+7');
  await expect(mac.locator('kbd')).toHaveText('Control + Option + 7');
  await expect(windows.locator('kbd')).toHaveText('Ctrl + Alt + 7');
  expect(config.platforms?.mac?.['editor:set-heading-7'][0].modifiers).toEqual(['PhysicalCtrl', 'Alt']);
  await mount();
  await expect(mac.locator('kbd')).toHaveText('Control + Option + 7');
  await windows.getByRole('button', { name: /^禁用 / }).click();
  await expect(windows.locator('kbd')).toHaveCount(0);
  await expect(mac.locator('kbd')).toHaveText('Control + Option + 7');
  await mac.getByRole('button', { name: /^恢复 / }).click();
  await expect(mac.locator('kbd')).toHaveCount(0);
  // Simulate the incoming synchronized file and refresh the same live snapshot.
  config = { ...config, revision: String(Number(config.revision) + 1), platforms: {
    windows: { 'editor:set-heading-7': [{ modifiers: ['Ctrl'], key: '7' }] },
    mac: { 'editor:set-heading-7': [{ modifiers: ['PhysicalCtrl', 'Alt'], key: '7' }] },
  } };
  await page.evaluate(async () => { const load = (path: string) => import(path); const module = await load('/src/lib/search.ts'); await module.refreshHotkeys(); });
  await expect(windows.locator('kbd')).toHaveText('Ctrl + 7');
  await expect(mac.locator('kbd')).toHaveText('Control + Option + 7');
  await page.screenshot({ path: test.info().outputPath('platform-hotkeys.png') });
});
