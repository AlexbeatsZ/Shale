import { test, expect } from './test';
import type { Page } from '@playwright/test';

async function groupStep(page: Page, key: string) {
  if (process.platform === 'darwin') await page.keyboard.press('Control+Shift+' + key);
  else await page.evaluate(key => (window as any).groupFixture.sharedApp.commands.executeCommandById('workspace:swap-group-' + (key === 'X' ? 'next' : 'previous')), key);
}

test.beforeEach(async ({ page }) => {
  let persisted: Record<string, unknown> = {};
  const contents: Record<string, string> = { 'a.md': '# A\n\nDraft A', 'b.md': '# B', 'c.md': '# C' };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/vault-identity' || url.pathname === '/api/writing') return route.fallback();
    if (url.pathname === '/api/settings/hotkeys') return route.fulfill({ json: { version: 1, vault: 'browser-fixture', bindings: { 'editor:focus-left': [{modifiers:['Alt','Shift'],key:'Z'}], 'editor:focus-right': [{modifiers:['Alt','Shift'],key:'X'}] }, platforms: { windows: { 'workspace:swap-group-previous': [], 'workspace:swap-group-next': [] }, mac: { 'workspace:swap-group-previous': [{modifiers:['PhysicalCtrl','Shift'],key:'Z'}], 'workspace:swap-group-next': [{modifiers:['PhysicalCtrl','Shift'],key:'X'}] } } } });
    if (url.pathname === '/api/uistate/') {
      if (route.request().method() === 'PUT') persisted = route.request().postDataJSON();
      return route.fulfill({ json: persisted });
    }
    if (url.pathname === '/api/files/content') {
      if (route.request().method() === 'PUT') { const body = route.request().postDataJSON(); contents[body.path] = body.content; return route.fulfill({ json: { revision: 'saved' } }); }
      return route.fulfill({ json: { content: contents[url.searchParams.get('path')!] ?? '', revision: 'base', vault: 'browser-fixture' } });
    }
    if (url.pathname === '/api/files/tree') return route.fulfill({ json: { name: 'Fixture', type: 'folder', path: '', children: Object.keys(contents).map(path => ({ name: path, path, type: 'file' })) } });
    return route.fulfill({ json: { types: {}, backlinks: [], enabled: false, hits: [], matches: [] } });
  });
  await page.goto('/__render-test');
  await page.waitForFunction(() => !!window.renderHarness);
  await page.evaluate(async () => {
    const module = (path: string) => import(path);
    const { refreshHotkeys } = await module('/src/lib/search.ts'); await refreshHotkeys();
    const [React, ReactDOM, { default: Tabs }, { default: Workspace }, { default: Menu }, { default: Rail }, { default: Panels }, { useStore, flushWorkspaceState }, { documents }, { sharedApp }, active] = await Promise.all([
      module('/node_modules/.vite/deps/react.js'), module('/node_modules/.vite/deps/react-dom_client.js'),
      module('/src/components/WorkspaceTabs.tsx'), module('/src/components/Workspace.tsx'), module('/src/components/ContextMenu.tsx'), module('/src/components/SidebarTabRail.tsx'), module('/src/components/SidebarTabPanels.tsx'),
      module('/src/lib/store.ts'), module('/src/lib/documents.ts'), module('/src/lib/plugins.ts'), module('/src/lib/activeEditor.ts'),
    ]);
    document.getElementById('root')!.hidden = true;
    await useStore.getState().loadUiState();
    for (const path of ['a.md', 'b.md', 'c.md']) await useStore.getState().openFile(path);
    const h = (React.default ?? React).createElement, host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0'; document.body.append(host);
    const root = (ReactDOM.createRoot ?? ReactDOM.default.createRoot)(host);
    root.render(h('div', { className: 'app theme-dark' }, h(Tabs), h(Workspace), h('div', { className: 'ribbon' }, h(Rail, { side: 'right' })),
      h('div', { className: 'group-side-body', style: { position: 'absolute', right: 40, top: 100, width: 260, height: 400, zIndex: 20 } }, h(Panels, { side: 'right', open: true })), h(Menu)));
    window.addEventListener('keydown', event => { if (sharedApp.commands.dispatchHotkey(event)) { event.preventDefault(); event.stopPropagation(); } }, true);
    (window as any).groupFixture = { store: useStore, flushWorkspaceState, documents, sharedApp, active };
  });
  await expect(page.locator('.tab-bar .tab')).toHaveCount(3);
});

