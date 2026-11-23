import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useStore, GRAPH_PATH, isHomepagePath, isWebViewerPath, type ContextMenuItem, type Tab } from '../lib/store';
import { api } from '../lib/api';
import { documents } from '../lib/documents';
import { printDocument } from '../lib/printDocument';
import { createVaultRenderContext } from '../lib/vaultRenderContext';
import { activateNavigation, editorFind, getActiveEditor, getActiveNavigationId, setActiveEditorMode, subscribeActiveNavigation } from '../lib/activeEditor';
import { TAB_DRAG_TYPE, TAB_INSERT_DWELL_MS, TAB_TOUCH_LIFT_MS, tabDrag } from '../lib/tabDrag';
import { triggerAddProperty } from '../lib/livePreview';
import { extendFileMenu } from '../lib/obsidian/menus';
import { nativeBatchTagMenuItems } from '../lib/tags/actions';
import { menuModifiers } from '../lib/configuredMenus/transform';
import { useIsMobile } from '../lib/useIsMobile';
import { useMainPdfSession } from '../lib/pdf/react';
import Icon from './Icon';
import { fileManagerMenuItems } from '../lib/revealInFileManager';
import { findNode } from '../lib/tree';

type Pane = 'main' | 'split';
/** One movable item of the tab bar: a tab, or a split group as a whole. */
const GROUP_KEY = '\u0000split-group', END_KEY = '\u0000end';
interface DragSource { key: string; paths: string[]; path: string | null; title: string; width: number; group: boolean }
/** swap = quick drop (purple outline), insert = after hovering (gap with a ghost), pane = into a split pane. */
interface DropHint { key: string; mode: 'swap' | 'insert' | 'pane'; view?: Pane }
type Hit = { key: string; view?: Pane } | 'gap' | null;

