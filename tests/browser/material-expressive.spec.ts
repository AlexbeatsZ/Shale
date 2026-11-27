import { expect, test } from './test';

test.beforeEach(async ({ page }) => {
  let settings = { ui: { theme: 'shale-light', fontTextSize: 18, fileLineWidth: 700, ctrlWheelFontSize: false },
    vault: { path: '/fixture', newFileLocation: 'root', attachmentLocation: 'current', deleteMode: 'trash' }, search: { chinese: {} } };
  const notes: Record<string, string> = {
    '量子化学.md': '# 量子化学\n\n从波函数出发，理解分子的结构与性质。\n\n## 变分原理\n\n试探波函数的能量期望值不会低于基态能量。',
    '研究计划.md': '# 研究计划\n\n整理思路，记录实验，连接新的发现。',
  };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), name = url.pathname;
    if (name === '/api/vault-identity' || name === '/api/writing') return route.fallback();
    if (/^\/api\/settings\/?$/.test(name)) {
      if (route.request().method() === 'PUT') {
        const patch = route.request().postDataJSON(); settings = { ...settings, ...patch, ui: { ...settings.ui, ...patch.ui } };
      }
      return route.fulfill({ json: settings });
    }
    if (name === '/api/files/content') return route.fulfill({ json: { content: notes[url.searchParams.get('path')!] ?? '', revision: 'fixture', vault: 'browser-fixture' } });
    if (name === '/api/settings/css-snippets') return route.fulfill({ json: { snippets: [], vault: 'browser-fixture' } });
    if (name === '/api/file-sync') return route.fulfill({ json: { status: { enabled: false } } });
    if (name === '/api/catalog') return route.fulfill({ json: { entries: Object.keys(notes).map(path => ({ path, title: path.slice(0, -3), kind: 'file', aliases: [], tags: [], headings: [] })) } });
    return route.fulfill({ json: { enabled: false, types: {}, backlinks: [], hits: [], matches: [], status: {}, snippets: [], vault: 'browser-fixture' } });
  });
  await page.goto('/__render-test');
  await page.waitForFunction(() => !!window.renderHarness);
  await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const [React, DOM, { default: Tabs }, { default: Workspace }, { default: Sidebar }, { default: Dock },
      { default: Ribbon }, { default: Right }, { default: Settings }, { default: Palette }, { default: Loading },
      { useStore }, { useIsMobile }, { refreshSearch }] = await Promise.all([
      load('/node_modules/.vite/deps/react.js'), load('/node_modules/.vite/deps/react-dom_client.js'),
      load('/src/components/WorkspaceTabs.tsx'), load('/src/components/Workspace.tsx'), load('/src/components/Sidebar.tsx'),
      load('/src/components/SidebarDock.tsx'), load('/src/components/Ribbon.tsx'), load('/src/components/RightSidebar.tsx'),
      load('/src/components/Settings.tsx'), load('/src/components/CommandPalette.tsx'), load('/src/components/LoadingIndicator.tsx'),
      load('/src/lib/store.ts'), load('/src/lib/useIsMobile.ts'), load('/src/lib/search.ts'),
    ]);
    const paths = ['量子化学.md', '研究计划.md'];
    useStore.setState({ tree: { name: 'STEM', path: '', type: 'folder', children: paths.map(path => ({ path, name: path, type: 'file' })) },
      filePaths: paths, recent: paths, tabs: [], activePath: null, splitPath: null, rightTabs: [], leftOpen: false, rightOpen: false });
    await useStore.getState().openHomepage();
    await refreshSearch();
    // The native browser action stays visible; the guest itself is covered by packaged tests.
    window.shaleDesktop = { platform: 'darwin', webViewer: {} } as never;
    const h = (React.default ?? React).createElement;
    function Shell() {
      const mobile = useIsMobile();
      const left = useStore((s: any) => s.leftOpen), right = useStore((s: any) => s.rightOpen);
      return h((React.default ?? React).Fragment, null,
        h('div', { className: `app${mobile ? ' mobile' : ''}` }, h(Tabs),
          h(Dock, { side: 'left', open: left, rail: h(Ribbon) }, (open: boolean) => h(Sidebar, { open })),
          h(Workspace), h(Right, { open: right })), h(Settings), h(Palette));
    }
    document.getElementById('root')!.hidden = true;
    document.body.classList.add('theme-light');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0'; document.body.append(host);
    (DOM.createRoot ?? DOM.default.createRoot)(host).render(h(Shell));
    (window as any).materialFixture = { store: useStore, h, DOM, Loading };
  });
  await expect(page.locator('.workspace-launcher')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

test('real launcher adapts in both themes without clipping actions or recent files', async ({ page }, info) => {
  for (const dark of [false, true]) {
    await page.evaluate(dark => { document.body.classList.toggle('theme-dark', dark); document.body.classList.toggle('theme-light', !dark); }, dark);
    for (const width of [1440, 840, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const launcher = page.locator('.workspace-launcher');
      const bounds = (await launcher.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      for (const name of ['新建笔记', '打开文件', '打开网页浏览器', '打开关系图谱']) {
        const action = launcher.getByRole('button', { name: new RegExp(name) });
        await expect(action).toBeVisible();
        const box = (await action.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(48);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      if (width === 1440 || width === 390) await page.screenshot({ animations: 'disabled', path: info.outputPath(`home-${dark ? 'dark' : 'light'}-${width}.png`) });
    }
  }
  await page.locator('.launch-action.is-primary').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.launch-action.is-tonal')).toBeFocused();
  await page.locator('.launch-recent').getByRole('button', { name: /量子化学/ }).click();
  await expect(page.locator('.workspace .cm-content')).toContainText('波函数');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.evaluate(() => { const s = (window as any).materialFixture.store.getState(); s.toggleLeft(); s.setRightPanel('outline'); });
  await expect(page.getByRole('complementary', { name: '左侧栏' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '右侧栏' })).toBeVisible();
  for (const dark of [true, false]) {
    await page.evaluate(dark => { document.body.classList.toggle('theme-dark', dark); document.body.classList.toggle('theme-light', !dark); }, dark);
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`editor-${dark ? 'dark' : 'light'}-desktop.png`) });
  }
  await page.getByRole('complementary', { name: '左侧栏' }).getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /设置/ })).toBeVisible();
});

