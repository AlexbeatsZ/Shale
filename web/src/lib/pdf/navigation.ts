import { useEffect, useRef, type RefObject } from 'react';
import { usePdfSnapshot } from './react';
import type { PdfSession } from './session';

export function scrollToPdfPage(root: HTMLElement | null, pages: HTMLElement | null, page: number, inset: number) {
  const slot = pages?.querySelector<HTMLElement>(`[data-page-number="${page}"]`);
  if (!slot || !root) return false;
  root.scrollTop += slot.getBoundingClientRect().top - root.getBoundingClientRect().top - inset;
  return true;
}

/** Observe and navigate the same page slots in a local or aggregate scroller. */
export function usePagedNavigation(session: PdfSession, root: RefObject<HTMLElement>, pages: RefObject<HTMLElement>,
  onNavigate?: (page: number) => void) {
  const state = usePdfSnapshot(session);
  const navigation = useRef(0), scrollTarget = useRef<number>();
  const navigate = useRef(onNavigate); navigate.current = onNavigate;
  useEffect(() => {
    if (state.navigation === navigation.current) return;
    navigation.current = state.navigation;
    if (navigate.current) navigate.current(state.currentPage);
    else if (scrollToPdfPage(root.current, pages.current, state.currentPage, 16)) scrollTarget.current = root.current?.scrollTop;
  }, [root, pages, state.navigation, state.currentPage]);
  useEffect(() => {
    const viewport = root.current;
    if (!viewport) return;
    let frame = 0;
    const scroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const host = pages.current;
        if (!host) return;
        if (scrollTarget.current !== undefined) {
          if (Math.abs(viewport.scrollTop - scrollTarget.current) < 1) return;
          scrollTarget.current = undefined;
        }
        const bounds = host.getBoundingClientRect(), visible = viewport.getBoundingClientRect();
        if (bounds.bottom < visible.top || bounds.top > visible.bottom) return;
        const slots = host.querySelectorAll<HTMLElement>('[data-page-number]');
        let low = 0, high = slots.length - 1;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (slots[middle].getBoundingClientRect().top <= visible.top + 32) low = middle;
          else high = middle - 1;
        }
        if (slots[low]) session.observePage(Number(slots[low].dataset.pageNumber));
      });
    };
    viewport.addEventListener('scroll', scroll, { passive: true });
    return () => { viewport.removeEventListener('scroll', scroll); cancelAnimationFrame(frame); };
  }, [root, pages, session, state.pageCount]);
}
