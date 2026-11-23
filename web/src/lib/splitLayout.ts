/** Device-local share of the central split taken by the main (left/top) page, plus a
 *  layout signal so a sidebar snapped to the split boundary can follow it. */
const STORAGE = 'wo-split-ratio';
export const SPLIT_LAYOUT_EVENT = 'wo-split-layout';
export const MIN_SPLIT_RATIO = 0.15;

export const clampSplitRatio = (ratio: number) =>
  Number.isFinite(ratio) ? Math.min(1 - MIN_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio)) : 0.5;

export function loadSplitRatio(): number {
  try {
    const stored = localStorage.getItem(STORAGE);
    return stored === null ? 0.5 : clampSplitRatio(Number(stored));
  } catch { return 0.5; }
}

export function saveSplitRatio(ratio: number) {
  try { localStorage.setItem(STORAGE, String(clampSplitRatio(ratio))); } catch { /* Device storage can be unavailable. */ }
}

/** Applies the ratio to the editor area's pane flex shares without a React render. */
export function applySplitRatio(area: HTMLElement, ratio: number) {
  const main = clampSplitRatio(ratio);
  area.style.setProperty('--split-main', String(main));
  area.style.setProperty('--split-side', String(1 - main));
  notifySplitLayout();
}

export function notifySplitLayout() { window.dispatchEvent(new Event(SPLIT_LAYOUT_EVENT)); }

/** X coordinate of the left/right split boundary, or null without a side-by-side split. */
export function splitBoundaryX(): number | null {
  const divider = document.querySelector<HTMLElement>('.app > .workspace > .editor-area:not(.split-down) > .pane-divider');
  if (!divider) return null;
  const rect = divider.getBoundingClientRect();
  return rect.width || rect.height ? rect.left + rect.width / 2 : null;
}
