import type { Tab } from './store';

/** Central tabs dragged onto a workspace pane; dragover cannot read transfer data, so the path is kept here.
 *  `path` is the single page a pane drop would open (null when a whole split group is dragged). */
export const TAB_DRAG_TYPE = 'application/x-webobsidian-tab';
export const tabDrag: { path: string | null } = { path: null };

/** Hovering a tab this long while dragging turns "swap with it" into "insert before it". */
export const TAB_INSERT_DWELL_MS = 450;
/** Touch: hold this long on a tab before it lifts for dragging (moving earlier scrolls the strip). */
export const TAB_TOUCH_LIFT_MS = 350;

/** Tab-bar units mirror WorkspaceTabs: a split group sits at its main page's place (or the end). */
export function arrangeTabUnits(tabs: Tab[], pair: string[] | null, source: string[], target: string[] | null, mode: 'swap' | 'before'): Tab[] | null {
  const units: Tab[][] = [];
  const groupUnit = pair ? tabs.filter(tab => pair.includes(tab.path)).sort((a, b) => pair.indexOf(a.path) - pair.indexOf(b.path)) : [];
  for (const tab of tabs) {
    if (pair?.includes(tab.path)) { if (tab.path === pair[0]) units.push(groupUnit); }
    else units.push([tab]);
  }
  if (pair && groupUnit.length && !tabs.some(tab => tab.path === pair[0])) units.push(groupUnit);
  const find = (paths: string[]) => units.findIndex(unit => unit.some(tab => paths.includes(tab.path)));
  const from = find(source);
  if (from < 0) return null;
  if (target === null) {
    if (mode !== 'before' || from === units.length - 1) return null;
    units.push(...units.splice(from, 1));
    return units.flat();
  }
  const to = find(target);
  if (to < 0 || to === from) return null;
  if (mode === 'swap') [units[from], units[to]] = [units[to], units[from]];
  else {
    if (to === from + 1) return null;
    const [moved] = units.splice(from, 1);
    units.splice(to > from ? to - 1 : to, 0, moved);
  }
  return units.flat();
}
