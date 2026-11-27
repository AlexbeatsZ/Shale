import type { TabGrouping } from './tabGroups';
import type { SidebarTab } from './sidebarTabs';
import { tabKey } from './tabIdentity';

export interface TabProperties extends TabGrouping {
  id?: string;
  title: string;
}

type Sidebar = 'left' | 'right';
export type TabStrip = 'center' | Sidebar;
export const sidebarTabKey = (tab: { id: string }) => 'sidebar:' + tab.id;
export const tabSide = (tab: SidebarTab) => tab.side ?? 'right';
export const sidebarFilePath = (tab: SidebarTab): string | null =>
  tab.type === 'markdown' || tab.type === 'file' ? tab.state.file : null;

export function tabStrip(state: { tabs: (TabProperties & { path: string })[]; rightTabs: SidebarTab[] }, strip: TabStrip) {
  if (strip === 'center') return state.tabs.map(tab => ({ key: tabKey(tab), tab, path: tab.path }));
  return state.rightTabs.filter(tab => tabSide(tab) === strip)
    .map(tab => ({ key: sidebarTabKey(tab), tab, path: sidebarFilePath(tab) }));
}

export function tabStripFor(state: { rightTabs: SidebarTab[] }, key: string): TabStrip {
  const tab = state.rightTabs.find(tab => sidebarTabKey(tab) === key);
  return tab ? tabSide(tab) : 'center';
}

export function removeFromStrip<T>(tabs: readonly T[], key: string, getKey: (tab: T) => string) {
  const at = tabs.findIndex(tab => getKey(tab) === key);
  if (at < 0) return { remaining: [...tabs], next: undefined };
  const remaining = tabs.filter(tab => getKey(tab) !== key);
  return { remaining, next: remaining[Math.min(at, remaining.length - 1)] };
}
