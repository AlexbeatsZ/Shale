/** Central file paths remain document identities; only duplicate views need a separate tab id. */
export const tabKey = (tab: { path: string; id?: string }): string => tab.id ?? tab.path;

export interface CentralTabIdentity {
  tabs: { path: string; id?: string }[];
  activePath: string | null;
  splitPath: string | null;
  activeTabId?: string | null;
  splitTabId?: string | null;
}

export function paneTabKey(state: CentralTabIdentity, pane: 'main' | 'split' = 'main'): string | null {
  const path = pane === 'main' ? state.activePath : state.splitPath;
  const id = pane === 'main' ? state.activeTabId : state.splitTabId;
  const tab = state.tabs.find(tab => tabKey(tab) === id && tab.path === path) ?? state.tabs.find(tab => tab.path === path);
  return tab ? tabKey(tab) : path;
}
