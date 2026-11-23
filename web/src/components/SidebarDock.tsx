import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SPLIT_LAYOUT_EVENT, splitBoundaryX } from '../lib/splitLayout';

const MIN_WIDTH = 180, MAX_WIDTH = 900, SNAP_DISTANCE = 14;

/** One floating shell and resize lifecycle for both sides. Width stays device-local.
 *  Dragging the inner edge near a left/right split boundary snaps the sidebar to it;
 *  while snapped the sidebar follows that boundary, so it covers exactly one page. */
export default function SidebarDock({ side, open, rail, children }: {
  side: 'left' | 'right'; open: boolean; rail: ReactNode; children: (presented: boolean) => ReactNode;
}) {
  const stopDrag = useRef<(() => void) | undefined>();
  const dock = useRef<HTMLElement>(null);
  // Keep mounted content until the one shell finishes closing, so its rail and
  // panel move together. The caller's open prop remains the expansion state.
  const [retained, setRetained] = useState(open);
  useEffect(() => {
    if (open) { setRetained(true); return; }
    const timer = window.setTimeout(() => setRetained(false), 180);
    return () => window.clearTimeout(timer);
  }, [open]);
  const property = side === 'left' ? '--sidebar-width' : '--right-width';
  const storage = side === 'left' ? 'wo-sidebar-width' : 'wo-right-sidebar-width';
  const snapStorage = `${storage}-snap`;
  const snapped = useRef(false);
  const setWidth = (width: number) => document.documentElement.style.setProperty(property, `${Math.round(width)}px`);
  const save = () => {
    try {
      localStorage.setItem(storage, document.documentElement.style.getPropertyValue(property).replace('px', ''));
      localStorage.setItem(snapStorage, snapped.current ? '1' : '0');
    } catch { /* optional */ }
  };
  /** Panel width that puts the dock's inner edge on the split boundary, if there is one. */
  const snapWidth = () => {
    const shell = dock.current, panel = shell?.querySelector<HTMLElement>(':scope > .dock-panel'), host = shell?.parentElement;
    const boundary = splitBoundaryX();
    if (!shell || !panel || !host || boundary === null) return null;
    const box = host.getBoundingClientRect(), chrome = shell.offsetWidth - panel.offsetWidth;
    const width = side === 'left' ? boundary - box.left - chrome : box.right - boundary - chrome;
    return width >= MIN_WIDTH && width <= window.innerWidth - 60 ? width : null;
  };
  useEffect(() => {
    try {
      const width = Number(localStorage.getItem(storage));
      snapped.current = localStorage.getItem(snapStorage) === '1';
      // A width snapped to a wide split may exceed the free-drag maximum.
      if (Number.isFinite(width) && width >= MIN_WIDTH && width <= (snapped.current ? window.innerWidth - 60 : MAX_WIDTH)) setWidth(width);
    } catch { /* Device storage can be unavailable. */ }
    // A snapped sidebar follows the boundary when the split is resized, swapped
    // direction or the window changes size; without a split it keeps its width.
    const follow = () => {
      if (!snapped.current || stopDrag.current) return;
      const width = snapWidth();
      if (width !== null) setWidth(width);
    };
    follow();
    window.addEventListener(SPLIT_LAYOUT_EVENT, follow);
    window.addEventListener('resize', follow);
    return () => {
      stopDrag.current?.();
      window.removeEventListener(SPLIT_LAYOUT_EVENT, follow);
      window.removeEventListener('resize', follow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property, storage]);
  useEffect(() => { if (!open) stopDrag.current?.(); }, [open]);
  return <aside ref={dock} className={`sidebar-dock dock-${side}${open ? ' is-open' : ''}`} aria-label={side === 'left' ? '左侧栏' : '右侧栏'} aria-hidden={!open}>
    {rail}
    <div className="dock-panel">{children(open || retained)}</div>
    <div className="sidebar-resizer" role="separator" aria-orientation="vertical" aria-label="调整侧栏宽度" tabIndex={open ? 0 : -1}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const current = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue(property), 10);
        setWidth(Math.max(MIN_WIDTH, Math.min(window.innerWidth - 60, MAX_WIDTH, current + (event.key === 'ArrowRight' ? 20 : -20) * (side === 'left' ? 1 : -1))));
        snapped.current = false;
        save();
      }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); stopDrag.current?.();
        const start = event.clientX;
        const resizer = event.currentTarget;
        const panel = resizer.parentElement!.querySelector('.dock-panel')!;
        const initial = panel.getBoundingClientRect().width;
        const target = snapWidth();
        document.body.classList.add('wo-col-resizing');
        resizer.classList.add('active');
        const move = (next: PointerEvent) => {
          const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - 60, Math.round(initial + (next.clientX - start) * (side === 'left' ? 1 : -1))));
          // Near the split boundary the edge sticks to it (it may exceed the free-drag maximum).
          const raw = initial + (next.clientX - start) * (side === 'left' ? 1 : -1);
          snapped.current = target !== null && Math.abs(raw - target) <= SNAP_DISTANCE;
          setWidth(snapped.current && target !== null ? target : width);
        };
        const stop = () => {
          document.body.classList.remove('wo-col-resizing');
          resizer.classList.remove('active');
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop);
          save();
          stopDrag.current = undefined;
        };
        stopDrag.current = stop;
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
      }} />
  </aside>;
}
