import type { Tab } from './store';
import { tabKey } from './tabIdentity';

/** Central tabs dragged onto a workspace pane; dragover cannot read transfer data, so the path is kept here.
 *  `path` is the single page a pane drop would open (null when a whole split group is dragged). */
export const TAB_DRAG_TYPE = 'application/x-shale-tab';
export const tabDrag: { path: string | null } = { path: null };
export const SIDEBAR_TAB_DRAG_TYPE = 'application/x-shale-sidebar-tab';

/** Hovering a tab this long while dragging turns "swap with it" into "insert before it". */
export const TAB_INSERT_DWELL_MS = 450;
/** Touch: hold this long on a tab before it lifts for dragging (moving earlier scrolls the strip). */
export const TAB_TOUCH_LIFT_MS = 350;

/** Tab-bar units mirror WorkspaceTabs: a split group sits at its main page's place (or the end). */
export function arrangeTabUnits<T = Tab>(tabs: T[], pair: string[] | null, source: string[], target: string[] | null,
  mode: 'swap' | 'before', key = tabKey as (tab: T) => string): T[] | null {
  // Swaps always name exactly two pages. Split membership is updated by swapTabs.
  if (mode === 'swap') {
    if (source.length !== 1 || target?.length !== 1 || pair?.some(path => source.includes(path) || target.includes(path))) return null;
    const from = tabs.findIndex(tab => key(tab) === source[0]), to = tabs.findIndex(tab => key(tab) === target[0]);
    if (from < 0 || to < 0 || from === to) return null;
    const result = [...tabs]; [result[from], result[to]] = [result[to], result[from]];
    return result;
  }
  const units: T[][] = [];
  const groupUnit = pair ? tabs.filter(tab => pair.includes(key(tab))).sort((a, b) => pair.indexOf(key(a)) - pair.indexOf(key(b))) : [];
  for (const tab of tabs) {
    if (pair?.includes(key(tab))) { if (key(tab) === pair[0]) units.push(groupUnit); }
    else units.push([tab]);
  }
  if (pair && groupUnit.length && !tabs.some(tab => key(tab) === pair[0])) units.push(groupUnit);
  const find = (paths: string[]) => units.findIndex(unit => unit.some(tab => paths.includes(key(tab))));
  const from = find(source);
  if (from < 0) return null;
  if (target === null) {
    if (mode !== 'before' || from === units.length - 1) return null;
    units.push(...units.splice(from, 1));
    return units.flat();
  }
  const to = find(target);
  if (to < 0 || to === from) return null;
  {
    if (to === from + 1) return null;
    const [moved] = units.splice(from, 1);
    units.splice(to > from ? to - 1 : to, 0, moved);
  }
  return units.flat();
}
