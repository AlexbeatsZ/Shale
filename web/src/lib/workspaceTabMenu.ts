import { api } from './api';
import { useStore, viewKey, type ContextMenuItem } from './store';
import { isMacOS } from './platform';
import { workspaceContent } from './workspaceContent';
import { tabMenuItems } from './tabMenu';
import { tabStrip, tabStripFor } from './workspaceTabs';
import { extendFileMenu } from './shale/menus';
import { menuModifiers } from './configuredMenus/transform';
import { fileManagerMenuItems } from './revealInFileManager';
import { nativeBatchTagMenuItems } from './tags/actions';
import { editorFind, getActiveEditor, setActiveEditorMode } from './activeEditor';
import { triggerAddProperty } from './livePreview';
import { documents } from './documents';
import { printDocument } from './printDocument';
import { createVaultRenderContext } from './vaultRenderContext';

const separator: ContextMenuItem = { label: '', separator: true };

export function openWorkspaceTabMenu(event: { clientX: number; clientY: number; currentTarget: HTMLElement; nativeEvent: MouseEvent },
  key: string, layoutItems: ContextMenuItem[] = [], customItems: ContextMenuItem[] = [], isMobile = false) {
  const state = useStore.getState();
  const members = tabStrip(state, tabStripFor(state, key));
  const path = members.find(entry => entry.key === key)?.path;
  const kind = path ? workspaceContent(state.tree, path) : null;
  const realPath = path && kind !== 'home' && kind !== 'graph' && kind !== 'web' ? path : null;
  const items = [...customItems, ...layoutItems];
  const inTab = async (action: () => void) => {
    await useStore.getState().showTab(key);
    requestAnimationFrame(() => {
      const current = useStore.getState();
      if (viewKey(current, current.currentViewId()) === key) action();
    });
  };
  const handle = (action: () => void | Promise<void>) => async () => {
    try { await action(); }
    catch (error) { state.notify(String(error)); }
  };
  if (realPath) {
    const folder = kind === 'folder' || kind === 'virtual';
    const md = kind === 'text' && /\.(md|markdown)$/i.test(realPath);
    if (items.length) items.push(separator);
    if (md) items.push({ id: 'file:backlinks', label: '文档中的反向链接', icon: 'link',
      onClick: () => void inTab(() => state.setRightPanel('backlinks')) }, separator);
    items.push(
      { id: 'file:rename', label: '重命名…', icon: 'pencil', onClick: handle(async () => {
        const to = prompt('重命名 / 移动至（仓库相对路径）：', realPath);
        if (to && to !== realPath) await state.renamePath(realPath, to);
      }) },
      { id: 'file:move', label: '移动文件至…', icon: 'folder', onClick: () => state.setMovePath(realPath) },
      { id: 'file:duplicate', label: '创建副本', icon: 'file-plus', onClick: handle(async () => {
        const slash = realPath.lastIndexOf('/'), dot = realPath.lastIndexOf('.');
        const ext = !folder && dot > slash + 1 ? realPath.slice(dot) : '';
        const stem = ext ? realPath.slice(0, -ext.length) : realPath;
        const exists = (path: string) => state.filePaths.includes(path);
        let to = stem + ' copy' + ext;
        for (let number = 2; exists(to); number++) to = stem + ' copy ' + number + ext;
        await api.copy(realPath, to);
        await state.loadTree();
        state.notify('已创建副本');
      }) },
      { label: state.bookmarks.includes(realPath) ? '移除书签' : '添加书签', icon: 'bookmark', onClick: () => state.toggleBookmark(realPath) },
    );
    if (md) items.push(
      { id: 'file:add-property', label: '添加文件属性', icon: 'plus', onClick: () => void inTab(() => {
        setActiveEditorMode('live');
        window.setTimeout(() => {
          const view = getActiveEditor();
          if (view && useStore.getState().currentPath() === realPath) triggerAddProperty(view);
        }, 80);
      }) },
      { id: 'file:export-pdf', label: '导出为 PDF…', icon: 'file-pdf', onClick: handle(async () => {
        const session = documents.get(realPath) ?? await documents.open(realPath);
        const context = createVaultRenderContext(realPath, { openLink: () => {}, openMenu: () => {}, files: () => [], reportError: state.notify });
        await printDocument(session.snapshot, context);
      }) },
    );
    if (kind === 'text') items.push({ id: 'editor:find', label: '查找…', icon: 'search', onClick: () => void inTab(() => {
      if (!editorFind()) state.notify('打开笔记以在其中搜索');
    }) });
    items.push(separator, { id: 'file:history', label: '打开版本历史', icon: 'clock', onClick: () => state.setVersionHistory(realPath) });
    if (md) items.push({ id: 'file:linked-view', label: '打开关联视图', icon: 'arrow-up-right', submenu: [
      { label: '反向链接', icon: 'link', onClick: () => void inTab(() => state.setRightPanel('backlinks')) },
      { label: '出链', icon: 'arrow-up-right', onClick: () => void inTab(() => state.setRightPanel('outgoing')) },
      { id: 'file:outline', label: '大纲', icon: 'list', onClick: () => void inTab(() => state.setRightPanel('outline')) },
    ] });
    items.push({ id: 'file:reveal', label: '在文件列表中显示', icon: 'folder', onClick: () => {
      state.revealInTree(realPath);
      if (isMobile) state.setMobileDrawer('left');
    } });
  }
  if (items.length) items.push(separator);
  items.push(...tabMenuItems(key, members),
    { id: 'tab:close', label: '关闭标签页', icon: 'x', onClick: () => void state.closeTab(key) },
    { id: 'tab:close-others', label: '关闭其他标签页', onClick: handle(async () => {
      for (const member of members) if (member.key !== key) await state.closeTab(member.key);
    }) },
  );
  if (realPath) {
    items.push(separator, { id: 'file:delete', label: '删除', danger: true, icon: 'trash', onClick: handle(async () => {
      if (!confirm(`删除 "${realPath.split('/').at(-1)}"？`)) return;
      const result = await state.removePath(realPath);
      state.notify(result.deleted ? '已永久删除' : '已移至回收站');
    }) }, ...fileManagerMenuItems(realPath, kind === 'folder' || kind === 'virtual', state.notify));
    if (/\.(md|markdown)$/i.test(realPath)) items.push(...nativeBatchTagMenuItems({ kind: 'files', paths: [realPath] }));
  }
  const rect = event.currentTarget.getBoundingClientRect();
  state.openContextMenu({
    x: event.clientX || Math.round(rect.left), y: event.clientY || Math.round(rect.bottom),
    items: realPath ? extendFileMenu(items, [realPath], { kind: 'tab', source: 'workspace-tabs', paths: [realPath],
      fileTypes: [realPath.split('.').at(-1) ?? ''], activePath: state.currentPath() ?? undefined,
      modifiers: menuModifiers(event.nativeEvent) }) : items,
  });
}

export const isTabMultiselect = (event: { metaKey: boolean; ctrlKey: boolean }) => isMacOS() ? event.metaKey : event.ctrlKey;
