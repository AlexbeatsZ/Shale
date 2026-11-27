import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PdfSession } from '../lib/pdf/session';
import { activatePdfSession, usePagedSession, usePdfSnapshot } from '../lib/pdf/react';
import PdfPage, { usePdfVisible } from './PdfPage';
import { PagedToolbar, usePagedToolbar } from './PagedToolbar';
import { usePagedNavigation } from '../lib/pdf/navigation';
import { useStore } from '../lib/store';
import { usePdfZoom } from '../lib/pdf/zoom';
import { pagedDocumentLabel } from '../lib/pdf/documentResource';
import { pdfMenuItems } from '../lib/pdf/menu';
import '../styles/pdf.css';

export function PageSlot({ session, page, width, root, anchorWithin, onLayoutScroll }: {
  session: PdfSession; page: number; width: number; root: React.RefObject<HTMLDivElement>; anchorWithin?: React.RefObject<HTMLElement>;
  onLayoutScroll?: (delta: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const visible = usePdfVisible(root, host);
  const [ratio, setRatio] = useState(session.resource?.pageRatio ?? 792 / 612);
  const previousHeight = useRef(width * ratio);
  useLayoutEffect(() => {
    const height = width * ratio, delta = height - previousHeight.current;
    previousHeight.current = height;
    const top = root.current?.getBoundingClientRect().top ?? 0, scope = anchorWithin?.current?.getBoundingClientRect();
    if (delta && page < session.getSnapshot().currentPage && root.current && (!anchorWithin || scope && scope.top <= top && scope.bottom > top)) {
      if (onLayoutScroll) onLayoutScroll(delta); else root.current.scrollTop += delta;
    }
  }, [width, ratio, page, root, session, anchorWithin, onLayoutScroll]);
  return <div ref={host} className="pdf-page-slot" data-page-number={page} style={{ width, height: width * ratio }}>
    {visible && <PdfPage session={session} page={page} width={width} onSize={setRatio} />}
  </div>;
}

function Reader({ session, viewId, tabId }: { session: PdfSession; viewId: string; tabId?: string }) {
  const state = usePdfSnapshot(session);
  const label = session.label;
  const viewport = useRef<HTMLDivElement>(null);
  const toolbar = usePagedToolbar(viewId, true, tabId);
  const [available, setAvailable] = useState(780);
  const zoom = state.zoom;
  const setZoom = usePdfZoom(viewport, { zoom, setZoom: session.setZoom });
  const width = Math.max(180, Math.min(available - 40, 900) * zoom);
  usePagedNavigation(session, viewport, viewport);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(entries => setAvailable(entries[0].contentRect.width));
    observer.observe(viewport.current); return () => observer.disconnect();
  }, []);
  return <section className="pdf-viewer" data-pdf-path={session.path} data-document-format={label.toLowerCase()} onPointerDown={() => activatePdfSession(session)}
    onFocusCapture={() => activatePdfSession(session)} onContextMenu={event => {
      event.preventDefault(); event.stopPropagation();
      useStore.getState().openContextMenu({ x: event.clientX, y: event.clientY, items: pdfMenuItems(session) });
    }} onKeyDown={toolbar.onFind}>
    <PagedToolbar session={session} viewId={viewId} zoom={zoom} setZoom={setZoom} {...toolbar} />
    <div className="pdf-pages" ref={viewport} role="region" tabIndex={0} aria-label={`${label} 页面`}>
      {state.status === 'loading' && <p className="pdf-message" role="status">正在打开 {label}…</p>}
      {state.status === 'ready' && Array.from({ length: state.pageCount }, (_, index) =>
        <PageSlot key={index} session={session} page={index + 1} width={width} root={viewport} />)}
    </div>
  </section>;
}

export default function PdfViewer({ path, viewId = 'main', tabId }: { path: string; viewId?: string; tabId?: string }) {
  const stale = useStore(state => state.vaultSessionStale);
  const session = usePagedSession(path, viewId);
  if (stale) return <div className="pdf-message" role="alert">Vault 已切换，请重新加载应用；旧文档会话保留</div>;
  if (!session) return <p className="pdf-message">正在打开 {pagedDocumentLabel(path)}…</p>;
  return <Reader key={path + viewId} session={session} viewId={viewId} tabId={tabId} />;
}
