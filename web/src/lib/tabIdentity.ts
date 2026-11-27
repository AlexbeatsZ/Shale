import type { Pane, PaneId } from './workspacePane';

/** Tab identity stays independent of the document and its shared save session. */
export const tabKey = (tab: { path: string; id?: string }): string => tab.id ?? tab.path;

export function resolveTabKey(tabs: { path: string; id?: string }[], path: string | null, id?: string | null) {
  const tab = tabs.find(tab => tabKey(tab) === id && tab.path === path) ?? tabs.find(tab => tab.path === path);
  return tab ? tabKey(tab) : path;
}

export function paneTabKey(state: { panes: Record<PaneId, Pane> }, pane: PaneId = 'main'): string | null {
  const { path, tabId } = state.panes[pane];
  return tabId ?? path;
}
