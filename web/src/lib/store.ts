import { restorePdfDarkPreferences } from './pdf/preferences';
import { manualSave } from './writing/format';
import { create } from 'zustand';
import { api, ApiError, pendingMutations, type TreeNode } from './api';
import { newFileFolder, newFilePath } from './filePlacement';
import { findNode, filePaths, patchFileStat, type FileStat } from './tree';
import { documents } from './documents';
import { publishVirtualDocuments } from './virtualDocuments';
import { isGlobalContentTarget, parseLinkTarget } from '@shale/markdown-core';
import { resolveContentLink } from './contentReferences';
import { navigateTo, captureLocation, cancelNavigation, type NavigationLocation, type NavigationRequest, type LinkIntent } from './fragmentNavigation';
import { sidebarTab, restoreSidebarTabs, sidebarFileType, type SidebarTab } from './sidebarTabs';
import { parseWebViewerUrl } from '../../../desktop/src/webViewerAddress';
import { hasWebViewer } from './platform';
import { getActiveEditor, activateNavigation, getActiveNavigationId } from './activeEditor';
import { contextOf } from './renderContext';
import type { MenuContext } from './configuredMenus/types';
import { TEXT_EXT_RE } from './media';
import { arrangeTabUnits } from './tabDrag';
import { paneTabKey, resolveTabKey, tabKey } from './tabIdentity';
import { removeFromStrip, sidebarFilePath, sidebarTabKey, tabSide, tabStrip, tabStripFor, type TabProperties } from './workspaceTabs';
import { claimPanes, emptyHistory, emptyPane, isPaneId, otherPane, paneIds, type NavigationHistory, type Pane, type PaneId, type ViewMode } from './workspacePane';
import { canOpenWorkspaceContent, GRAPH_PATH, isHomepagePath, isWebViewerPath, workspaceContent } from './workspaceContent';
export { GRAPH_PATH, isHomepagePath, isWebViewerPath } from './workspaceContent';
export type { ViewMode } from './workspacePane';
import { groupNeighbor, groupTabs, restoreTabGrouping, type TabGroupColor } from './tabGroups';
const rightGenerations = new Map<string, number>();
let rightGeneration = 0;
const linkGenerations = new Map<string, number>();

async function saveLeavingDocument(tree: TreeNode | null, path: string | null | undefined) {
  if (!path) return;
  const collection = findNode(tree, path)?.virtualDocument;
  if (!collection) return documents.saveLeaving(path);
  const paths = new Set([path + '/.virtual-document.json', ...collection.streams.flatMap(stream => stream.files.map(file => file.path))]);
  for (const snapshot of documents.snapshots()) if (paths.has(snapshot.id)) await documents.saveLeaving(snapshot.id);
}

function prepareWorkspaceDocument(tree: TreeNode | null, path: string) {
  return workspaceContent(tree, path) === 'text' ? documents.open(path) : undefined;
}

/** Per-tab id so we can ignore the echo of our own server-pushed state change. */
export const CLIENT_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export type TreeSort =
  | 'name-asc' | 'name-desc'
  | 'mtime-desc' | 'mtime-asc'
  | 'ctime-desc' | 'ctime-asc';
const TREE_SORTS: TreeSort[] = ['name-asc', 'name-desc', 'mtime-desc', 'mtime-asc', 'ctime-desc', 'ctime-asc'];

const tabTitle = (path: string) => isHomepagePath(path) ? 'Homepage' : path === GRAPH_PATH ? '关系图谱'
  : isWebViewerPath(path) ? '浏览器' : path.split('/').pop() ?? path;

export interface Tab extends TabProperties {
  path: string;
  webUrl?: string;
}

/** A color group in the graph (nodes matching `query` are tinted `color`). */
export interface GraphGroup {
  query: string;
  color: string;
}

/** Persisted Graph view filters/display/forces — mirrors Shale's graph panel. */
export interface GraphSettings {
  // filters
  search: string;
  tags: boolean;
  attachments: boolean;
  existingOnly: boolean;
  orphans: boolean;
  // groups
  groups: GraphGroup[];
  // display (Shale's native ranges/defaults)
  arrows: boolean;
  textFade: number; // -3..3, default 0 — higher = labels need more zoom
  nodeSize: number; // 0.1..5, default 1
  linkThickness: number; // 0.1..5, default 1
  // forces (Shale's native ranges/defaults)
  centerForce: number; // 0..1, default 0.52
  repelForce: number; // 0..20, default 10
  linkForce: number; // 0..1, default 1
  linkDistance: number; // 30..500, default 250
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  search: '',
  tags: false,
  attachments: false,
  existingOnly: false,
  orphans: true,
  groups: [],
  arrows: false,
  textFade: 0,
  nodeSize: 1,
  linkThickness: 1,
  centerForce: 0.52,
  repelForce: 10,
  linkForce: 1,
  linkDistance: 250,
};

export interface ContextMenuItem {
  id?: string;
  label: string;
  disabled?: boolean;
  checked?: boolean;
  section?: string;
  group?: string;
  danger?: boolean;
  separator?: boolean;
  icon?: string;
  onClick?: (event?: MouseEvent) => void;
  submenu?: ContextMenuItem[];
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
  context?: MenuContext;
}

interface AppState {
  tree: TreeNode | null;
  filePaths: string[];
  lastFileChange: { path: string; stat: FileStat } | null;
  applyFileStat: (path: string, stat: FileStat) => boolean;
  loadTree: () => Promise<void>;

  tabs: Tab[];
  panes: Record<PaneId, Pane>;
  viewOptions: Record<string, { mode?: ViewMode; toolbarOpen?: boolean }>;
  sidebarHistories: Record<string, NavigationHistory>;
  selectedTabs: string[];
  setSelectedTabs: (keys: string[]) => void;
  setTabGroup: (keys: string[], color: TabGroupColor | null) => void;
  swapGroupedTab: (direction: -1 | 1) => Promise<void>;
  duplicateTab: (key: string) => Promise<void>;
  /** Back/forward navigation stack of visited paths (incl. GRAPH_PATH). */
  currentViewId: () => string;
  currentPath: (viewId?: string) => string | null;
  recordNavigation: (before: NavigationLocation, after: NavigationLocation) => void;
  navigate: (path: string, request?: NavigationRequest) => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  vaultSessionStale: boolean;
  defaultViewMode: ViewMode;
  setViewMode: (mode: ViewMode, viewId?: string, key?: string) => void;
  setPdfToolbarOpen: (open: boolean, viewId?: string, key?: string) => void;
  togglePdfToolbar: (viewId?: string) => void;
  pdfDarkOverrides: Record<string, boolean>;
  setPdfDark: (path: string, dark: boolean) => void;

  // expanded folders in the file tree (persisted)
  expanded: string[];
  toggleFolder: (path: string) => void;
  setExpanded: (paths: string[]) => void;
  // file tree sort order + auto-reveal active file (both persisted)
  treeSort: TreeSort;
  setTreeSort: (s: TreeSort) => void;
  autoReveal: boolean;
  toggleAutoReveal: () => void;

  // split pane (open to the side)
  /** Which edge the split pane is docked to ('right' = columns, 'down' = rows). */
  splitDirection: 'right' | 'down';
  openToSide: (path: string, direction?: 'right' | 'down') => Promise<void>;
  /** Leave split view; both pages stay open as tabs. */
  closeSplit: () => Promise<void>;
  /** Browser-style split: keep `path` (default: the main page) and open a Homepage on the new side. */
  splitWithHomepage: (path?: string | null, direction?: 'right' | 'down') => Promise<void>;
  /** Close one central pane and its tab; the remaining pane fills the workspace. */
  closePane: (viewId: 'main' | 'split') => Promise<void>;
  /** A split group set aside while another tab is shown alone; selecting either member restores it. */
  parkedSplit: { main: string; side: string; mainId?: string; sideId?: string; direction: 'right' | 'down'; panes?: Record<PaneId, Pane> } | null;
  /** Select a tab like a browser: a split group behaves as one tab. */
  showTab: (path: string) => Promise<void>;
  /** Put a tab into one pane of the visible split group; the page it replaces takes the tab's old place. */
  replacePane: (viewId: 'main' | 'split', path: string) => Promise<void>;
  /** Swap exactly two pages, updating only the touched member of a visible or parked split. */
  swapTabs: (source: string, target: string) => Promise<void>;
  /** Reorder tab-bar units (a split group moves as one for insertion): swap two single tabs, or move one before
   *  another (`target` null = to the end). Only the order changes; no page is opened. */
  arrangeTabs: (source: string[], target: string[] | null, mode: 'swap' | 'before') => void;
  arrangeSidebarTabs: (side: 'left' | 'right', source: string, target: string | null, mode: 'swap' | 'before') => void;

