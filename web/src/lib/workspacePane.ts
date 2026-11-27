import type { NavigationLocation } from './fragmentNavigation';

export type PaneId = 'main' | 'split';
export type ViewMode = 'live' | 'source' | 'reading';

export interface NavigationHistory {
  history: NavigationLocation[];
  histIndex: number;
}

export interface Pane extends NavigationHistory {
  path: string | null;
  tabId: string | null;
}

export const emptyHistory: NavigationHistory = { history: [], histIndex: -1 };
export const emptyPane: Pane = { path: null, tabId: null, ...emptyHistory };
export const paneIds = ['main', 'split'] as const;
export const otherPane = (id: PaneId): PaneId => id === 'main' ? 'split' : 'main';
export const isPaneId = (id: string): id is PaneId => id === 'main' || id === 'split';

// A multi-pane operation claims both slots before it awaits any I/O.
const generation = { main: 0, split: 0 };
export function claimPanes(ids: readonly PaneId[]) {
  const claims = ids.map(id => ({ id, version: ++generation[id] }));
  return () => claims.every(({ id, version }) => generation[id] === version);
}