test('sidebar launcher shares actions and files open in place; settings fit compact windows', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.evaluate(() => (window as any).materialFixture.store.getState().toggleLeft());
  await page.getByRole('button', { name: '新建左侧标签页' }).click();
  const dock = page.getByRole('complementary', { name: '左侧栏' });
  await expect(dock.getByRole('button', { name: '打开网页浏览器', exact: true })).toBeVisible();
  await dock.getByRole('button', { name: /打开文件/ }).click();
  await expect(page.getByRole('dialog', { name: '快速打开' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).materialFixture.store.getState().setSettings(true));
  const settings = page.getByRole('dialog', { name: /设置/ });
  await settings.locator('.settings-nav').getByRole('button', { name: '外观', exact: true }).click();
  await expect(settings.getByRole('heading', { name: '外观', exact: true })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: info.outputPath('settings-light-desktop.png') });
  for (const width of [840, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const box = (await settings.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await settings.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(settings.getByRole('button', { name: '关闭设置' })).toBeVisible();
  }
  await page.screenshot({ animations: 'disabled', path: info.outputPath('settings-light-compact.png') });
  await settings.getByRole('button', { name: '关闭设置' }).click();
  await expect(settings).toHaveCount(0);
});

test('geometric loader morphs only while active and freezes for reduced motion', async ({ page }) => {
  await page.evaluate(() => {
    const { h, DOM, Loading } = (window as any).materialFixture;
    const host = document.createElement('div'); host.id = 'loading-fixture'; document.body.append(host);
    (DOM.createRoot ?? DOM.default.createRoot)(host).render(h(Loading, { label: '正在读取' }));
  });
  const loader = page.getByRole('progressbar', { name: '正在读取' });
  await expect(loader).toBeVisible();
  const shape = loader.locator('path');
  const before = await shape.getAttribute('d');
  await expect.poll(() => shape.getAttribute('d')).not.toBe(before);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => loader.locator('svg').evaluate(el => (el as SVGElement).style.rotate)).toBe('90deg');
  const fixed = await shape.getAttribute('d');
  // Sample many frames, without a timing-sensitive wall-clock sleep.
  await page.evaluate(async () => { for (let i = 0; i < 12; i++) await new Promise(requestAnimationFrame); });
  expect(await shape.getAttribute('d')).toBe(fixed);
});