  recent: string[];
  removeRecent: (path: string) => void;
  bookmarks: string[];
  toggleBookmark: (path: string) => void;

  /** Path(s) the "Move to…" folder picker is acting on (null = closed). An array = bulk move. */
  movePath: string | string[] | null;
  setMovePath: (path: string | string[] | null) => void;

  /** Multi-selected file/folder paths in the tree (Shift/Cmd-click); never persisted. */
  selected: string[];
  setSelected: (paths: string[]) => void;
  /** Anchor row for Shift-click range selection. */
  selectAnchor: string | null;
  setSelectAnchor: (path: string | null) => void;

  /** File/folder copied or cut, awaiting paste (session-local, never persisted). */
  clipboard: { path: string; mode: 'copy' | 'cut' } | null;
  setClipboard: (c: { path: string; mode: 'copy' | 'cut' } | null) => void;

  leftPanel: 'files' | 'search';
  setLeftPanel: (p: 'files' | 'search') => void;
  rightPanel: 'properties' | 'backlinks' | 'outgoing' | 'tags' | 'outline' | 'minimap' | 'mcp';
  setRightPanel: (p: 'properties' | 'backlinks' | 'outgoing' | 'tags' | 'outline' | 'minimap' | 'mcp') => void;
  rightTabs: SidebarTab[];
  rightActiveId: string | null;
  leftActiveId: string | null;
  openSidebarTab: (side: 'left' | 'right', type: string, state?: Record<string, any>, id?: string) => Promise<string | null>;
  openRightTab: (type: string, state?: Record<string, any>, id?: string) => Promise<string | null>;
  updateRightTab: (id: string, patch: Partial<Omit<SidebarTab, 'id'>>) => void;
  selectRightTab: (id: string) => void;
  closeRightTab: (id: string) => Promise<void>;
  /** Query pushed into the search panel (e.g. clicking a tag node in the graph). */
  searchQuery: string;
  searchFor: (q: string) => void;
  leftOpen: boolean;
  rightOpen: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  /** Mobile-only overlay drawer; device-local (never persisted/broadcast). */
  mobileDrawer: 'left' | 'right' | null;
  setMobileDrawer: (d: 'left' | 'right' | null) => void;

  paletteOpen: boolean;
  paletteMode: 'all' | 'commands' | 'files' | 'headings' | 'templates';
  setPalette: (v: boolean, mode?: 'all' | 'commands' | 'files' | 'headings' | 'templates') => void;
  paletteRightTab: string | null;
  pickRightNote: (id: string) => void;
  settingsOpen: boolean;
  setSettings: (v: boolean) => void;
  /** Open (true) or close (false) the Trash modal. */
  trashOpen: boolean;
  setTrash: (v: boolean) => void;
  /** Open (true) or close (false) the Graph view tab. */
  setGraph: (v: boolean) => void;
  graphSettings: GraphSettings;
  setGraphSettings: (patch: Partial<GraphSettings>) => void;
  resetGraphSettings: () => void;

  contextMenu: ContextMenuState | null;
  openContextMenu: (m: ContextMenuState) => void;
  closeContextMenu: () => void;

  /** Note path whose Version history modal is open (null = closed). */
  versionHistoryPath: string | null;
  setVersionHistory: (path: string | null) => void;
  /** Expand ancestor folders + scroll the file into view in the file tree. */
  revealInTree: (path: string) => void;

  toast: string;
  /** Show a toast. ms=0 keeps it until another notify() replaces it. */
  notify: (msg: string, ms?: number) => void;

  openFile: (path: string, recordHistory?: boolean, viewId?: string, options?: { preserveHomepage?: boolean; tabId?: string; parkSplit?: boolean }) => Promise<void>;
  openHomepage: (viewId?: string) => Promise<void>;
  openWikilink: (target: string, sourcePath?: string, intent?: LinkIntent) => Promise<void>;
  closeTab: (path: string) => Promise<void>;
  renamePath: (from: string, to: string, expectedRevision?: string, virtualDocument?: { path: string; revision: string }) => Promise<void>;
  removePath: (path: string) => ReturnType<typeof api.remove>;
  setContent: (c: string) => void;
  save: (cause?: 'manual' | 'background') => Promise<void>;
  createNote: (path: string, body?: string, applyTemplate?: boolean, viewId?: string) => Promise<void>;
  /** Shale-style: create & open a fresh "Untitled" note (no prompt). `dir` = target folder, '' = vault root. */
  newNote: (dir?: string, viewId?: string) => Promise<void>;
  /** Shale-style: create a fresh "Untitled" folder (no prompt) and start inline-renaming it. */
  newFolder: (dir?: string) => Promise<void>;
  /** Tree path currently being inline-renamed (null = none); FileTree shows an input for it. */
  renamingPath: string | null;
  setRenamingPath: (path: string | null) => void;
  /** Re-fetch content for the active/split tabs (after reload or remote sync). */
  hydrate: () => Promise<void>;
  /** Load persisted workspace state from the server and apply it. */
  loadUiState: () => Promise<void>;
  /** Apply a workspace state pushed from another tab/device. */
  applyRemoteState: (state: any, originId: string) => Promise<void>;
}

/** All file identities in the existing layout follow one explicit path change. */
function remapWorkspacePaths(state: AppState, from: string, to?: string): Partial<AppState> {
  const map = (value: string | null): string | null => value !== null && (value === from || value.startsWith(from + '/'))
    ? to === undefined ? null : to + value.slice(from.length) : value;
  const list = (values: string[]) => [...new Set(values.map(map).filter((value): value is string => value !== null))];
  const tabs = state.tabs.flatMap(tab => {
    const path = map(tab.path);
    return path === null ? [] : [{ ...tab, path, title: path === tab.path ? tab.title : path.split('/').pop()! }];
  });
  const rightTabs = state.rightTabs.flatMap(tab => {
    if (tab.type !== 'markdown' && tab.type !== 'file') return [tab];
    const file = map(tab.state.file);
    return file === null ? [] : [{ ...tab, state: { ...tab.state, file }, title: file.split('/').pop()! }];
  });
  const parked = state.parkedSplit, parkedMain = parked && map(parked.main), parkedSide = parked && map(parked.side);
  const remapId = (id: string | null) => state.tabs.some(tab => tab.id === id) ? id : map(id);
  const parkedSplit = parked && parkedMain && parkedSide ? { ...parked, main: parkedMain, side: parkedSide,
    mainId: remapId(parked.mainId ?? parked.main) ?? undefined, sideId: remapId(parked.sideId ?? parked.side) ?? undefined } : null;
  const remapHistory = (stack: NavigationHistory) => ({
    history: stack.history.flatMap(location => { const path = map(location.path); return path === null ? [] : [{ ...location, path }]; }),
    histIndex: stack.history.slice(0, stack.histIndex + 1).filter(location => map(location.path) !== null).length - 1,
  });
  const remapPane = (id: PaneId): Pane => {
    const pane = state.panes[id], path = map(pane.path);
    return { path, tabId: path ? resolveTabKey(tabs, path, remapId(pane.tabId)) : null, ...remapHistory(pane) };
  };
  const panes = { main: remapPane('main'), split: remapPane('split') };
  if (!panes.main.path && state.panes.main.path) {
    const next = tabs.at(-1);
    panes.main = panes.split.path ? movePane(panes.split, 'main') : { ...panes.main, path: next?.path ?? null, tabId: next ? tabKey(next) : null };
    panes.split = emptyPane;
  }
  return { tabs, rightTabs, panes, parkedSplit,
    viewOptions: Object.fromEntries(Object.entries(state.viewOptions).flatMap(([id, options]) => {
      const next = id.startsWith('sidebar:') ? id : remapId(id); return next === null ? [] : [[next, options]];
    })),
    selectedTabs: state.selectedTabs.flatMap(id => id.startsWith('sidebar:') ? [id] : remapId(id) ?? []),
    rightActiveId: rightTabs.some(tab => tab.id === state.rightActiveId) ? state.rightActiveId : null,
    leftActiveId: rightTabs.some(tab => tab.id === state.leftActiveId) ? state.leftActiveId : null,
    recent: list(state.recent), bookmarks: list(state.bookmarks), expanded: list(state.expanded), selected: list(state.selected),
    pdfDarkOverrides: Object.fromEntries(Object.entries(state.pdfDarkOverrides).flatMap(([path, dark]) => { const next = map(path); return next === null ? [] : [[next, dark]]; })),
    sidebarHistories: Object.fromEntries(Object.entries(state.sidebarHistories).map(([id, stack]) => [id, remapHistory(stack)])),
    renamingPath: map(state.renamingPath), selectAnchor: map(state.selectAnchor), versionHistoryPath: map(state.versionHistoryPath),
    clipboard: state.clipboard && map(state.clipboard.path) ? { ...state.clipboard, path: map(state.clipboard.path)! } : null,
    movePath: Array.isArray(state.movePath) ? list(state.movePath) : map(state.movePath) };
}

