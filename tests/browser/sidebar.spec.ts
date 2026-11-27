import { expect, test } from './test';

test.beforeEach(async ({ page }) => {
  const contents: Record<string, string> = { 'a.md': '# Main\n\nmain', 'b.md': '# Side\n\nside' };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/vault-identity') return route.fallback();
    if (url.pathname === '/api/files/content') {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON(); contents[body.path] = body.content;
        return route.fulfill({ json: { ok: true, revision: 'saved' } });
      }
      const path = url.searchParams.get('path')!;
      return route.fulfill({ json: { path, content: contents[path] ?? '', revision: 'initial', vault: 'browser-fixture' } });
    }
    if (url.pathname === '/api/property-types') return route.fulfill({ json: { types: {} } });
    if (url.pathname === '/api/backlinks') return route.fulfill({ json: { backlinks: [] } });
    return route.fulfill({ json: { enabled: false, hits: [], matches: [] } });
  });
  await page.goto('/__render-test');
  await page.waitForFunction(() => Boolean(window.renderHarness));
  await page.evaluate(async () => {
    const module = (path: string) => import(path);
    const [React, ReactDOM, { default: RightSidebar }, { default: Editor }, { useStore }, { documents },
      { sharedApp }, { ItemView }, active] = await Promise.all([
      module('/node_modules/.vite/deps/react.js'), module('/node_modules/.vite/deps/react-dom_client.js'),
      module('/src/components/RightSidebar.tsx'), module('/src/components/Editor.tsx'), module('/src/lib/store.ts'),
      module('/src/lib/documents.ts'), module('/src/lib/plugins.ts'), module('/src/lib/shale/workspace.ts'), module('/src/lib/activeEditor.ts'),
    ]);
    const createRoot = ReactDOM.createRoot ?? ReactDOM.default.createRoot;
    document.getElementById('root')!.hidden = true;
    const tree = { name: 'Fixture', type: 'folder', path: '', children: ['a.md', 'b.md'].map(path => ({ name: path, path, type: 'file', extension: 'md', mtime: 1, ctime: 1, size: 16 })) };
    useStore.setState({ tree, filePaths: ['a.md', 'b.md'], rightTabs: [], rightActiveId: null, rightOpen: true });
    sharedApp.vault.sync(tree);
    await useStore.getState().openFile('a.md');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0'; document.body.append(host);
    const h = (React.default ?? React).createElement;
    function Shell() {
      const open = useStore((state: any) => state.rightOpen);
      return h('div', { className: 'app theme-dark' }, h('div', { className: 'workspace' }, h(Editor, { path: 'a.md' })), h(RightSidebar, { open, onTheme: () => {} }));
    }
    const counts = { open: 0, close: 0, state: 0 };
    sharedApp.workspace.viewRegistry.set('fixture-page', (leaf: any) => new class extends ItemView {
      constructor(leaf: any) { super(leaf); }
      getViewType() { return 'fixture-page'; }
      getDisplayText() { return 'Fixture page'; }
      getState() { return { value: 'kept' }; }
      async setState() { counts.state++; this.contentEl.textContent = 'guest state'; }
      async onOpen() { counts.open++; }
      async onClose() { counts.close++; }
    }(leaf));
    createRoot(host).render(h(Shell));
    (window as any).sidebarFixture = { store: useStore, documents, sharedApp, counts, active };
  });
  await expect(page.locator('.workspace .cm-content')).toContainText('main');
});

test('floating right dock adds tabs without resizing the document or changing the main file', async ({ page }) => {
  const before = (await page.locator('.workspace').boundingBox())!.width;
  await expect(page.locator('.ribbon-fixed button')).toHaveCount(7);
  await page.getByRole('button', { name: '新建右侧标签页' }).click();
  await expect(page.getByRole('tab', { name: 'Homepage' })).toHaveCount(1);
  await page.evaluate(() => (window as any).sidebarFixture.store.getState().toggleRight());
  expect((await page.locator('.workspace').boundingBox())!.width).toBe(before);
  expect(await page.evaluate(() => (window as any).sidebarFixture.store.getState().panes.main.path)).toBe('a.md');
});