test('Command/Ctrl multi-selection groups in click order; single menus recolor and remove; left border is visible', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const tab = (path: string) => page.locator(`.tab[data-tab-path="${path}"]`);
  await tab('c.md').click({ modifiers: [mod] }); await tab('a.md').click({ modifiers: [mod] });
  await expect(page.locator('.tab.is-multiselected')).toHaveCount(2);
  await expect(tab('c.md')).toHaveClass(/active/);
  await tab('a.md').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '设置分组（2 个标签页）', exact: true }).hover();
  await page.getByRole('menuitemcheckbox', { name: '蓝色', exact: true }).click();
  expect(await page.evaluate(() => (window as any).groupFixture.store.getState().tabs.filter((tab: any) => tab.groupColor).sort((a:any,b:any)=>a.groupOrder-b.groupOrder).map((tab:any)=>tab.path))).toEqual(['c.md','a.md']);
  expect(await tab('a.md').evaluate(el => [getComputedStyle(el).borderLeftWidth, getComputedStyle(el).borderLeftColor])).toEqual(['3px', 'rgb(84, 142, 220)']);
  await tab('b.md').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '设置分组', exact: true }).hover();
  await page.getByRole('menuitemcheckbox', { name: '红色', exact: true }).click();
  await expect(tab('a.md')).toHaveAttribute('data-tab-group', 'blue');
  await expect(tab('b.md')).toHaveAttribute('data-tab-group', 'red');
  await tab('b.md').click({ button: 'right' }); await page.getByRole('menuitem', { name: '设置分组', exact: true }).hover();
  await page.getByRole('menuitemcheckbox', { name: '移出分组', exact: true }).click();
  await expect(tab('b.md')).not.toHaveAttribute('data-tab-group');
});

test('single pane configured group commands immediately displays group members and cycles from the newly visible page', async ({ page }) => {
  await page.evaluate(async () => { const s = (window as any).groupFixture.store.getState(); s.setTabGroup(['c.md','a.md','b.md'], 'blue'); await s.showTab('a.md'); });
  const main = page.locator('.workspace .main-pane .cm-content');
  await expect(main).toContainText('Draft A');
  await main.click();
  for (const [key, content] of [['X','# B'],['X','# C'],['X','Draft A'],['Z','# C'],['Z','# B'],['Z','Draft A']]) {
    await groupStep(page, key);
    await expect(main).toContainText(content);
    await expect(page.locator('.workspace .split-pane')).toHaveCount(0);
  }
  expect(await page.evaluate(() => (window as any).groupFixture.store.getState().tabs.filter((t:any)=>t.groupColor).sort((a:any,b:any)=>a.groupOrder-b.groupOrder).map((t:any)=>t.path))).toEqual(['c.md','a.md','b.md']);
});

test('real configured group commands uses fixed join order, wraps and leaves the other split member untouched', async ({ page }) => {
  await page.evaluate(async () => { const s = (window as any).groupFixture.store.getState(); s.setTabGroup(['c.md','a.md','b.md'], 'blue'); await s.showTab('a.md'); await s.openToSide('home://side'); });
  const main = page.locator('.workspace .main-pane');
  await expect(main.locator('.cm-content')).toContainText('Draft A');
  await main.locator('.cm-content').click();
  await groupStep(page, 'X');
  await expect(main.locator('.cm-content')).toContainText('# B');
  await groupStep(page, 'X');
  await expect(main.locator('.cm-content')).toContainText('# C');
  await groupStep(page, 'Z');
  await expect(main.locator('.cm-content')).toContainText('# B');
  expect(await page.evaluate(() => (window as any).groupFixture.store.getState().splitPath)).toBe('home://side');
});

test('focused split pane brings its neighbor forward even when that neighbor is already in the main pane', async ({ page }) => {
  await page.evaluate(async () => { const s = (window as any).groupFixture.store.getState(); s.setTabGroup(['a.md','b.md','c.md'], 'red'); await s.showTab('a.md'); await s.openToSide('b.md'); });
  const main = page.locator('.workspace .main-pane .cm-content'), side = page.locator('.workspace .split-pane .cm-content');
  await expect(side).toContainText('# B');
  await side.click();
  for (const [key, text] of [['Z','Draft A'],['Z','# C'],['X','Draft A']]) {
    await groupStep(page, key);
    await expect(side).toContainText(text);
    await expect(main).toContainText('# B');
  }
});

test('duplicate note menu creates a neighboring view, shares edits in split, restores identities and closes one copy', async ({ page }) => {
  const original = page.locator('.tab[data-tab-id="a.md"]');
  await original.click({ button: 'right' }); await page.getByRole('menuitem', { name: '复制标签页', exact: true }).click();
  await expect(page.locator('.tab[data-tab-path="a.md"]')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => (window as any).groupFixture.store.getState().activeTabId)).toMatch(/^tab:/);
  const copy = await page.evaluate(() => (window as any).groupFixture.store.getState().activeTabId);
  expect(copy).toMatch(/^tab:/);
  expect(await page.locator('.tab').evaluateAll(tabs=>tabs.map(tab=>tab.getAttribute('data-tab-id')))).toEqual(['a.md', copy, 'b.md', 'c.md']);
  await page.evaluate(async copy => { const s = (window as any).groupFixture.store.getState(); await s.showTab('a.md'); await s.openToSide(copy); }, copy);
  const main = page.locator('.workspace .main-pane .cm-content'), side = page.locator('.workspace .split-pane .cm-content');
  await expect(side).toContainText('Draft A');
  await main.click(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End'); await page.keyboard.type(' shared');
  await expect(side).toContainText('shared');
  await page.evaluate(async () => { const f = (window as any).groupFixture; f.store.getState().setTabGroup([f.store.getState().splitTabId], 'purple'); await f.flushWorkspaceState(); await f.store.getState().loadUiState(); });
  await expect(page.locator(`.tab[data-tab-id="${copy}"]`)).toHaveAttribute('data-tab-group','purple');
  expect(await page.evaluate(() => (window as any).groupFixture.store.getState().splitTabId)).toBe(copy);
  await page.locator(`.tab[data-tab-id="${copy}"] .close`).click();
  await expect(page.locator('.tab[data-tab-path="a.md"]')).toHaveCount(1);
  await expect(main).toContainText('shared');
});