// ---- server-side workspace persistence (shared across browsers/devices) ----
/** The two pages shown (or set aside) as one split-group tab, main first. */
function splitPair(s: AppState) {
  return s.panes.split.path && s.panes.main.path ? [paneTabKey(s)!, paneTabKey(s, 'split')!] : s.parkedSplit
    ? [s.parkedSplit.mainId ?? s.parkedSplit.main, s.parkedSplit.sideId ?? s.parkedSplit.side] : null;
}

const PERSIST_KEYS = [
  'tabs', 'defaultViewMode', 'viewOptions', 'expanded', 'splitDirection', 'parkedSplit',
  'recent', 'bookmarks', 'leftPanel', 'rightPanel', 'leftOpen', 'rightOpen', 'graphSettings',
  'treeSort', 'autoReveal', 'pdfDarkOverrides',
  'rightTabs', 'rightActiveId', 'leftActiveId',
] as const;

function pickPersisted(s: AppState): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of PERSIST_KEYS) if (k !== 'defaultViewMode') o[k] = s[k];
  const { main, split } = s.panes;
  const parked = s.parkedSplit;
  o.parkedSplit = parked ? { main: parked.main, side: parked.side, mainId: parked.mainId, sideId: parked.sideId, direction: parked.direction } : null;
  return { ...o, activePath: main.path, activeTabId: main.tabId, splitPath: split.path, splitTabId: split.tabId, viewMode: s.defaultViewMode };
}

/** Merge persisted graph settings over defaults. */
function restoreGraphSettings(gs: unknown): GraphSettings {
  return gs && typeof gs === 'object' ? { ...DEFAULT_GRAPH_SETTINGS, ...(gs as Partial<GraphSettings>) } : DEFAULT_GRAPH_SETTINGS;
}

function applyPersisted(s: any, set: (p: any) => void): void {
  claimPanes(paneIds);
  rightGenerations.clear();
  const rightTabs = restoreSidebarTabs(s.rightTabs, hasWebViewer());
  const seen = new Set<string>();
  const tabs: Tab[] = (Array.isArray(s.tabs) ? s.tabs : []).flatMap((tab: Tab) => {
    if (!tab || typeof tab.path !== 'string' || !tab.path || isWebViewerPath(tab.path) && (!hasWebViewer() || tab.webUrl && !parseWebViewerUrl(tab.webUrl))) return [];
    const id = typeof tab.id === 'string' && /^tab:[\w-]+$/.test(tab.id) ? tab.id : undefined;
    const key = id ?? tab.path;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ path: tab.path, title: typeof tab.title === 'string' ? tab.title : tabTitle(tab.path),
      ...(id ? { id } : {}), ...(isWebViewerPath(tab.path) ? { webUrl: tab.webUrl ?? '' } : {}), ...restoreTabGrouping(tab) }];
  });
  const available = (path: unknown): path is string => typeof path === 'string' &&
    (!isWebViewerPath(path) || tabs.some(tab => tab.path === path));
  const activePath = available(s.activePath) ? s.activePath : null;
  const splitPath = available(s.splitPath) ? s.splitPath : null;
  const paths = { main: activePath ?? splitPath, split: activePath ? splitPath : null };
  const pane = (id: PaneId): Pane => ({ ...emptyPane, path: paths[id],
    tabId: resolveTabKey(tabs, paths[id], id === 'main' && activePath ? s.activeTabId : s.splitTabId) });
  const panes = { main: pane('main'), split: pane('split') };
  if (panes.main.tabId && panes.main.tabId === panes.split.tabId) {
    const tab = tabs.find(tab => tabKey(tab) === panes.main.tabId);
    if (tab && !isWebViewerPath(tab.path) && !isHomepagePath(tab.path)) {
      const copy = { path: tab.path, title: tab.title, id: `tab:${crypto.randomUUID()}` };
      tabs.push(copy);
      panes.split.tabId = copy.id;
    } else panes.split = emptyPane;
  }
  const viewOptions: AppState['viewOptions'] = Object.create(null);
  for (const key of [...tabs.map(tabKey), ...rightTabs.map(sidebarTabKey)]) {
    const value = s.viewOptions && Object.hasOwn(s.viewOptions, key) ? s.viewOptions[key] : undefined;
    if (!value || typeof value !== 'object') continue;
    if (['live', 'source', 'reading'].includes(value.mode)) viewOptions[key] = { mode: value.mode };
    if (typeof value.toolbarOpen === 'boolean') viewOptions[key] = { ...viewOptions[key], toolbarOpen: value.toolbarOpen };
  }
  set({
    tabs, panes, viewOptions, selectedTabs: [],
    defaultViewMode: ['live', 'source', 'reading'].includes(s.viewMode) ? s.viewMode : 'live',
    pdfDarkOverrides: restorePdfDarkPreferences(s),
    expanded: Array.isArray(s.expanded) ? s.expanded : [],
    treeSort: TREE_SORTS.includes(s.treeSort) ? s.treeSort : 'name-asc',
    autoReveal: s.autoReveal === true,
    splitDirection: s.splitDirection === 'down' ? 'down' : 'right',
    parkedSplit: !splitPath && available(s.parkedSplit?.main) && available(s.parkedSplit?.side)
      ? { main: s.parkedSplit.main, side: s.parkedSplit.side,
          mainId: tabs.find(tab => tab.path === s.parkedSplit.main && tabKey(tab) === s.parkedSplit.mainId) ? s.parkedSplit.mainId : undefined,
          sideId: tabs.find(tab => tab.path === s.parkedSplit.side && tabKey(tab) === s.parkedSplit.sideId) ? s.parkedSplit.sideId : undefined, direction: s.parkedSplit.direction === 'down' ? 'down' : 'right' } : null,
    recent: Array.isArray(s.recent) ? s.recent : [],
    bookmarks: Array.isArray(s.bookmarks) ? s.bookmarks : [],
    leftPanel: s.leftPanel === 'search' ? 'search' : 'files',
    rightPanel: ['properties', 'backlinks', 'outgoing', 'tags', 'outline', 'minimap', 'mcp'].includes(s.rightPanel) ? s.rightPanel : 'backlinks',
    rightTabs,
    leftActiveId: rightTabs.some(tab => tab.side === 'left' && tab.id === s.leftActiveId) ? s.leftActiveId : null,
    rightActiveId: rightTabs.some(tab => tab.side !== 'left' && tab.id === s.rightActiveId) ? s.rightActiveId : null,
    leftOpen: s.leftOpen !== false,
    rightOpen: s.rightOpen !== false,
    graphSettings: restoreGraphSettings(s.graphSettings),
  });
}

export function viewKey(state: AppState, viewId: string): string | null {
  return isPaneId(viewId) ? paneTabKey(state, viewId) : viewId;
}
export function viewModeFor(state: AppState, viewId: string, key = viewKey(state, viewId)) {
  return (key ? state.viewOptions[key]?.mode : undefined) ?? state.defaultViewMode;
}
export function toolbarOpenFor(state: AppState, viewId: string, key = viewKey(state, viewId)) {
  return key ? state.viewOptions[key]?.toolbarOpen ?? false : false;
}

function historyFor(s: AppState, viewId: string) {
  return isPaneId(viewId) ? s.panes[viewId] : s.sidebarHistories[viewId] ?? emptyHistory;
}
function historyPatch(s: AppState, viewId: string, history: NavigationLocation[], histIndex: number) {
  const stack = { history, histIndex };
  return isPaneId(viewId) ? { panes: { ...s.panes, [viewId]: { ...s.panes[viewId], ...stack } } }
    : { sidebarHistories: { ...s.sidebarHistories, [viewId]: stack } };
}
function movePane(pane: Pane, viewId: PaneId): Pane {
  return { ...pane, history: pane.history.map(location => ({ ...location, viewId })) };
}
function pushHistory(s: AppState, path: string, record: boolean, viewId: string, before?: NavigationLocation): NavigationHistory {
  const { history, histIndex } = historyFor(s, viewId);
  if (!record || history[histIndex]?.path === path) return { history, histIndex };
  const prior = history.slice(0, histIndex + 1);
  if (before) { if (prior.length) prior[prior.length - 1] = before; else prior.push(before); }
  const next = [...prior, { path, viewId }].slice(-100);
  return { history: next, histIndex: next.length - 1 };
}

