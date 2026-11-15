import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

export const PDF_MIN_ZOOM = 0.5;
export const PDF_MAX_ZOOM = 3;

export function clampPdfZoom(value: number): number {
  return Math.min(PDF_MAX_ZOOM, Math.max(PDF_MIN_ZOOM, Math.round(value * 1000) / 1000));
}

export function wheelPixels(event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
  return event.deltaY * unit;
}

interface PdfZoomAnchor {
  page: HTMLElement;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

interface PdfZoomOptions {
  zoom: number;
  setZoom: (zoom: number) => void;
  accepts?: (event: WheelEvent) => boolean;
  beforeChange?: (next: number, previous: number, page: HTMLElement) => void;
  afterChange?: (page: HTMLElement) => void;
}

/** Resize rendered pages around their own coordinates, including in a shared scroll container. */
export function usePdfZoom(root: RefObject<HTMLElement>, options: PdfZoomOptions) {
  const current = useRef(options); current.current = options;
  const pending = useRef<PdfZoomAnchor>();
  const queued = useRef(0);
  const frame = useRef(0);
  const point = useRef<{ clientX: number; clientY: number }>();

  const changeZoom = (value: number, position?: { clientX: number; clientY: number }) => {
    const element = root.current, state = current.current;
    const next = clampPdfZoom(value);
    if (!element || next === state.zoom) return;
    const viewport = element.getBoundingClientRect();
    const clientX = position?.clientX ?? viewport.left + element.clientWidth / 2;
    const clientY = position?.clientY ?? viewport.top + element.clientHeight / 2;
    const pages = [...element.querySelectorAll<HTMLElement>('.pdf-page-slot')];
    const page = pages.find(page => {
      const bounds = page.getBoundingClientRect();
      return bounds.top <= clientY && bounds.bottom >= clientY;
    }) ?? pages.find(page => page.getBoundingClientRect().bottom > viewport.top);
    if (!page) return;
    const bounds = page.getBoundingClientRect();
    pending.current = { page, clientX, clientY,
      x: Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height)) };
    state.beforeChange?.(next, state.zoom, page);
    state.setZoom(next);
  };
  const change = useRef(changeZoom); change.current = changeZoom;

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || !event.deltaY || current.current.accepts?.(event) === false) return;
      event.preventDefault(); event.stopPropagation();
      queued.current += wheelPixels(event);
      point.current = { clientX: event.clientX, clientY: event.clientY };
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const delta = Math.max(-400, Math.min(400, queued.current)); queued.current = 0;
        change.current(current.current.zoom * Math.exp(-delta * 0.0015), point.current);
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { element.removeEventListener('wheel', wheel); cancelAnimationFrame(frame.current); };
  }, [root]);

  useLayoutEffect(() => {
    const anchor = pending.current, element = root.current;
    if (!anchor || !element) return;
    pending.current = undefined;
    try {
      if (anchor.page.isConnected) {
        const bounds = anchor.page.getBoundingClientRect();
        element.scrollTop += bounds.top + bounds.height * anchor.y - anchor.clientY;
        element.scrollLeft += bounds.left + bounds.width * anchor.x - anchor.clientX;
      }
    } finally { current.current.afterChange?.(anchor.page); }
  }, [options.zoom, root]);

  return changeZoom;
}
