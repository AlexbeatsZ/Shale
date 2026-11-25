import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, GRAPH_PATH, isHomepagePath, isWebViewerPath } from '../lib/store';
import { paneTabKey } from '../lib/tabIdentity';
import { activateNavigation } from '../lib/activeEditor';
import { isFolderPath } from '../lib/tree';
import { TAB_DRAG_TYPE, tabDrag } from '../lib/tabDrag';
import GraphView from './GraphView';
import Icon from './Icon';
import StatusBar from './StatusBar';
import WorkspaceLauncher from './WorkspaceLauncher';
import WebViewerTab from './WebViewerTab';
import WorkspaceFile from './WorkspaceFile';
import { EditorView } from '@codemirror/view';
import { insertImageFiles } from '../lib/attachmentImages';
import { applySplitRatio, clampSplitRatio, loadSplitRatio, notifySplitLayout, saveSplitRatio } from '../lib/splitLayout';

/** The 1px boundary between split pages: drag resizes them, a double click or
 *  double tap swaps the two pages, arrows/Enter do the same from the keyboard. */
function PaneDivider({ down }: { down: boolean }) {
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const swap = () => {
    const s = useStore.getState();
    if (s.splitPath) void s.replacePane('main', paneTabKey(s, 'split')!).catch(error => s.notify(String(error)));
  };
  const area = (element: HTMLElement) => element.parentElement as HTMLElement;
  const ratioAt = (element: HTMLElement, x: number, y: number) => {
    const box = area(element).getBoundingClientRect();
    return clampSplitRatio(down ? (y - box.top) / box.height : (x - box.left) / box.width);
  };
  return <div className="pane-divider" role="separator" aria-orientation={down ? 'horizontal' : 'vertical'}
    aria-label="调整分屏比例；双击交换两侧页面" title="拖动调整分屏比例，双击交换两侧页面" tabIndex={0}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); swap(); return; }
      const step = { ArrowLeft: -0.02, ArrowUp: -0.02, ArrowRight: 0.02, ArrowDown: 0.02 }[event.key];
      if (step === undefined || (down ? !/Up|Down/.test(event.key) : !/Left|Right/.test(event.key))) return;
      event.preventDefault();
      const ratio = clampSplitRatio(loadSplitRatio() + step);
      applySplitRatio(area(event.currentTarget), ratio); saveSplitRatio(ratio);
    }}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const element = event.currentTarget, start = { x: event.clientX, y: event.clientY };
      let moved = false;
      element.setPointerCapture(event.pointerId);
      element.classList.add('is-dragging');
      document.body.classList.add(down ? 'wo-row-resizing' : 'wo-col-resizing');
      const move = (next: PointerEvent) => {
        if (!moved && Math.hypot(next.clientX - start.x, next.clientY - start.y) < 4) return;
        moved = true;
        applySplitRatio(area(element), ratioAt(element, next.clientX, next.clientY));
      };
      const stop = (end: PointerEvent) => {
        element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', stop); element.removeEventListener('pointercancel', stop);
        element.classList.remove('is-dragging');
        document.body.classList.remove('wo-row-resizing', 'wo-col-resizing');
        if (moved) { saveSplitRatio(ratioAt(element, end.clientX, end.clientY)); lastTap.current = null; return; }
        if (end.type !== 'pointerup') return;
        // One double-tap/double-click detector for mouse, pen and touch.
        const tap = lastTap.current, now = performance.now();
        if (tap && now - tap.time < 350 && Math.hypot(end.clientX - tap.x, end.clientY - tap.y) < 24) { lastTap.current = null; swap(); }
        else lastTap.current = { time: now, x: end.clientX, y: end.clientY };
      };
      element.addEventListener('pointermove', move); element.addEventListener('pointerup', stop); element.addEventListener('pointercancel', stop);
    }} />;
}

function WorkspacePane({ path, navigationId }: { path: string; navigationId: 'main' | 'split' }) {
  const close = useStore((state) => state.closePane);
  return <div className={`pane ${navigationId}-pane`} data-view-id={navigationId}
    onPointerDownCapture={() => activateNavigation(navigationId)} onFocusCapture={() => activateNavigation(navigationId)}>
    <button className="tool-btn pane-close" onClick={() => void close(navigationId)} title={navigationId === 'main' ? '关闭标签页' : '关闭分屏'}>
      <Icon name="x" size={16} />
    </button>
    {isHomepagePath(path) ? <div className="empty-state"><WorkspaceLauncher key={path} viewId={navigationId} /></div>
      : path === GRAPH_PATH ? <GraphView navigationId={navigationId} />
      : <WorkspaceFile path={path} navigationId={navigationId} />}
  </div>;
}