function recentFiles(s: AppState, path: string) {
  const kind = workspaceContent(s.tree, path);
  return kind === 'home' || kind === 'graph' || kind === 'web' || kind === 'folder' ? s.recent
    : [path, ...s.recent.filter(p => p !== path)].slice(0, 20);
}

// Only start saving after the initial load; suppress while applying remote/initial state.
let canSave = false;
let suppressSave = false;
let saveTimer: number | undefined;
let lastSaved = '';
let desiredWorkspace = '';
let workspaceWrite: Promise<void> | undefined;
let workspaceDirty = false;
let workspaceSaveError = '';
let workspaceRetries = 0;
let remoteWorkspaceGeneration = 0;
let workspaceLoadGeneration = 0;

function scheduleSave(): void {
  window.clearTimeout(saveTimer);
  workspaceDirty = true;
  workspaceRetries = 0;
  saveTimer = window.setTimeout(() => { void flushWorkspaceState().catch(() => {}); }, 500);
}

export function workspaceHasUnsavedChanges(): boolean {
  return workspaceDirty || workspaceWrite !== undefined;
}

export async function flushWorkspaceState(): Promise<void> {
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
  if (!canSave) {
    if (workspaceDirty) throw new Error('工作区尚未成功读取，已保留当前布局；请重新读取后再保存');
    return;
  }
  desiredWorkspace = JSON.stringify(pickPersisted(useStore.getState()));
  workspaceDirty = desiredWorkspace !== lastSaved;
  if (workspaceWrite) return workspaceWrite;
  if (!workspaceDirty) return;
  workspaceWrite = (async () => {
    try {
      while (desiredWorkspace !== lastSaved) {
        const sent = desiredWorkspace;
        await api.putUiState(JSON.parse(sent), CLIENT_ID);
        lastSaved = sent;
        desiredWorkspace = JSON.stringify(pickPersisted(useStore.getState()));
        workspaceDirty = desiredWorkspace !== lastSaved;
      }
      workspaceRetries = 0;
      if (workspaceSaveError && useStore.getState().toast === workspaceSaveError) useStore.getState().notify('工作区已保存');
      workspaceSaveError = '';
    } catch (error) {
      workspaceDirty = true;
      workspaceSaveError = `工作区保存失败，当前布局已保留：${String(error)}`;
      useStore.getState().notify(workspaceSaveError, 0);
      if (workspaceRetries < 3 && !useStore.getState().vaultSessionStale) {
        const delay = 1000 * 2 ** workspaceRetries++;
        saveTimer = window.setTimeout(() => { void flushWorkspaceState().catch(() => {}); }, delay);
      }
      throw error;
    } finally {
      workspaceWrite = undefined;
    }
  })();
  return workspaceWrite;
}

export async function saveWorkspaceBeforeExit(): Promise<void> {
  await documents.pathsSettled();
  for (const snapshot of documents.snapshots()) {
    if (!snapshot.dirty && !snapshot.saving && !snapshot.conflict && !snapshot.locked) continue;
    if (useStore.getState().vaultSessionStale) throw new Error('Vault 已切换，旧会话仍有未保存内容，请处理后再关闭');
    await documents.saveLeaving(snapshot.id);
  }
  await flushWorkspaceState();
  const state = useStore.getState();
  if (workspaceHasUnsavedChanges() || pendingMutations() ||
      documents.snapshots().some(snapshot => snapshot.dirty || snapshot.saving || snapshot.conflict || snapshot.locked))
    throw new Error('仍有未保存内容、冲突或写入请求，请处理后再关闭');
}