test('retained note editor is excluded from commands when hidden and saves before replacement', async ({ page }) => {
  await page.evaluate(() => (window as any).sidebarFixture.store.getState().openRightTab('markdown', { file: 'b.md' }, 'side'));
  const content = page.locator('[data-sidebar-tab="side"] .cm-content');
  await expect(content).toContainText('side');
  await content.click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' changed');
  await page.evaluate(() => (window as any).sidebarFixture.store.getState().setRightPanel('outline'));
  expect(await page.evaluate(() => (window as any).sidebarFixture.active.getActiveEditor())).toBeNull();
  await page.evaluate(() => (window as any).sidebarFixture.store.getState().openRightTab('markdown', { file: 'a.md' }, 'side'));
  expect(await page.evaluate(() => (window as any).sidebarFixture.documents.get('b.md').snapshot.dirty)).toBe(false);
  expect(await page.evaluate(() => (window as any).sidebarFixture.store.getState().panes.main.path)).toBe('a.md');
});

test('custom view mounts once, keeps state when hidden, and closes exactly once', async ({ page }) => {
  await page.evaluate(() => (window as any).sidebarFixture.store.getState().openRightTab('fixture-page', { value: 'kept' }, 'guest'));
  await expect(page.locator('[data-sidebar-tab="guest"]')).toContainText('guest state');
  await page.evaluate(() => (window as any).sidebarFixture.store.getState().openRightTab('empty', {}, 'other'));
  await page.evaluate(() => (window as any).sidebarFixture.store.getState().selectRightTab('guest'));
  expect(await page.evaluate(() => (window as any).sidebarFixture.counts)).toEqual({ open: 1, close: 0, state: 1 });
  await page.evaluate(() => (window as any).sidebarFixture.store.getState().closeRightTab('guest'));
  await expect.poll(() => page.evaluate(() => (window as any).sidebarFixture.counts.close)).toBe(1);
});

test('editing during an in-flight close save keeps the note tab and newest source', async ({ page }) => {
  await page.evaluate(() => (window as any).sidebarFixture.store.getState().openRightTab('markdown', { file: 'b.md' }, 'side'));
  await expect(page.locator('[data-sidebar-tab="side"] .cm-content')).toContainText('side');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/files/content', async route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    await gate; await route.fulfill({ json: { ok: true, revision: 'saved' } });
  });
  const saving = page.waitForRequest(request => request.url().includes('/api/files/content') && request.method() === 'PUT');
  await page.evaluate(() => {
    const fixture = (window as any).sidebarFixture;
    fixture.documents.get('b.md').setRawText('first edit');
    fixture.pendingClose = fixture.store.getState().closeRightTab('side');
  });
  await saving;
  await page.evaluate(() => (window as any).sidebarFixture.documents.get('b.md').setRawText('newest edit'));
  release();
  await page.evaluate(() => (window as any).sidebarFixture.pendingClose);
  expect(await page.evaluate(() => (window as any).sidebarFixture.store.getState().rightTabs.some((tab: any) => tab.id === 'side'))).toBe(true);
  expect(await page.evaluate(() => (window as any).sidebarFixture.documents.get('b.md').snapshot.raw)).toBe('newest edit');
});

test('the side rail orders document views and exposes the shared file actions', async ({ page }) => {
  await page.evaluate(async () => {
    const { store } = (window as any).sidebarFixture, state = store.getState();
    await state.openSidebarTab('right', 'markdown', { file: 'a.md' }, 'one');
    await state.openSidebarTab('right', 'markdown', { file: 'b.md' }, 'two');
    await state.openSidebarTab('right', 'markdown', { file: 'a.md' }, 'three');
  });
  const rail = page.getByRole('tablist', { name: '右侧标签页' });
  const tab = (id: string) => rail.locator(`[data-tab-id="sidebar:${id}"]`);
  await tab('three').dragTo(tab('one'));
  await expect.poll(() => rail.getByRole('tab').evaluateAll(elements => elements.map(element => element.getAttribute('data-tab-id'))))
    .toEqual(['sidebar:three', 'sidebar:two', 'sidebar:one']);
  await expect(tab('three')).toHaveAttribute('aria-selected', 'true');
  await tab('two').click({ button: 'right' });
  // RightSidebar alone does not mount the menu outside the dock in this fixture.
  const labels = await page.evaluate(() => (window as any).sidebarFixture.store.getState().contextMenu.items.map((item: { label: string }) => item.label));
  expect(labels).toEqual(expect.arrayContaining(['重命名…', '移动文件至…', '添加书签', '复制标签页', '删除']));
  await tab('three').press('Delete');
  await expect(tab('two')).toHaveAttribute('aria-selected', 'true');
});