export default function Workspace() {
  const activePath = useStore((s) => s.activePath);
  const splitPath = useStore((s) => s.splitPath);

  const splitDirection = useStore((s) => s.splitDirection);
  const tree = useStore((s) => s.tree);
  const tabs = useStore((s) => s.tabs);
  const activeIsHome = isHomepagePath(activePath);
  const workspace = useRef<HTMLDivElement>(null);
  const editorArea = useRef<HTMLDivElement>(null);
  // Apply the saved split share and tell snapped sidebars whenever the boundary may move.
  useLayoutEffect(() => {
    if (editorArea.current) applySplitRatio(editorArea.current, loadSplitRatio());
    else notifySplitLayout();
  }, [splitPath, splitDirection, activePath]);
  const [drop, setDrop] = useState<{ view: 'main' | 'split' | 'right' | 'down'; left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    // Drags started inside Shale must reach pane drop targets above a web page guest.
    const start = () => document.body.classList.add('is-app-dragging');
    const clear = () => { setDrop(null); document.body.classList.remove('is-app-dragging'); };
    window.addEventListener('dragstart', start, true);
    window.addEventListener('dragend', clear, true);
    window.addEventListener('drop', clear, true);
    return () => {
      window.removeEventListener('dragstart', start, true);
      window.removeEventListener('dragend', clear, true);
      window.removeEventListener('drop', clear, true);
      document.body.classList.remove('is-app-dragging');
    };
  }, []);

  // A dragged tab replaces the pane under the pointer; without a split, the far
  // half of the editor opens it side by side (right) or below (down).
  const dropTarget = (e: React.DragEvent) => {
    const host = workspace.current, area = host?.querySelector<HTMLElement>(':scope > .editor-area'), path = tabDrag.path;
    if (!host || !area || !path) return null;
    const origin = host.getBoundingClientRect(), box = area.getBoundingClientRect();
    const file = useStore.getState().tabs.find(tab => (tab.id ?? tab.path) === path)?.path ?? path;
    const sideable = isHomepagePath(file) || (file !== GRAPH_PATH && !isFolderPath(tree, file));
    const at = (view: 'main' | 'split' | 'right' | 'down', r: { left: number; top: number; width: number; height: number }) =>
      ({ view, left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height });
    if (splitPath) {
      const pane = (e.target as Element).closest<HTMLElement>('[data-view-id]');
      const view = pane?.dataset.viewId === 'split' && sideable ? 'split' : 'main';
      const element = area.querySelector<HTMLElement>(`:scope > [data-view-id="${view}"]`);
      return element ? at(view, element.getBoundingClientRect()) : null;
    }
    const x = (e.clientX - box.left) / box.width, y = (e.clientY - box.top) / box.height;
    if (sideable && x > 0.5 && x >= y) return at('right', { left: box.left + box.width / 2, top: box.top, width: box.width / 2, height: box.height });
    if (sideable && y > 0.5) return at('down', { left: box.left, top: box.top + box.height / 2, width: box.width, height: box.height / 2 });
    return at('main', box);
  };
  const onTabDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
    // Capture before CodeMirror so a tab never drops as text into the note.
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const next = dropTarget(e);
    setDrop(prev => prev && next && (Object.keys(next) as (keyof typeof next)[]).every(key => prev[key] === next[key]) ? prev : next);
  };
  const onTabDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
    e.preventDefault(); e.stopPropagation();
    const target = dropTarget(e), path = tabDrag.path;
    setDrop(null);
    if (!target || !path) return;
    const s = useStore.getState();
    if (target.view === 'right' || target.view === 'down') void s.openToSide(path, target.view);
    else if (s.splitPath) void s.replacePane(target.view, path);
    else if (paneTabKey(s) !== path) void s.showTab(path);
  };

  // Paste uses each MarkdownView's clipboard handler, including sidebar embeds.
  const onDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.files.length) {
      e.preventDefault();
      if ((e.target as Element).closest('[data-mode="reading"]')) return;
      const editor = (e.target as Element).closest<HTMLElement>('.cm-editor');
      const view = editor && EditorView.findFromDOM(editor);
      if (view) void insertImageFiles(view, Array.from(e.dataTransfer.files), false,
        view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? undefined);
    }
  };
  return (
    <div className="workspace" ref={workspace} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <div ref={editorArea} className={`editor-area${splitPath ? ' is-split' : ''}${splitDirection === 'down' ? ' split-down' : ''}`}
        onDragOverCapture={onTabDragOver} onDropCapture={onTabDrop}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null); }}>
        {(!activePath || activeIsHome) && (
          <div className="empty-state" data-view-id="main" onPointerDownCapture={() => activateNavigation('main')} onFocusCapture={() => activateNavigation('main')}>
            <WorkspaceLauncher key={activePath} />
          </div>
        )}
        {activePath && !activeIsHome && !isWebViewerPath(activePath) && (
          <WorkspacePane path={activePath} navigationId="main" />
        )}
        {splitPath && <PaneDivider down={splitDirection === 'down'} />}
        {/* Electron detaches a guest when React reorders its DOM ancestor. Keep
            hosts in identity order; CSS places the visible main/split panes. */}
        {tabs.filter(tab => isWebViewerPath(tab.path)).sort((a, b) => a.path.localeCompare(b.path)).map(tab => {
          const pane = tab.path === activePath ? 'main' : tab.path === splitPath ? 'split' : undefined;
          return <div key={tab.path} className={`pane webviewer-pane${pane ? ' ' + pane + '-pane' : ''}`} data-view-id={pane} hidden={!pane}>
            <WebViewerTab id={tab.path} url={tab.webUrl ?? ''} active={!!pane} />
          </div>;
        })}
        {splitPath && !isWebViewerPath(splitPath) && <WorkspacePane path={splitPath} navigationId="split" />}
      </div>
      {drop && <div className="pane-drop-indicator" style={{ left: drop.left, top: drop.top, width: drop.width, height: drop.height }} />}
      <StatusBar />
    </div>
  );
}