export const useStore = create<AppState>()(
    (set, get) => {
      type OpenOptions = NonNullable<Parameters<AppState['openFile']>[3]>;
      async function openPane(viewId: PaneId, incomingPath: string, record: boolean, options: OpenOptions = {}, direction?: 'right' | 'down') {
        const initial = get(), origin = initial.panes[viewId].path;
        if (!canOpenWorkspaceContent(incomingPath) || (viewId === 'split' && !initial.panes.main.path)) return false;
        const requested = options.tabId ?? (origin === incomingPath ? paneTabKey(initial, viewId) : null) ?? incomingPath;
        const parked = initial.parkedSplit;
        const restoring = viewId === 'main' && parked && [parked.mainId ?? parked.main, parked.sideId ?? parked.side].includes(requested) ? parked : null;
        const parking = viewId === 'main' && options.parkSplit && initial.panes.main.path && initial.panes.split.path ? {
          main: initial.panes.main.path, side: initial.panes.split.path,
          mainId: paneTabKey(initial)!, sideId: paneTabKey(initial, 'split')!, direction: initial.splitDirection, panes: initial.panes,
        } : null;
        const path = restoring?.main ?? incomingPath;
        const before = origin ? captureLocation(origin, viewId) : undefined;
        const ids = restoring || parking || !initial.panes.split.path ? paneIds : [viewId];
        const current = claimPanes(ids);
        cancelNavigation(viewId, path);
        if (restoring || parking) cancelNavigation('split', restoring?.side);
        try {
          await saveLeavingDocument(initial.tree, origin);
          if (parking && parking.side !== origin) await saveLeavingDocument(initial.tree, parking.side);
          if (!current()) return false;
          await Promise.all([prepareWorkspaceDocument(get().tree, path), restoring ? prepareWorkspaceDocument(get().tree, restoring.side) : undefined]);
        } catch (error) {
          if (current()) get().notify(String(error));
          return false;
        }
        if (!current() || (restoring && get().parkedSplit !== restoring)) return false;
        set(s => {
          const previousKey = paneTabKey(s, viewId);
          const tabs = [...s.tabs];
          const at = !options.preserveHomepage && !isHomepagePath(path) && isHomepagePath(origin)
            ? tabs.findIndex(tab => tabKey(tab) === previousKey) : -1;
          const targetId = restoring ? restoring.mainId ?? restoring.main : options.tabId ?? (origin === path ? previousKey : null);
          const oppositeKey = paneTabKey(s, otherPane(viewId));
          const matches = tabs.filter(tab => tab.path === path);
          let target = matches.find(tab => tabKey(tab) === targetId) ?? matches.find(tab => tabKey(tab) !== oppositeKey) ?? matches[0];
          // Opening the same file in two panes creates two views of one document.
          if (target && tabKey(target) === oppositeKey && !restoring) {
            if (isWebViewerPath(path) || isHomepagePath(path)) return s;
            target = { path, title: target.title, id: `tab:${crypto.randomUUID()}` };
            tabs.splice(at >= 0 ? at : tabs.findIndex(tab => tabKey(tab) === oppositeKey) + 1,
              at >= 0 ? 1 : 0, target);
          } else if (!target) {
            target = { path, title: tabTitle(path), ...(at >= 0 ? restoreTabGrouping(tabs[at]) : {}) };
            const atMain = viewId === 'split' ? tabs.findIndex(tab => tabKey(tab) === paneTabKey(s)) : -1;
            tabs.splice(at >= 0 ? at : atMain >= 0 ? atMain + 1 : tabs.length, at >= 0 ? 1 : 0, target);
          } else if (at >= 0 && tabs[at] !== target) tabs.splice(at, 1);
          const history = restoring?.panes?.main ?? pushHistory(s, path, record, viewId, before);
          const pane = { path, tabId: tabKey(target), history: history.history, histIndex: history.histIndex };
          const panes = { ...s.panes, [viewId]: pane };
          if (restoring) panes.split = { ...(restoring.panes?.split ?? emptyPane), path: restoring.side, tabId: restoring.sideId ?? restoring.side };
          else if (parking) panes.split = emptyPane;
          return { tabs, panes, recent: recentFiles(s, path), splitDirection: restoring?.direction ?? direction ?? s.splitDirection,
            parkedSplit: parking ?? (restoring || viewId === 'split' ? null : s.parkedSplit) };
        });
        if (!current() || get().panes[viewId].path !== path) return false;
        activateNavigation(restoring && requested === (restoring.sideId ?? restoring.side) ? 'split' : viewId);
        return true;
      }

      function removeCentralTab(s: AppState, key: string) {
        const { remaining: tabs, next } = removeFromStrip(s.tabs, key, tabKey);
        return { tabs, next,
          parkedSplit: s.parkedSplit && splitPair(s)?.includes(key) ? null : s.parkedSplit };
      }

      async function closeCentral(viewId: PaneId, remove: boolean) {
        const initial = get(), pane = initial.panes[viewId];
        if (!pane.path) return;
        const current = claimPanes(paneIds);
        try { await saveLeavingDocument(initial.tree, pane.path); }
        catch (error) { if (current()) get().notify(String(error)); return; }
        if (!current() || get().panes[viewId].path !== pane.path || paneTabKey(get(), viewId) !== paneTabKey(initial, viewId)) return;
        const survivor = get().panes[otherPane(viewId)];
        const key = paneTabKey(initial, viewId)!;
        let next: string | null = null;
        set(s => {
          const closed = remove && key !== paneTabKey(s, otherPane(viewId)) ? removeCentralTab(s, key) : undefined;
          if (survivor.path) {
            const main = viewId === 'main' ? movePane(survivor, 'main') : survivor;
            cancelNavigation(viewId);
            return { ...(closed ? { tabs: closed.tabs, parkedSplit: closed.parkedSplit } : {}), panes: { main, split: emptyPane } };
          }
          next = closed?.next ? tabKey(closed.next) : null;
          return { tabs: closed?.tabs ?? s.tabs, parkedSplit: closed?.parkedSplit ?? s.parkedSplit,
            panes: { main: emptyPane, split: emptyPane } };
        });
        if (isPaneId(getActiveNavigationId())) activateNavigation('main');
        if (next) await get().showTab(next);
      }

      async function moveHistory(direction: -1 | 1) {
        const state = get(), viewId = state.currentViewId(), { history, histIndex } = historyFor(state, viewId);
        const target = history[histIndex + direction], current = history[histIndex];
        if (!target || !current) return;
        const captured = captureLocation(current.path, viewId);
        const updated = history.map((item, index) => index === histIndex && captured?.anchor !== undefined
          ? { ...captured, fragment: item.fragment } : item);
        set(s => historyPatch(s, viewId, updated, histIndex + direction));
        try { await get().navigate(target.path, { viewId, location: target, history: false }); }
        catch (error) { get().notify('恢复历史位置失败：' + String(error)); }
      }

      return ({
      tree: null,
      filePaths: [],
      lastFileChange: null,
      applyFileStat: (path, stat) => {
        const tree = patchFileStat(get().tree, path, stat);
        if (!tree) return false;
        set({ tree, lastFileChange: { path, stat } });
        return true;
      },
      loadTree: async () => {
        let tree: TreeNode, generation: number;
        do {
          await documents.pathsSettled();
          generation = documents.pathVersion;
          tree = await api.tree();
        } while (generation !== documents.pathVersion || generation % 2 !== 0);
        const paths = filePaths(tree), prior = get().filePaths;
        publishVirtualDocuments(tree);
        set({ tree, filePaths: paths.length === prior.length && paths.every((path, i) => path === prior[i]) ? prior : paths });
      },

      tabs: [], panes: { main: emptyPane, split: emptyPane }, viewOptions: {}, sidebarHistories: {},
      selectedTabs: [],
      setSelectedTabs: selectedTabs => set({ selectedTabs }),
      setTabGroup: (keys, color) => set(s => ({
        tabs: groupTabs(s.tabs, keys, tabKey, color),
        rightTabs: (['left', 'right'] as const).flatMap(side => groupTabs(s.rightTabs.filter(tab => (tab.side ?? 'right') === side), keys, tab => 'sidebar:' + tab.id, color)),
      })),
      swapGroupedTab: async direction => {
        const state = get(), view = state.currentViewId();
        const key = viewKey(state, view);
        if (!key) return;
        const strip = tabStrip(state, tabStripFor(state, key));
        const current = strip.find(entry => entry.key === key);
        const target = groupNeighbor(strip.map(entry => entry.tab), current?.tab, direction);
        const entry = strip.find(item => item.tab === target);
        if (!entry) return;
        if (isPaneId(view) && state.panes.split.path) await state.replacePane(view, entry.key);
        else await state.showTab(entry.key);
      },
      duplicateTab: async key => {
        if (key.startsWith('sidebar:')) {
          const source = get().rightTabs.find(tab => 'sidebar:' + tab.id === key);
          if (!source) return;
          const id = await get().openSidebarTab(source.side ?? 'right', source.type, structuredClone(source.state));
          if (!id) return;
          set(s => { const copy = s.rightTabs.find(tab => tab.id === id); if (!copy) return {};
            const tabs = s.rightTabs.filter(tab => tab.id !== id), at = tabs.findIndex(tab => tab.id === source.id);
            tabs.splice(at + 1, 0, { ...copy, title: source.title, icon: source.icon }); return { rightTabs: tabs }; });
          activateNavigation('sidebar:' + id);
          return;
        }
        const source = get().tabs.find(tab => tabKey(tab) === key);
        if (!source) return;
        await saveLeavingDocument(get().tree, get().panes.main.path);
        if (!get().tabs.some(tab => tabKey(tab) === key && tab.path === source.path)) return;
        const path = isWebViewerPath(source.path) ? `webviewer://${crypto.randomUUID()}` : isHomepagePath(source.path) ? `home://${crypto.randomUUID()}` : source.path;
        const copy: Tab = { path, title: source.title, ...(source.webUrl === undefined ? {} : { webUrl: source.webUrl }),
          ...(path === source.path ? { id: `tab:${crypto.randomUUID()}` } : {}) };
        set(s => { const tabs = [...s.tabs], at = tabs.findIndex(tab => tabKey(tab) === key); tabs.splice(at + 1, 0, copy); return { tabs }; });
        await get().showTab(tabKey(copy));
      },
      currentViewId: () => {
        const id = getActiveNavigationId(), s = get();
        if (id === 'split') return s.panes.split.path ? id : 'main';
        if (id.startsWith('sidebar:')) {
          const tab = s.rightTabs.find(tab => 'sidebar:' + tab.id === id);
          return tab && ((tab.side === 'left' ? s.leftOpen && s.leftActiveId === tab.id : s.rightOpen && s.rightActiveId === tab.id)) ? id : 'main';
        }
        return 'main';
      },
      currentPath: (viewId) => {
        const s = get(), id = viewId ?? s.currentViewId();
        return isPaneId(id) ? s.panes[id].path : s.rightTabs.find(tab => 'sidebar:' + tab.id === id)?.state.file ?? null;
      },
      recordNavigation: (before, after) => {
        if (before.viewId !== after.viewId) before = { path: after.path, viewId: after.viewId };
        set(state => {
          const stack = historyFor(state, after.viewId);
          const history = stack.history.slice(0, stack.histIndex + 1);
          const current = history.at(-1);
          if (current?.path === after.path && current.viewId === after.viewId && current.anchor === undefined
            && (before.path !== after.path || before.viewId !== after.viewId)) history[history.length - 1] = after;
          else {
            if (history.length) history[history.length - 1] = before; else history.push(before);
            if (before.path !== after.path || before.viewId !== after.viewId || before.anchor !== after.anchor || before.head !== after.head) history.push(after);
          }
          return historyPatch(state, after.viewId, history.slice(-100), Math.min(history.length, 100) - 1);
        });
      },
      navigate: async (path, request = {}) => {
        const source = request.source;
        let viewId = request.viewId ?? (source ? contextOf(source).navigationId : undefined) ?? get().currentViewId();
        const origin = source ? contextOf(source).sourcePath : get().currentPath(viewId) ?? path;
        const before = captureLocation(origin, viewId, source);
        if (request.disposition === 'side') viewId = 'split';
        if (isPaneId(viewId) && request.disposition !== 'tab') {
          if (!await openPane(viewId, path, false)) return;
        } else {
          const tab = get().rightTabs.find(tab => 'sidebar:' + tab.id === viewId);
          const id = await get().openSidebarTab(tab?.side ?? 'right', sidebarFileType(path), { file: path },
            request.disposition === 'tab' ? undefined : tab?.id);
          if (!id) return;
          viewId = 'sidebar:' + id;
          activateNavigation(viewId);
        }
        if (request.location?.mode) get().setViewMode(request.location.mode, viewId);
        if (!/\.(md|markdown)$/i.test(path)) {
          if (request.history !== false) get().recordNavigation(before, { path, viewId });
          return;
        }
        const result = await navigateTo(path, { ...request, viewId, history: false });
        if (result.status === 'opened' && request.history !== false) get().recordNavigation(before, result.location);
      },
      goBack: () => moveHistory(-1),
      goForward: () => moveHistory(1),
      vaultSessionStale: false,
      defaultViewMode: 'live',
      setViewMode: (mode, viewId = get().currentViewId(), key = viewKey(get(), viewId) ?? undefined) => set(s => key
        ? { viewOptions: { ...s.viewOptions, [key]: { ...s.viewOptions[key], mode } } }
        : { defaultViewMode: mode }),
      setPdfToolbarOpen: (toolbarOpen, viewId = get().currentViewId(), key = viewKey(get(), viewId) ?? undefined) => set(s => {
        return key ? { viewOptions: { ...s.viewOptions, [key]: { ...s.viewOptions[key], toolbarOpen } } } : {};
      }),
      togglePdfToolbar: (viewId = get().currentViewId()) => get().setPdfToolbarOpen(!toolbarOpenFor(get(), viewId), viewId),
      pdfDarkOverrides: {},
      setPdfDark: (path, dark) => set(state => Object.hasOwn(state.pdfDarkOverrides, path) && state.pdfDarkOverrides[path] === dark ? state
        : { pdfDarkOverrides: { ...state.pdfDarkOverrides, [path]: dark } }),

      expanded: [],
      toggleFolder: (path) =>
        set((s) => ({
          expanded: s.expanded.includes(path)
            ? s.expanded.filter((p) => p !== path)
            : [...s.expanded, path],
        })),
      setExpanded: (paths) => set({ expanded: paths }),
      treeSort: 'name-asc',
      setTreeSort: (treeSort) => set({ treeSort }),
      autoReveal: false,
      toggleAutoReveal: () => set((s) => ({ autoReveal: !s.autoReveal })),

      splitDirection: 'right',
      openToSide: async (key, direction) => {
        const state = get(), tab = state.tabs.find(item => tabKey(item) === key);
        if (direction && paneTabKey(state, 'split') === key) { set({ splitDirection: direction }); return; }
        await openPane(state.panes.main.path ? 'split' : 'main', tab?.path ?? key, true, { tabId: tab && key }, direction);
      },
      closeSplit: () => closeCentral('split', false),
      splitWithHomepage: async (key, direction) => {
        if (key && key !== paneTabKey(get())) {
          await get().showTab(key);
          if (paneTabKey(get()) !== key) return;
        }
        if (direction) set({ splitDirection: direction });
        await get().openHomepage('split');
      },
      parkedSplit: null,
      showTab: async key => {
        const s = get();
        if (key.startsWith('sidebar:')) { s.selectRightTab(key.slice(8)); return; }
        const tab = s.tabs.find(tab => tabKey(tab) === key), path = tab?.path ?? key;
        if (s.panes.split.path && (key === paneTabKey(s) || key === paneTabKey(s, 'split'))) {
          claimPanes(paneIds);
          activateNavigation(key === paneTabKey(s) ? 'main' : 'split'); return;
        }
        await s.openFile(path, true, 'main', { preserveHomepage: true, tabId: tab ? key : undefined, parkSplit: !!s.panes.split.path });
      },
      replacePane: async (viewId, key) => {
        const s = get(), opposite = otherPane(viewId), old = paneTabKey(s, viewId), other = paneTabKey(s, opposite);
        const target = s.tabs.find(tab => tabKey(tab) === key);
        if (!s.panes.split.path || !old || !other || old === key || !target || !canOpenWorkspaceContent(target.path)) return;
        const reorder = (state: AppState) => {
          const tabs = arrangeTabUnits(state.tabs, null, [key], [old], 'swap');
          return tabs ? { tabs } : {};
        };
        if (key === other) {
          claimPanes(paneIds);
          cancelNavigation(viewId); cancelNavigation(opposite);
          set(st => ({ ...reorder(st), panes: { ...st.panes, [viewId]: movePane(st.panes[opposite], viewId),
            [opposite]: movePane(st.panes[viewId], opposite) } }));
        } else {
          if (!await openPane(viewId, target.path, true, { preserveHomepage: true, tabId: key })) return;
          set(reorder);
        }
        activateNavigation(viewId);
      },
      swapTabs: async (source, target) => {
        if (source === target) return;
        let s = get();
        const pair = splitPair(s);
        const member = pair?.includes(source) ? source : pair?.includes(target) ? target : null;
        if (member && s.parkedSplit) {
          const parked = s.parkedSplit;
          await get().showTab(member); s = get();
          if (paneTabKey(s) !== (parked.mainId ?? parked.main) || paneTabKey(s, 'split') !== (parked.sideId ?? parked.side)) return;
        }
        if (s.panes.split.path && member) {
          const view = member === paneTabKey(s) ? 'main' : 'split';
          await get().replacePane(view, member === source ? target : source);
        } else get().arrangeTabs([source], [target], 'swap');
      },
      arrangeTabs: (source, target, mode) => set(s => {
        const tabs = arrangeTabUnits(s.tabs, splitPair(s), source, target, mode);
        return tabs ? { tabs } : {};
      }),
      arrangeSidebarTabs: (side, source, target, mode) => set(s => {
        const old = s.rightTabs.filter(tab => tabSide(tab) === side);
        const tabs = arrangeTabUnits(old, null, [source], target ? [target] : null, mode, sidebarTabKey);
        if (!tabs) return {};
        let index = 0;
        return { rightTabs: s.rightTabs.map(tab => tabSide(tab) === side ? tabs[index++] : tab) };
      }),
      closePane: viewId => closeCentral(viewId, true),

      recent: [],
      removeRecent: (path) => set((s) => ({ recent: s.recent.filter((p) => p !== path) })),
      movePath: null,
      setMovePath: (path) => set({ movePath: path }),

      selected: [],
      setSelected: (selected) => set({ selected }),
      selectAnchor: null,
      setSelectAnchor: (selectAnchor) => set({ selectAnchor }),
      clipboard: null,
      setClipboard: (c) => set({ clipboard: c }),
      bookmarks: [],
      toggleBookmark: (path) =>
        set((s) => ({
          bookmarks: s.bookmarks.includes(path)
            ? s.bookmarks.filter((p) => p !== path)
            : [...s.bookmarks, path],
        })),

      leftPanel: 'files',
      setLeftPanel: (p) => set({ leftPanel: p, leftActiveId: null, leftOpen: true }),
      rightPanel: 'backlinks',
      setRightPanel: (p) => set({ rightPanel: p, rightActiveId: null, rightOpen: true }),
      rightTabs: [],
      rightActiveId: null,
      leftActiveId: null,
      openRightTab: (type, state = {}, id) => get().openSidebarTab(get().rightTabs.find(tab => tab.id === id)?.side ?? 'right', type, state, id),
      openSidebarTab: async (side, type, state = {}, id) => {
        const tab = { ...sidebarTab(type, state, id), side, ...restoreTabGrouping(get().rightTabs.find(tab => tab.id === id) ?? {}) };
        cancelNavigation('sidebar:' + tab.id, state.file);
        const generation = ++rightGeneration;
        rightGenerations.set(tab.id, generation);
        const previous = get().rightTabs.find(item => item.id === tab.id);
        try {
          if (type !== previous?.type || state.file !== previous?.state.file) await saveLeavingDocument(get().tree, previous && sidebarFilePath(previous));
          const path = sidebarFilePath(tab);
          if (path && !canOpenWorkspaceContent(path)) throw new Error('当前宿主无法打开此内容');
          if (path) await prepareWorkspaceDocument(get().tree, path);
        } catch (error) {
          if (rightGenerations.get(tab.id) === generation) {
            rightGenerations.delete(tab.id);
            get().notify(String(error));
          }
          return null;
        }
        if (rightGenerations.get(tab.id) !== generation) return null;
        set(s => ({ rightTabs: s.rightTabs.some(item => item.id === tab.id)
          ? s.rightTabs.map(item => item.id === tab.id ? tab : item) : [...s.rightTabs, tab],
          ...(side === 'left' ? { leftActiveId: tab.id, leftOpen: true } : { rightActiveId: tab.id, rightOpen: true }) }));
        rightGenerations.delete(tab.id);
        activateNavigation('sidebar:' + tab.id);
        return tab.id;
      },
      updateRightTab: (id, patch) => set(s => ({ rightTabs: s.rightTabs.map(tab => tab.id === id ? { ...tab, ...patch } : tab) })),
      selectRightTab: (id) => set(s => {
        const tab = s.rightTabs.find(tab => tab.id === id);
        if (tab) activateNavigation('sidebar:' + id);
        return !tab ? {} : tab.side === 'left' ? { leftActiveId: id, leftOpen: true } : { rightActiveId: id, rightOpen: true };
      }),
      closeRightTab: async (id) => {
        const generation = ++rightGeneration;
        rightGenerations.set(id, generation);
        const tab = get().rightTabs.find(tab => tab.id === id);
        try { await saveLeavingDocument(get().tree, tab && sidebarFilePath(tab)); }
        catch (error) {
          if (rightGenerations.get(id) === generation) rightGenerations.delete(id);
          get().notify(String(error)); return;
        }
        if (rightGenerations.get(id) !== generation) return;
        set(s => {
          const current = s.rightTabs.find(tab => tab.id === id);
          if (current?.type !== tab?.type || current?.state.file !== tab?.state.file) return {};
          if (!tab) return {};
          const siblings = s.rightTabs.filter(item => tabSide(item) === tabSide(tab));
          const { next: neighbor } = removeFromStrip(siblings, id, item => item.id);
          const rightTabs = s.rightTabs.filter(tab => tab.id !== id);
          const next = neighbor?.id ?? null;
          if (getActiveNavigationId() === 'sidebar:' + id) activateNavigation(next ? 'sidebar:' + next : 'main');
          return { rightTabs, rightActiveId: s.rightActiveId === id ? next : s.rightActiveId,
            leftActiveId: s.leftActiveId === id ? next : s.leftActiveId,
            sidebarHistories: Object.fromEntries(Object.entries(s.sidebarHistories).filter(([key]) => key !== 'sidebar:' + id)) };
        });
        rightGenerations.delete(id);
      },
      searchQuery: '',
      searchFor: (q) => set({ searchQuery: q, leftPanel: 'search', leftActiveId: null, leftOpen: true }),
      leftOpen: true,
      rightOpen: true,
      toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
      toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
      mobileDrawer: null,
      setMobileDrawer: (d) => set({ mobileDrawer: d }),

      paletteOpen: false,
      paletteMode: 'all',
      paletteRightTab: null,
      pickRightNote: (id) => set({ paletteOpen: true, paletteMode: 'files', paletteRightTab: id }),
      setPalette: (v, mode = 'all') => set({ paletteOpen: v, paletteMode: mode, paletteRightTab: null }),
      settingsOpen: false,
      setSettings: (v) => set({ settingsOpen: v }),
      trashOpen: false,
      setTrash: (v) => set({ trashOpen: v }),
      setGraph: (v) => {
        if (v) {
          const state = get(), viewId = state.currentViewId();
          void (viewId === 'main' && !isHomepagePath(state.panes.main.path) ? state.showTab(GRAPH_PATH) : state.openFile(GRAPH_PATH, true, viewId))
            .catch(error => state.notify(String(error)));
        }
        else get().closeTab(GRAPH_PATH);
      },
      graphSettings: DEFAULT_GRAPH_SETTINGS,
      setGraphSettings: (patch) =>
        set((s) => ({ graphSettings: { ...s.graphSettings, ...patch } })),
      resetGraphSettings: () => set({ graphSettings: DEFAULT_GRAPH_SETTINGS }),

      contextMenu: null,
      openContextMenu: (m) => set({ contextMenu: m }),
      closeContextMenu: () => set({ contextMenu: null }),

      versionHistoryPath: null,
      setVersionHistory: (path) => set({ versionHistoryPath: path }),
      revealInTree: (path) => {
        // Expand every ancestor folder so the file's row is rendered, open the
        // Files panel, then let FileTree scroll the now-visible row into view.
        const segs = path.split('/');
        segs.pop();
        const ancestors: string[] = [];
        let acc = '';
        for (const s of segs) {
          acc = acc ? `${acc}/${s}` : s;
          ancestors.push(acc);
        }
        set((st) => ({
          expanded: Array.from(new Set([...st.expanded, ...ancestors])),
          leftPanel: 'files',
          leftActiveId: null,
          leftOpen: true,
        }));
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('wo-reveal-file', { detail: { path } }));
        }, 60);
      },

      toast: '',
      notify: (msg, ms = 2500) => {
        set({ toast: msg });
        if (ms > 0) {
          window.setTimeout(() => set((s) => (s.toast === msg ? { toast: '' } : {})), ms);
        }
      },

      // A central new tab is shown alone and leaves a split group intact, like selecting another tab;
      // only splitWithHomepage asks for a Homepage inside the split.
      openHomepage: (viewId) => {
        const path = `home://${crypto.randomUUID()}`, id = viewId ?? get().currentViewId();
        return id.startsWith('sidebar:') || viewId === 'split' ? get().openFile(path, true, id) : get().showTab(path);
      },
      openFile: async (path, recordHistory = true, viewId = get().currentViewId(), options) => {
        if (isPaneId(viewId)) { await openPane(viewId, path, recordHistory, options); return; }
        if (!canOpenWorkspaceContent(path)) return;
        const origin = get().currentPath(viewId), before = origin ? captureLocation(origin, viewId) : undefined;
        const tab = get().rightTabs.find(tab => 'sidebar:' + tab.id === viewId);
        if (!tab) return;
        const type = isHomepagePath(path) ? 'empty' : path === GRAPH_PATH ? 'graph' : sidebarFileType(path);
        if (!await get().openSidebarTab(tab.side ?? 'right', type, { file: path }, tab.id)) return;
        activateNavigation(viewId);
        set(s => {
          const { history, histIndex } = pushHistory(s, path, recordHistory, viewId, before);
          return { recent: recentFiles(s, path), ...historyPatch(s, viewId, history, histIndex) };
        });
      },

      openWikilink: async (target, sourcePath, intent = {}) => {
        const viewId = intent.viewId ?? (intent.source ? contextOf(intent.source).navigationId : undefined) ?? get().currentViewId(), generation = (linkGenerations.get(viewId) ?? 0) + 1;
        linkGenerations.set(viewId, generation);
        try {
          const origin = sourcePath ?? get().currentPath(viewId) ?? '';
          const resolved = target.startsWith('#') ? { path: origin } : await resolveContentLink(target, origin);
          if (linkGenerations.get(viewId) !== generation) return;
          const { path } = resolved;
          if (resolved.status === 'ambiguous' || resolved.status === 'denied') {
            get().notify(resolved.status === 'ambiguous' ? '链接有歧义：' + target : '不允许打开该链接');
            return;
          }
          if (path) {
            const fragment = parseLinkTarget(target).fragment;
            await get().navigate(path, { ...intent, viewId, fragment });
          }
          else {
            if (isGlobalContentTarget(target)) { get().notify('未找到引用目标：' + target); return; }
            // Only append `.md` when the target has no extension at all — a target
            // like `Foo.canvas` must stay `Foo.canvas`, not become `Foo.canvas.md`.
            const destination = resolved.normalizedTarget ?? parseLinkTarget(target).path;
            const hasExt = /\.[^./]+$/.test(destination);
            const newPath = await newFilePath(hasExt ? destination : `${destination}.md`, origin);
            await get().createNote(newPath, `# ${target.replace(/\.md$/, '')}\n`);
          }
        } catch (error) {
          get().notify('打开链接失败：' + String(error));
        }
      },

      closeTab: async key => {
        if (key.startsWith('sidebar:')) return get().closeRightTab(key.slice(8));
        const s = get(), tab = s.tabs.find(tab => tabKey(tab) === key);
        if (!tab) return;
        const pane = paneIds.find(id => paneTabKey(s, id) === key);
        if (pane) return closeCentral(pane, true);
        try { await saveLeavingDocument(s.tree, tab.path); }
        catch (error) { get().notify(String(error)); return; }
        const current = get();
        if (!current.tabs.some(item => tabKey(item) === key && item.path === tab.path)) return;
        const visible = paneIds.find(id => paneTabKey(current, id) === key);
        if (visible) return closeCentral(visible, true);
        const { tabs, parkedSplit } = removeCentralTab(current, key);
        set({ tabs, parkedSplit });
      },

      renamePath: async (from, requested, expectedRevision, virtualDocument) => {
        const to = requested.replace(/\\/g, '/');
        if (from === to) return;
        if (!to || to.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('请输入有效的仓库相对路径');
        if (to.startsWith(from + '/')) throw new Error('不能将文件夹移入自身');
        claimPanes(paneIds);
        const validate = expectedRevision === undefined ? undefined : () => {
          const snapshot = documents.get(from)?.snapshot;
          if (snapshot && (snapshot.dirty || snapshot.saving || snapshot.conflict || snapshot.revision !== expectedRevision))
            throw new Error('源笔记已改变，请重新提交重命名候选');
        };
        await documents.changePath(from, to, () => api.rename(from, to, expectedRevision, virtualDocument), () => {
          window.dispatchEvent(new CustomEvent('file-path-changed', { detail: { from, to } }));
          set(state => remapWorkspacePaths(state, from, to));
        }, validate);
        await get().loadTree();
      },
      removePath: async (path) => {
        claimPanes(paneIds);
        const result = await documents.changePath(path, undefined, () => api.remove(path), () => {
          set(state => remapWorkspacePaths(state, path));
        });
        await get().loadTree();
        return result;
      },

      setContent: (content) => {
        const path = get().panes.main.path;
        const doc = path ? documents.get(path) : undefined;
        if (!doc) return;
        doc.setRawText(content);
      },

      save: async (cause = 'manual') => {
        const editor = cause === 'manual' ? getActiveEditor() : null;
        const path = editor ? contextOf(editor).sourcePath : get().currentPath();
        if (path && TEXT_EXT_RE.test(path)) {
          if(cause==='manual')await manualSave(path);else await documents.get(path)?.save();
        }
      },

      createNote: async (path, body, applyTemplate = true, viewId = get().currentViewId()) => {
        const { sharedApp } = await import('./plugins');
        await sharedApp.vault.create(path, body ?? '', applyTemplate);
        await get().openFile(path, true, viewId);
      },

      newNote: async (dir, viewId = get().currentViewId()) => {
        // Pick the first free "Untitled" name in the target folder, like Shale.
        const active = get().currentPath(viewId) ?? '';
        const kind = workspaceContent(get().tree, active);
        const source = kind === 'folder' || kind === 'virtual' ? `${active}/_` : active;
        const base = (dir ?? await newFileFolder(source)).replace(/\/+$/, '');
        const folder = base ? findNode(get().tree, base) : get().tree;
        const taken = new Set((folder?.children ?? []).map((c) => c.name.toLowerCase()));
        let name = 'Untitled.md';
        for (let i = 1; taken.has(name.toLowerCase()); i++) name = `Untitled ${i}.md`;
        const path = base ? `${base}/${name}` : name;
        await get().createNote(path, '', true, viewId);
        if (base && !viewId.startsWith('sidebar:')) get().revealInTree(path);
      },

      renamingPath: null,
      setRenamingPath: (path) => set({ renamingPath: path }),

      newFolder: async (dir) => {
        // Create an "Untitled" folder (unique name) and drop straight into inline
        // rename — same as Shale, no prompt.
        const base = (dir ?? '').replace(/\/+$/, '');
        const parent = base ? findNode(get().tree, base) : get().tree;
        const taken = new Set((parent?.children ?? []).map((c) => c.name.toLowerCase()));
        let name = 'Untitled';
        for (let i = 1; taken.has(name.toLowerCase()); i++) name = `Untitled ${i}`;
        const path = base ? `${base}/${name}` : name;
        await api.createFolder(path);
        await get().loadTree();
        // Make sure the new row is rendered (expand ancestors + open the Files panel)…
        if (base) {
          const segs = base.split('/');
          const ancestors: string[] = [];
          let acc = '';
          for (const s of segs) { acc = acc ? `${acc}/${s}` : s; ancestors.push(acc); }
          set((st) => ({ expanded: Array.from(new Set([...st.expanded, ...ancestors])) }));
        }
        set({ leftPanel: 'files', leftActiveId: null, leftOpen: true, renamingPath: path });
      },

      hydrate: async () => {
        const initial = get(), current = claimPanes(paneIds);
        const failed = (await Promise.all(paneIds.map(async id => {
          const { path } = initial.panes[id];
          if (!path || workspaceContent(initial.tree, path) !== 'text') return;
          try { await documents.refresh(path); }
          catch (error) {
            if (current()) get().notify(String(error));
            return error instanceof ApiError && error.status === 404 ? id : undefined;
          }
        }))).filter((id): id is PaneId => !!id);
        if (!current() || !failed.length) return;
        set(s => {
          const keys = new Set(failed.map(id => paneTabKey(s, id)));
          const tabs = s.tabs.filter(tab => !keys.has(tabKey(tab)));
          const survivor = paneIds.find(id => !failed.includes(id) && s.panes[id].path);
          const main = survivor ? movePane(s.panes[survivor], 'main') : emptyPane;
          return { tabs, panes: { main, split: emptyPane } };
        });
        if (isPaneId(getActiveNavigationId())) activateNavigation('main');
        const fallback = get().tabs.at(-1);
        if (!get().panes.main.path && fallback) await get().showTab(tabKey(fallback));
      },

      loadUiState: async () => {
        const generation = ++workspaceLoadGeneration;
        canSave = false;
        try {
          const s = await api.getUiState();
          if (generation !== workspaceLoadGeneration) return;
          suppressSave = true;
          applyPersisted(s, set);
          lastSaved = JSON.stringify(pickPersisted(get()));
          desiredWorkspace = lastSaved;
          workspaceDirty = false;
          workspaceRetries = 0;
          canSave = true;
        } catch (error) {
          if (generation !== workspaceLoadGeneration) return;
          get().notify(`工作区读取失败，已暂停布局保存：${String(error)}`, 0);
          throw error;
        } finally {
          suppressSave = false;
        }
        await get().hydrate();
      },

      applyRemoteState: async (state, originId) => {
        if (originId === CLIENT_ID) return; // ignore echo of our own change
        const generation = ++remoteWorkspaceGeneration;
        if (!canSave || workspaceHasUnsavedChanges()) return;
        const prevActive = get().panes.main.path;
        const prevSplit = get().panes.split.path;
        await saveLeavingDocument(get().tree, get().panes.main.path);
        await saveLeavingDocument(get().tree, prevSplit);
        const incoming = restoreSidebarTabs(state.rightTabs, hasWebViewer());
        for (const tab of get().rightTabs) {
          const next = incoming.find(next => next.id === tab.id);
          if (!tab.state.file || next?.state.file === tab.state.file) continue;
          await saveLeavingDocument(get().tree, tab && sidebarFilePath(tab));
        }
        if (generation !== remoteWorkspaceGeneration || workspaceHasUnsavedChanges()) return;
        suppressSave = true;
        try {
          applyPersisted(state, set);
          lastSaved = JSON.stringify(pickPersisted(get()));
          desiredWorkspace = lastSaved;
        } finally { suppressSave = false; }
        if (get().panes.main.path !== prevActive || get().panes.split.path !== prevSplit) {
          await get().hydrate();
        }
      },
      });
    },
);