test('side rail supports grouping and duplication with unique identities and cycles only within its own strip', async ({ page }) => {
  await page.evaluate(async () => { const s=(window as any).groupFixture.store.getState(); await s.openSidebarTab('right','markdown',{file:'a.md'},'side-a'); await s.openSidebarTab('right','markdown',{file:'b.md'},'side-b'); });
  const side = page.locator('[data-tab-id="sidebar:side-a"]');
  await side.click({ button: 'right' }); await page.getByRole('menuitem', { name: '设置分组', exact: true }).hover(); await page.getByRole('menuitemcheckbox',{name:'绿色',exact:true}).click();
  await side.click({ button: 'right' }); await page.getByRole('menuitem',{name:'复制标签页',exact:true}).click();
  await expect(page.locator('.ribbon-tabs [role=tab]')).toHaveCount(3);
  expect(await page.evaluate(()=> (window as any).groupFixture.store.getState().rightTabs.map((tab:any)=>tab.state.file))).toEqual(['a.md','a.md','b.md']);
  await page.evaluate(() => { const s=(window as any).groupFixture.store.getState(); s.setTabGroup(['sidebar:side-b'],'green'); });
  await side.click();
  const content = page.locator('.group-side-body .sidebar-note:not([hidden]) .cm-content');
  await expect(content).toContainText('Draft A');
  await content.click();
  await groupStep(page, 'X');
  await expect(content).toContainText('# B');
  await expect(page.locator('[data-tab-id="sidebar:side-b"]')).toHaveClass(/active/);
  await groupStep(page, 'X');
  await expect(content).toContainText('Draft A');
  await groupStep(page, 'Z');
  await expect(content).toContainText('# B');
  await expect(page.locator('.workspace .main-pane .cm-content')).toContainText('# C');
});


test('Mac uses physical Control, Windows has no group binding, and Option focus bindings remain', async ({ page }) => {
  const keys = await page.evaluate(() => {
    const c=(window as any).groupFixture.sharedApp.commands;
    return { mac: c.getHotkeys('workspace:swap-group-next',true), windows: c.getHotkeys('workspace:swap-group-next',false), defaults: c.getDefaultHotkeys('workspace:swap-group-next'), focus: c.getHotkeys('editor:focus-right',true) };
  });
  expect(keys).toEqual({mac:[{modifiers:['PhysicalCtrl','Shift'],key:'X'}],windows:[],defaults:[],focus:[{modifiers:['Alt','Shift'],key:'X'}]});
  if (process.platform === 'darwin') {
    await page.evaluate(() => (window as any).groupFixture.store.getState().setTabGroup(['a.md','b.md','c.md'],'blue'));
    await page.locator('.workspace .main-pane .cm-content').click();
    await page.keyboard.press('Meta+Shift+X');
    await expect(page.locator('.workspace .main-pane .cm-content')).toContainText('# C');
    await groupStep(page,'X');
    await expect(page.locator('.workspace .main-pane .cm-content')).toContainText('Draft A');
  }
});

test('physical Control group shortcut works in actual Vim Normal Visual and Insert modes', async ({ page }) => {
  test.skip(process.platform !== 'darwin', 'Windows intentionally has no group shortcut');
  await page.evaluate(async () => {
    const s=(window as any).groupFixture.store.getState(); s.setTabGroup(['a.md','b.md','c.md'],'blue'); await s.showTab('a.md');
    window.dispatchEvent(new CustomEvent('settings-changed',{detail:{ui:{vimEnabled:true,vimInputMethod:false}}}));
  });
  const editor=page.locator('.workspace .main-pane .cm-editor');
  await expect(editor).toHaveAttribute('data-vim-mode','normal');
  await editor.locator('.cm-content').click();
  await groupStep(page,'X'); await expect(editor.locator('.cm-content')).toContainText('# B');
  await editor.locator('.cm-content').click(); await page.keyboard.press('v');
  await expect(editor).toHaveAttribute('data-vim-mode','visual');
  await groupStep(page,'X'); await expect(editor.locator('.cm-content')).toContainText('# C');
  await editor.locator('.cm-content').click(); await page.keyboard.press('Escape'); await page.keyboard.press('i');
  await expect(editor).toHaveAttribute('data-vim-mode','insert');
  await groupStep(page,'X'); await expect(editor.locator('.cm-content')).toContainText('Draft A');
  await groupStep(page,'Z'); await expect(editor.locator('.cm-content')).toContainText('# C');
});
