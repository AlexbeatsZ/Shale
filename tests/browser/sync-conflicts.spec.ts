import { test, expect } from './test';

// VS Code style sync review: decorated tree rows, a conflict group, inline diff above the open file, one-click sync.
test('marks conflicted files in the tree, shows the diff in the open file and resolves one file', async ({ page }) => {
  const files = [
    { path: '课程/量子化学/笔记.md', action: 'modify', hasBase: true, localChanged: true, remoteChanged: true, localSize: 120, remoteSize: 131,
      image: false, text: true, truncated: false, diff: [
        { type: 'same', lines: ['# 第三章 微扰理论', ''] },
        { type: 'del', lines: ['一阶修正只需要求 ⟨n|H′|n⟩。'] },
        { type: 'add', lines: ['一阶能量修正 E⁽¹⁾ = ⟨n|H′|n⟩，二阶要对 m ≠ n 求和。'] },
        { type: 'same', lines: ['', '## 例题'] }, { type: 'skip', lines: [], skipped: 24 }] },
    { path: 'snippets/theme.css', action: 'delete', hasBase: true, localChanged: true, remoteChanged: true, localSize: 64, remoteSize: null,
      image: false, text: true, truncated: false, diff: [{ type: 'del', lines: ['.markdown-preview { font-size: 17px; }', 'h1 { color: var(--color-accent); }'] }] },
    { path: '课程/量子化学/作业 5.md', action: 'add', hasBase: true, localChanged: true, remoteChanged: true, localSize: null, remoteSize: 40,
      image: false, text: true, truncated: false, diff: [{ type: 'add', lines: ['# 作业 5', '1. 求谐振子的一阶修正'] }] },
  ];
  let conflicts = [...files]; const resolved: unknown[] = [];
  const status = () => ({ enabled: true, endpoints: [], hasToken: true, activeEndpoint: null, phase: conflicts.length ? 'conflict' : 'idle',
    message: '', lastSuccess: '2026-11-21T10:00:00.000Z', conflictDirectory: 'fixture', conflictBranches: [], conflictCount: conflicts.length, recentResolutions: [] });
  await page.route('**/api/file-sync**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/conflict')) return route.fulfill({ json: { conflict: conflicts.length ? { id: 'fixture', files: conflicts } : null } });
    if (url.pathname.endsWith('/resolve')) {
      const body = route.request().postDataJSON(); resolved.push(body);
      conflicts = conflicts.filter(file => !(file.path in (body.files ?? {})));
      return route.fulfill({ json: status() });
    }
    if (url.pathname.endsWith('/run')) return route.fulfill({ json: status() });
    return route.fulfill({ json: { preferences: {}, status: status() } });
  });
  await page.goto('/__render-test');
  await page.waitForFunction(() => Boolean(window.renderHarness));
  await page.evaluate(async () => {
    const React = await import('/node_modules/.vite/deps/react.js');
    const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js');
    const createRoot = ReactDOM.createRoot ?? ReactDOM.default.createRoot;
    const { default: FileTree } = await import('/src/components/FileTree.tsx');
    const { default: SyncConflictPanel } = await import('/src/components/SyncConflictPanel.tsx');
    const { default: NativeSyncButton } = await import('/src/components/NativeSyncButton.tsx');
    const { useStore } = await import('/src/lib/store.ts');
    const { refreshSyncConflicts, useSyncConflict } = await import('/src/lib/syncConflicts.ts');
    const file = (path: string) => ({ name: path.split('/').pop(), path, type: 'file', ext: path.split('.').pop(), mtime: 1, ctime: 1, size: 1 });
    const folder = (path: string, children: any[]) => ({ name: path.split('/').pop(), path, type: 'folder', children });
    useStore.setState({ tree: { name: 'STEM', path: '', type: 'folder', children: [
      folder('课程', [folder('课程/量子化学', [file('课程/量子化学/笔记.md'), file('课程/量子化学/作业 4.md')]), file('课程/目录.md')]),
      folder('snippets', [file('snippets/theme.css')]), file('首页.md')] } as any,
      expanded: ['课程', '课程/量子化学', 'snippets'], panes: { ...useStore.getState().panes, main: { path: '课程/量子化学/笔记.md', tabId: null, history: [], histIndex: -1 } }, loadTree: async () => {},
      openFile: async (path: string) => useStore.setState(s => ({ panes: { ...s.panes, main: { ...s.panes.main, path, tabId: path } } })) } as any);
    await refreshSyncConflicts();
    const h = (React.default ?? React).createElement;
    function Main() {
      const path = useStore(state => state.panes.main.path) as string;
      const conflict = useSyncConflict(path);
      return h('div', { className: 'sync-conflict-view' }, conflict && h(SyncConflictPanel, { file: conflict }),
        h('div', { className: 'sync-conflict-content markdown-source-view', style: { padding: '16px 32px', whiteSpace: 'pre-wrap' } },
          conflict?.action === 'add' ? '' : '# 第三章 微扰理论\n\n一阶修正只需要求 ⟨n|H′|n⟩。\n\n## 例题\n…'));
    }
    document.getElementById('root')!.hidden = true;
    const host = document.createElement('div'); host.className = 'app';
    host.style.cssText = 'position:fixed;inset:0;display:grid;grid-template-columns:280px 1fr;grid-template-rows:1fr auto;background:var(--background-primary)';
    document.body.append(host);
    createRoot(host).render(h((React.default ?? React).Fragment, null,
      h('div', { className: 'nav-files-container', style: { borderRight: '1px solid var(--background-modifier-border)', overflow: 'auto', paddingTop: '6px', background: 'var(--background-secondary)' } }, h(FileTree)),
      h(Main),
      h('div', { className: 'status-bar', style: { gridColumn: '1 / 3', position: 'static' } }, h(NativeSyncButton))));
  });
  await expect(page.locator('.sync-changes .tree-row')).toHaveCount(3);
  await expect(page.locator('.tree-row.sync-conflict.is-delete[data-path="snippets/theme.css"] .sync-conflict-letter')).toHaveText('D');
  await expect(page.locator('.tree-row[data-path="课程/量子化学/作业 5.md"] .sync-conflict-letter')).toHaveText('A');
  await expect(page.locator('.sync-diff-line.is-del')).toContainText('一阶修正只需要求');
  await expect(page.getByRole('button', { name: '3 个冲突' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('sync-conflicts.png') });
  await page.locator('.sync-changes .tree-row', { hasText: 'theme.css' }).click();
  await expect(page.locator('.sync-conflict-badge')).toHaveText('将删除');
  await page.screenshot({ path: test.info().outputPath('sync-conflicts-delete.png') });
  await page.getByRole('button', { name: '保留本机', exact: true }).click();
  await expect(page.locator('.sync-changes .tree-row')).toHaveCount(2);
  expect(resolved).toEqual([{ choice: 'files', files: { 'snippets/theme.css': 'local' } }]);
});