// Save durable workspace state to the server (debounced) whenever it changes.
useStore.subscribe((state, prev) => {
  if (state.tabs !== prev.tabs || state.rightTabs !== prev.rightTabs) {
    const keys = new Set([...state.tabs.map(tabKey), ...state.rightTabs.map(tab => 'sidebar:' + tab.id)]);
    const selectedTabs = state.selectedTabs.filter(key => keys.has(key));
    const viewOptions = Object.fromEntries(Object.entries(state.viewOptions).filter(([key]) => keys.has(key)));
    if (selectedTabs.length !== state.selectedTabs.length || Object.keys(viewOptions).length !== Object.keys(state.viewOptions).length) {
      useStore.setState({ selectedTabs, viewOptions });
    }
  }
  if (suppressSave) return;
  if (PERSIST_KEYS.some(key => state[key] !== prev[key]) || paneIds.some(id =>
    state.panes[id].path !== prev.panes[id].path || state.panes[id].tabId !== prev.panes[id].tabId)) {
    workspaceDirty = true;
    if (canSave) scheduleSave();
  }
});

documents.onError = error => useStore.getState().notify(String(error));
documents.isOpen = path => {
  const state = useStore.getState();
  return state.tabs.some(tab => tab.path === path) || state.panes.split.path === path || state.rightTabs.some(tab => tab.state.file === path)
    || [...document.querySelectorAll<HTMLElement>('[data-document-id]')].some(element => element.dataset.documentId === path);
};
documents.canRefresh = () => !useStore.getState().vaultSessionStale;