export default function WorkspaceTabs() {
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const openFile = (path: string) => useStore.getState().showTab(path);
  const closeTab = useStore((s) => s.closeTab);
  const dirty = useStore((s) => s.dirty);
  const setViewMode = useStore((s) => s.setViewMode);
  const bookmarks = useStore((s) => s.bookmarks);
  const toggleBookmark = useStore((s) => s.toggleBookmark);
  const openToSide = useStore((s) => s.openToSide);
  const notify = useStore((s) => s.notify);
  const toggleLeft = useStore((s) => s.toggleLeft);
  const toggleRight = useStore((s) => s.toggleRight);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  const mobileDrawer = useStore((s) => s.mobileDrawer);
  const setMobileDrawer = useStore((s) => s.setMobileDrawer);
  const openHomepage = () => useStore.getState().openHomepage('main');
  const openContextMenu = useStore((s) => s.openContextMenu);
  const setMovePath = useStore((s) => s.setMovePath);
  const setRightPanel = useStore((s) => s.setRightPanel);
  const setVersionHistory = useStore((s) => s.setVersionHistory);
  const revealInTree = useStore((s) => s.revealInTree);
  const loadTree = useStore((s) => s.loadTree);
  const pdfToolbarOpen = useStore((s) => s.pdfToolbarOpen);
  const togglePdfToolbar = useStore((s) => s.togglePdfToolbar);
  const mainPdf = useMainPdfSession(activePath);
  const splitPath = useStore((s) => s.splitPath);
  const splitDirection = useStore((s) => s.splitDirection);
  const closeSplit = useStore((s) => s.closeSplit);
  const closePane = useStore((s) => s.closePane);
  const splitWithHomepage = useStore((s) => s.splitWithHomepage);
  const parkedSplit = useStore((s) => s.parkedSplit);
  const focusedView = useSyncExternalStore(subscribeActiveNavigation, getActiveNavigationId);
  const isMobile = useIsMobile();
  const scroll = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragSource | null>(null);
  const [hint, setHintState] = useState<DropHint | null>(null);
  const source = useRef<DragSource | null>(null);
  const hintRef = useRef<DropHint | null>(null);
  const dwell = useRef<number>();
  const unitPaths = useRef(new Map<string, string[]>());
  const touch = useRef<{ armed: boolean; dragging: boolean; cleanup: () => void } | null>(null);
  const allowTouchMenu = useRef(false);
  const suppressClick = useRef(false);

  // Show the tab (restoring or focusing its split pane) before running a view command on it.
  const inTab = async (path: string, action: () => void) => {
    await selectTab(path);
    // Let the requested editor/graph mount before invoking its view command.
    window.requestAnimationFrame(() => {
      const s = useStore.getState();
      if (s.activePath === path || s.splitPath === path) action();
    });
  };

  useEffect(() => {
    scroll.current?.querySelector('.tab-split-group, .tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activePath, tabs.length, splitPath]);

  // A split group is one browser-style tab: selecting a member shows the whole
  // group focused on it; any other tab is shown alone and the group is set aside.
  const focusedPane: Pane = splitPath && focusedView === 'split' ? 'split' : 'main';
  const focusPane = (viewId: Pane) => {
    activateNavigation(viewId);
    getActiveEditor()?.focus();
  };
  const selectTab = async (path: string) => {
    await useStore.getState().showTab(path);
    const s = useStore.getState();
    if (s.splitPath && (path === s.activePath || path === s.splitPath)) focusPane(path === s.activePath ? 'main' : 'split');
  };

  // Obsidian's "Add file property": focus a new property-key field in the
  // Properties widget with the key suggester open (NOT a text prompt). The
  // widget only renders in Live Preview, so switch out of source/reading first.
  const addFileProperty = async (path: string) => {
    await selectTab(path);
    if (getActiveNavigationId() === 'split') setActiveEditorMode('live');
    else if (useStore.getState().viewMode !== 'live') setViewMode('live');
    // Let the editor swap modes / mount the Properties widget, then start the add.
    window.setTimeout(() => {
      const v = getActiveEditor();
      if (v) triggerAddProperty(v);
      else notify("打开笔记以添加属性");
    }, 80);
  };

  const exportToPdf = async (path: string) => {
    if (!documents.get(path)) await openFile(path);
    const snapshot = documents.get(path)?.snapshot; if (!snapshot) return;
    const context = createVaultRenderContext(path, { openLink: () => {}, openMenu: () => {}, files: () => [], reportError: notify });
    void printDocument(snapshot, context).catch(error => notify(error.message));
  };

  // File actions now live on the tab context menu instead of a second header.
  const openTabMenu = (e: React.MouseEvent, path: string, view?: Pane) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isMd = /\.(md|markdown)$/i.test(path);
    const canSplit = /\.(md|markdown|txt|json|csv|canvas|css|js|ya?ml)$/i.test(path);
    const down = splitDirection === 'down';
    // Splitting keeps this tab and opens a Homepage on the new side; inside a
    // split group the same place offers the layout instead.
    const splitItems: ContextMenuItem[] = view
      ? [
          { id: 'split:direction', label: down ? "改为左右分屏" : "改为上下分屏", icon: down ? 'columns' : 'rows',
            onClick: () => void openToSide(useStore.getState().splitPath ?? path, down ? 'right' : 'down') },
          { id: 'split:exit', label: "取消分屏", icon: 'layout-dashboard', onClick: () => void closeSplit() },
        ]
      : [
          { id: 'file:split-right', label: "向右分屏", icon: 'columns', onClick: () => void splitWithHomepage(path, 'right') },
          { id: 'file:split-down', label: "向下分屏", icon: 'rows', onClick: () => void splitWithHomepage(path, 'down') },
        ];
    const baseName = path.split('/').pop() ?? path;
    const closeOthers = () => tabs.filter((t) => t.path !== path).forEach((t) => closeTab(t.path));
    const tabItems: ContextMenuItem[] = [
      { id: 'tab:close', label: "关闭标签页", icon: 'x', onClick: () => void (view ? closePane(view) : closeTab(path)) },
      { id: 'tab:close-others', label: "关闭其他标签页", onClick: closeOthers },
    ];
    let items: ContextMenuItem[];
    if (isHomepagePath(path) || isWebViewerPath(path)) {
      items = [...splitItems, { label: '', separator: true }, ...tabItems];
    } else if (path === GRAPH_PATH) {
      items = [
        // GraphView owns the Pixi renderer — it listens for this event and
        // extracts the stage to a PNG (a plain canvas read would be blank).
        { id: 'tab:copy-screenshot', label: "复制截图", icon: 'camera', onClick: () => void inTab(path, () => window.dispatchEvent(new CustomEvent('wo-graph-screenshot'))) },
        { label: '', separator: true },
        ...splitItems,
        { label: '', separator: true },
        ...tabItems,
      ];
    } else {
      const sep: ContextMenuItem = { label: '', separator: true };
      const renameItem: ContextMenuItem = {
        id: 'file:rename', label: "重命名…",
        icon: 'pencil',
        onClick: async () => {
          const to = prompt("重命名 / 移动至（仓库相对路径）：", path);
          if (to && to !== path) {
            await useStore.getState().renamePath(path, to);
          }
        },
      };
      const moveItem: ContextMenuItem = {
        id: 'file:move', label: "移动文件至…",
        icon: 'folder',
        onClick: () => setMovePath(path),
      };
      const copyItem: ContextMenuItem = {
        id: 'file:duplicate', label: "创建副本",
        icon: 'file-plus',
        onClick: async () => {
          const r = await api.read(path).catch(() => null);
          if (!r) return;
          const body = typeof r === 'string' ? r : r.content;
          const dot = path.lastIndexOf('.');
          const copyPath = dot > 0 ? `${path.slice(0, dot)} copy${path.slice(dot)}` : `${path} copy`;
          await api.write(copyPath, body);
          await loadTree();
          notify("已创建副本");
        },
      };
      items = [
        ...(isMd ? [{ id: 'file:backlinks', label: "文档中的反向链接", icon: 'link', onClick: () => void inTab(path, () => setRightPanel('backlinks')) }, sep] : []),
        ...splitItems,
        sep,
        renameItem,
        moveItem,
        copyItem,
        { label: bookmarks.includes(path) ? "移除书签" : "添加书签", icon: 'bookmark', onClick: () => toggleBookmark(path) },
        ...(isMd ? [{ id: 'file:add-property', label: "添加文件属性", icon: 'plus', onClick: () => void addFileProperty(path) }] : []),
        ...(isMd ? [{ id: 'file:export-pdf', label: "导出为 PDF…", icon: 'file-pdf', onClick: () => void exportToPdf(path) }] : []),
        ...(canSplit
          ? [
              sep,
              {
                id: 'editor:find', label: "查找…",
                icon: 'search',
                onClick: () => void inTab(path, () => {
                  if (!editorFind()) notify("打开笔记以在其中搜索");
                }),
              },
            ]
          : []),
        sep,
        { id: 'file:history', label: "打开版本历史", icon: 'clock', onClick: () => setVersionHistory(path) },
        ...(isMd
          ? [
              {
                id: 'file:linked-view', label: "打开关联视图",
                icon: 'arrow-up-right',
                submenu: [
                  { label: "反向链接", icon: 'link', onClick: () => void inTab(path, () => setRightPanel('backlinks')) },
                  { label: "出链", icon: 'arrow-up-right', onClick: () => void inTab(path, () => setRightPanel('outgoing')) },
                  { id: 'file:outline', label: "大纲", icon: 'list', onClick: () => void inTab(path, () => setRightPanel('outline')) },
                ],
              },
            ]
          : []),
        sep,
        {
          id: 'file:reveal', label: "在文件列表中显示",
          icon: 'folder',
          onClick: () => {
            revealInTree(path);
            if (isMobile) setMobileDrawer('left');
          },
        },
        sep,
        ...tabItems,
        sep,
        {
          id: 'file:delete', label: "删除",
          danger: true,
          icon: 'trash',
          onClick: async () => {
            if (confirm(`删除 "${baseName}"？`)) {
              const r = await useStore.getState().removePath(path);
              notify(r.deleted ? "已永久删除" : "已移至回收站");
            }
          },
        },
      ];
    }
    items.push(...fileManagerMenuItems(path, findNode(useStore.getState().tree, path)?.type === 'folder', notify));
    if (isMd) items.push(...nativeBatchTagMenuItems({ kind: 'files', paths: [path] }));
    openContextMenu({ x: e.clientX || Math.round(rect.left), y: e.clientY || Math.round(rect.bottom),
      items: extendFileMenu(items, [path], { kind: 'tab', source: 'workspace-tabs', paths: [path],
        fileTypes: [path.split('.').at(-1) ?? ''], activePath: useStore.getState().activePath ?? undefined,
        modifiers: menuModifiers(e.nativeEvent) }) });
  };

  // ---------- Dragging tabs: one model for mouse (HTML5 drag) and touch (hold, then drag) ----------
  // Over another tab a quick drop swaps the two; resting there opens a gap before it
  // (with a ghost of the dragged tab) and the drop inserts there. A split group moves
  // as one unit; dropping a tab on a visible group member puts it into that pane.
  const setHint = (next: DropHint | null) => {
    const prev = hintRef.current;
    if (prev?.key === next?.key && prev?.mode === next?.mode && prev?.view === next?.view) return;
    hintRef.current = next; setHintState(next);
  };
  const clearDwell = () => { window.clearTimeout(dwell.current); dwell.current = undefined; };
  const sourceFor = (unit: HTMLElement, target: Element | null): DragSource | null => {
    const key = unit.dataset.tabUnit;
    if (!key) return null;
    const isGroup = key === GROUP_KEY;
    const member = target?.closest<HTMLElement>('[data-tab-path]');
    const path = isGroup ? member?.dataset.tabPath ?? null : key;
    const title = (member ?? unit).querySelector('.title')?.textContent ?? '';
    return { key, paths: unitPaths.current.get(key) ?? [key], path, title, width: unit.offsetWidth, group: isGroup };
  };
  const beginDrag = (next: DragSource) => {
    source.current = next; tabDrag.path = next.path;
    // Chrome aborts a drag whose source is re-rendered inside dragstart.
    window.requestAnimationFrame(() => { if (source.current === next) setDragging(next); });
  };
  const endDrag = () => {
    clearDwell(); source.current = null; tabDrag.path = null;
    hintRef.current = null; setHintState(null); setDragging(null);
  };
  const hitTest = (element: Element | null): Hit => {
    if (!element || !scroll.current?.contains(element)) return null;
    if (element.closest('.tab-drop-gap')) return 'gap';
    if (element.closest('.tab-drop-end')) return { key: END_KEY };
    const unit = element.closest<HTMLElement>('[data-tab-unit]');
    if (!unit?.dataset.tabUnit) return null;
    const view = element.closest<HTMLElement>('[data-pane]')?.dataset.pane as Pane | undefined;
    return { key: unit.dataset.tabUnit, view };
  };
  const paneAccepts = (view: Pane, path: string | null) => !!path && (view === 'main' || isHomepagePath(path)
    || (path !== GRAPH_PATH && findNode(useStore.getState().tree, path)?.type !== 'folder'));
  const track = (hit: Hit) => {
    const from = source.current;
    if (!from || hit === 'gap' || hit === null) return; // the gap and the 2px gutters keep the current hint
    const current = hintRef.current;
    if (hit.key === from.key) {
      // Inside its own visible split group a member can still swap the two panes.
      const own = from.path === useStore.getState().activePath ? 'main' : 'split';
      clearDwell(); setHint(hit.view && hit.view !== own ? { key: hit.key, mode: 'pane', view: hit.view } : null);
      return;
    }
    // Resting on the tab that opened the gap keeps the gap (it slid right under the pointer).
    if (current?.key === hit.key && (current.mode === 'insert' || current.view === hit.view)) return;
    clearDwell();
    if (hit.key === END_KEY) { setHint({ key: END_KEY, mode: 'insert' }); return; }
    const intoPane = hit.key === GROUP_KEY && hit.view && !from.group && paneAccepts(hit.view, from.path);
    setHint(intoPane ? { key: hit.key, mode: 'pane', view: hit.view } : { key: hit.key, mode: 'swap' });
    dwell.current = window.setTimeout(() => {
      if (source.current === from && hintRef.current?.key === hit.key) setHint({ key: hit.key, mode: 'insert' });
    }, TAB_INSERT_DWELL_MS);
  };
  const autoScroll = (x: number) => {
    const strip = scroll.current, box = strip?.getBoundingClientRect();
    if (!strip || !box) return;
    if (x < box.left + 28) strip.scrollLeft -= 12;
    else if (x > box.right - 28) strip.scrollLeft += 12;
  };
  const drop = () => {
    const from = source.current, at = hintRef.current;
    endDrag();
    if (!from || !at) return;
    const s = useStore.getState();
    if (at.mode === 'pane') { if (at.view && from.path) void s.replacePane(at.view, from.path).catch(error => notify(String(error))); }
    else s.arrangeTabs(from.paths, at.key === END_KEY ? null : unitPaths.current.get(at.key) ?? [at.key], at.mode === 'swap' ? 'swap' : 'before');
  };
  useEffect(() => () => { clearDwell(); touch.current?.cleanup(); }, []);

  // Touch: hold to lift a tab, then drag; holding and releasing without moving opens its menu.
  // Moving before the lift scrolls the strip as before.
  const onUnitPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    touch.current?.cleanup();
    const unit = event.currentTarget, from = sourceFor(unit, event.target as Element);
    const menuTarget = (event.target as Element).closest<HTMLElement>('.tab');
    if (!from || !menuTarget) return;
    const id = event.pointerId, start = { x: event.clientX, y: event.clientY };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== id) return;
      const distance = Math.hypot(next.clientX - start.x, next.clientY - start.y);
      if (!state.armed) { if (distance > 8) state.cleanup(); return; }
      if (!state.dragging) { if (distance < 6) return; state.dragging = true; beginDrag(from); }
      track(hitTest(document.elementFromPoint(next.clientX, next.clientY)));
      autoScroll(next.clientX);
    };
    const up = (next: PointerEvent) => {
      if (next.pointerId !== id) return;
      const { armed, dragging: moved } = state;
      state.cleanup();
      if (moved) { suppressClick.current = true; drop(); }
      else if (armed) {
        suppressClick.current = true;
        allowTouchMenu.current = true;
        menuTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: next.clientX, clientY: next.clientY }));
        allowTouchMenu.current = false;
      }
      window.setTimeout(() => { suppressClick.current = false; }, 400);
    };
    const cancel = (next: PointerEvent) => {
      if (next.pointerId !== id) return;
      const moved = state.dragging;
      state.cleanup();
      if (moved) endDrag();
    };
    // While a tab is lifted the strip must not scroll under the finger.
    const blockScroll = (next: TouchEvent) => { if (state.armed && next.cancelable) next.preventDefault(); };
    const timer = window.setTimeout(() => {
      state.armed = true; unit.classList.add('is-lifted');
      try { navigator.vibrate?.(8); } catch { /* optional */ }
    }, TAB_TOUCH_LIFT_MS);
    const state = {
      armed: false, dragging: false,
      cleanup: () => {
        window.clearTimeout(timer); unit.classList.remove('is-lifted');
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('touchmove', blockScroll);
        if (touch.current === state) touch.current = null;
      },
    };
    touch.current = state;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', blockScroll, { passive: false });
  };
  const unitDragProps = (key: string) => ({
    'data-tab-unit': key,
    draggable: !isMobile,
    onPointerDown: onUnitPointerDown,
    onDragStart: (event: React.DragEvent<HTMLElement>) => {
      const from = touch.current ? null : sourceFor(event.currentTarget, event.target as Element);
      if (!from) { event.preventDefault(); return; }
      event.stopPropagation();
      event.dataTransfer.setData(TAB_DRAG_TYPE, from.path ?? '');
      event.dataTransfer.effectAllowed = 'move';
      beginDrag(from);
    },
    onDragEnd: endDrag,
  });

  const tabNode = (tab: Tab, view?: Pane, unitKey?: string) => {
    const selected = view ? focusedPane === view : activePath === tab.path;
    const close = () => void (view ? closePane(view) : closeTab(tab.path));
    const asUnit = unitKey !== undefined;
    return (
      <div key={view ? `${view}:${tab.path}` : tab.path} data-tab-path={tab.path} data-pane={view}
        // Group members are draggable themselves so dragstart names the member; the group handles it.
        {...(asUnit ? unitDragProps(unitKey) : { draggable: !isMobile })}
        className={`tab${view || activePath === tab.path ? ' active' : ''}${view && selected ? ' is-focused' : ''}`
          + `${view && hint?.mode === 'pane' && hint.view === view ? ' is-drop-target' : ''}`
          + `${asUnit && hint?.mode === 'swap' && hint.key === unitKey ? ' is-drop-swap' : ''}`
          + `${asUnit && dragging?.key === unitKey ? ' is-drag-source' : ''}`}
        role="tab" aria-selected={selected} tabIndex={selected ? 0 : -1}
        onClick={() => void selectTab(tab.path)}
        onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); close(); } }}
        onContextMenu={(event) => {
          // A touch hold opens the menu on release instead, so the same hold can become a drag.
          if (touch.current && !allowTouchMenu.current) { event.preventDefault(); return; }
          openTabMenu(event, tab.path, view);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault(); void selectTab(tab.path);
          } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const index = Math.max(0, tabs.findIndex((item) => item.path === tab.path));
            const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
              : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            if (!next) return;
            scroll.current?.querySelector<HTMLElement>(`[data-tab-path="${CSS.escape(next.path)}"]`)?.focus();
            void selectTab(next.path);
          }
        }}
        title={isWebViewerPath(tab.path) ? tab.webUrl || tab.title : tab.path}>
        {(tab.path === GRAPH_PATH || isHomepagePath(tab.path)) && <Icon name={tab.path === GRAPH_PATH ? 'graph' : 'home'} size={13} />}
        {isWebViewerPath(tab.path) && <Icon name="globe" size={13} />}
        <span className="title">{tab.title.replace(/\.(md|markdown)$/, '')}</span>
        {dirty && view !== 'split' && activePath === tab.path && <span className="dot" aria-label="未保存的更改">●</span>}
        <button type="button" className="close" title="关闭标签页" aria-label={`关闭 ${tab.title}`}
          onClick={(event) => { event.stopPropagation(); close(); }}>
          <Icon name="x" size={13} />
        </button>
      </div>
    );
  };

  // Browser-style split group: the two visible pages read as one unit of equal tabs.
  const tabFor = (path: string): Tab => tabs.find((tab) => tab.path === path)
    ?? { path, title: isHomepagePath(path) ? 'Homepage' : path.split('/').pop() ?? path };
  const group = splitPath ? { main: activePath, side: splitPath, direction: splitDirection, parked: false }
    : parkedSplit ? { ...parkedSplit, parked: true } : null;
  const splitTab: Tab | null = group ? tabFor(group.side) : null;
  const splitGroup = (main?: Tab) => group && splitTab && (
    <div key="split-group" {...unitDragProps(GROUP_KEY)}
      className={`tab-split-group${group.direction === 'down' ? ' is-down' : ''}${group.parked ? ' is-parked' : ''}`
        + `${hint?.mode === 'swap' && hint.key === GROUP_KEY ? ' is-drop-swap' : ''}${dragging?.key === GROUP_KEY ? ' is-drag-source' : ''}`}
      role="group" aria-label={group.direction === 'down' ? '上下分屏' : '左右分屏'}>
      <Icon name={group.direction === 'down' ? 'rows' : 'columns'} size={13} className="split-icon" />
      {main && (group.parked ? tabNode(main) : tabNode(main, 'main'))}
      {group.parked ? tabNode(splitTab) : tabNode(splitTab, 'split')}
    </div>
  );

  // Tab-bar units in display order; a split group sits at its main page's place.
  const units: { key: string; paths: string[]; node: () => ReactNode }[] = [];
  for (const tab of tabs) {
    if (group && tab.path === group.main) units.push({ key: GROUP_KEY, paths: [group.main, group.side], node: () => splitGroup(tab) });
    else if (!(group && tab.path === group.side)) units.push({ key: tab.path, paths: [tab.path], node: () => tabNode(tab, undefined, tab.path) });
  }
  if (group && !tabs.some((tab) => tab.path === group.main)) units.push({ key: GROUP_KEY, paths: [group.side], node: () => splitGroup() });
  unitPaths.current = new Map(units.map((unit) => [unit.key, unit.paths]));
  // The gap that opens where the hovered tab will be pushed aside, holding a ghost of the dragged tab.
  const gap = dragging && <div className={`tab tab-drop-gap${dragging.group ? ' is-group' : ''}`} aria-hidden="true"
    style={{ ['--gap-width' as string]: `${dragging.width}px` }}>
    {dragging.group && <Icon name={group?.direction === 'down' ? 'rows' : 'columns'} size={13} />}
    <span className="title">{dragging.title}</span>
  </div>;

  return (
    <header className="tab-bar">
      <button type="button" className="tab-new tab-ctl"
        title={isMobile ? "打开菜单" : "切换左侧边栏 (Ctrl/⌘\\)"}
        aria-label="折叠/展开左侧边栏" aria-expanded={isMobile ? mobileDrawer === 'left' : leftOpen}
        onClick={() => (isMobile ? setMobileDrawer(mobileDrawer === 'left' ? null : 'left') : toggleLeft())}>
        <Icon name={isMobile ? 'menu' : 'panel-left'} size={16} />
      </button>
      <div className={`tab-scroll${dragging ? ' is-dragging' : ''}`} role="tablist" aria-label="已打开的文件" ref={scroll}
        onClickCapture={(event) => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); } }}
        onDragOver={(event) => {
          if (!source.current || !event.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
          event.preventDefault(); event.dataTransfer.dropEffect = 'move';
          track(hitTest(event.target as Element));
          autoScroll(event.clientX);
        }}
        // Accepting dragenter too keeps the strip a drop target when the gap appears under the pointer.
        onDragEnter={(event) => { if (source.current && event.dataTransfer.types.includes(TAB_DRAG_TYPE)) event.preventDefault(); }}
        onDragLeave={(event) => {
          // Chrome often omits relatedTarget on dragleave, so test the pointer against the strip.
          const box = event.currentTarget.getBoundingClientRect();
          if (event.clientX > box.left && event.clientX < box.right && event.clientY > box.top && event.clientY < box.bottom) return;
          clearDwell(); setHint(null);
        }}
        onDrop={(event) => {
          if (!source.current || !event.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
          event.preventDefault(); event.stopPropagation();
          drop();
        }}>
        {units.map((unit) => <Fragment key={unit.key}>
          {hint?.mode === 'insert' && hint.key === unit.key && gap}
          {unit.node()}
        </Fragment>)}
        {dragging && <>
          {hint?.mode === 'insert' && hint.key === END_KEY && gap}
          <div className="tab-drop-end" aria-hidden="true" />
        </>}
      </div>
      <button type="button" className="tab-new tab-ctl" title="主页" aria-label="新建中央标签页"
        onClick={() => void openHomepage().catch(error => notify(String(error)))}>
        <Icon name="plus" size={16} />
      </button>
      <div className="titlebar-drag-space" />
      {mainPdf && <button type="button" className={`tab-new tab-ctl pdf-toolbar-toggle${pdfToolbarOpen ? ' is-active' : ''}`}
        title={`显示/隐藏 ${mainPdf.label} 工具栏`} aria-label={`显示/隐藏 ${mainPdf.label} 工具栏`} aria-expanded={pdfToolbarOpen}
        onClick={togglePdfToolbar}>
        <Icon name="panel-top" size={16} />
      </button>}
      <button type="button" className="tab-new tab-ctl" title="折叠/展开右侧边栏"
        aria-label="折叠/展开右侧边栏" aria-expanded={isMobile ? mobileDrawer === 'right' : rightOpen}
        onClick={() => (isMobile ? setMobileDrawer(mobileDrawer === 'right' ? null : 'right') : toggleRight())}>
        <Icon name="panel-right" size={16} />
      </button>
    </header>
  );
}
