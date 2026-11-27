import { activateNavigation, getActiveEditor } from './activeEditor';
import { contextOf } from './renderContext';
import { useStore } from './store';
import { getVirtualReading } from './virtualReading';
import { workspaceContent } from './workspaceContent';

export function workspaceSource(path: string | null, viewId: string) {
  const reader = getVirtualReading(path, viewId)?.getSnapshot();
  return reader ? reader.configuration && path ? path + '/.virtual-document.json' : reader.activeSource ?? null : path;
}

/** Capture the command target before yielding to settings, clipboard or I/O. */
export function currentWorkspaceTarget() {
  const state = useStore.getState();
  const viewId = state.currentViewId(), page = state.currentPath(viewId);
  const editor = getActiveEditor();
  const context = editor ? contextOf(editor) : undefined;
  const source = workspaceSource(page, viewId);
  const chapter = page ? getVirtualReading(page, viewId) : undefined;
  const matchesEditor = !!editor && context?.navigationId === viewId && !context.sourceFragment && !context.embedTrail?.length &&
    (context.sourcePath === page || context.sourcePath === source);
  const path = matchesEditor ? context.sourcePath : source;
  const kind = path ? workspaceContent(state.tree, path) : null;
  const file = kind && kind !== 'web' && kind !== 'home' && kind !== 'graph' && kind !== 'folder' && kind !== 'virtual' ? path : null;
  const folder = kind === 'folder' || kind === 'virtual' ? path
    : file ? file.split('/').slice(0, -1).join('/') : chapter ? page : null;
  return { viewId, page, path: file, folder, editor: matchesEditor ? editor : null };
}

export function focusWorkspaceView(viewId: string, host?: HTMLElement) {
  const pane = host ?? [...document.querySelectorAll<HTMLElement>('[data-view-id], [data-sidebar-tab]')].find(element =>
    (element.dataset.viewId ?? 'sidebar:' + element.dataset.sidebarTab) === viewId &&
    !element.closest('[hidden], [aria-hidden="true"]'));
  activateNavigation(viewId);
  const editor = getActiveEditor();
  if (editor && pane?.contains(editor.dom)) { editor.focus(); return; }
  if (!pane) return;
  const content = pane.querySelector<HTMLElement>('webview, .pdf-pages, .virtual-document-scroll');
  (content ?? pane).focus({ preventScroll: true });
}

export function focusAdjacentWorkspaceView(direction: -1 | 1) {
  const state = useStore.getState();
  const panes = [...document.querySelectorAll<HTMLElement>('[data-view-id], [data-sidebar-tab]')]
    .filter(element => !element.closest('[hidden], [aria-hidden="true"]') && element.getClientRects().length)
    .map(element => ({ element, id: element.dataset.viewId ?? 'sidebar:' + element.dataset.sidebarTab, rect: element.getBoundingClientRect() }))
    .sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
  const current = panes.findIndex(pane => pane.id === state.currentViewId());
  if (panes.length) {
    const target = panes[(current < 0 ? (direction === 1 ? 0 : panes.length - 1) : current + direction + panes.length) % panes.length];
    focusWorkspaceView(target.id, target.element);
  }
}
