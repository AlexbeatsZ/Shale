import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore, toolbarOpenFor } from '../lib/store';
import { usePdfSnapshot } from '../lib/pdf/react';
import { PDF_MAX_ZOOM, PDF_MIN_ZOOM } from '../lib/pdf/zoom';
import type { PdfSession } from '../lib/pdf/session';
import Icon from './Icon';

export function usePagedToolbar(viewId: string, available: boolean, tabId?: string) {
  const visible = useStore(s => toolbarOpenFor(s, viewId, tabId));
  const search = useRef<HTMLInputElement>(null), focusSearch = useRef(false);
  const focus = () => { search.current?.focus(); search.current?.select(); };
  useEffect(() => {
    if (!visible || !available || !focusSearch.current) return;
    focusSearch.current = false;
    focus();
  }, [visible, available]);
  const onFind = (event: KeyboardEvent) => {
    if (!available || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f'
      || (event.target as HTMLElement).closest('.cm-editor')) return;
    event.preventDefault();
    event.stopPropagation();
    if (!visible) { focusSearch.current = true; useStore.getState().setPdfToolbarOpen(true, viewId, tabId); }
    else focus();
  };
  return { visible, search, onFind };
}

export function PagedToolbar({ session, viewId, zoom, setZoom, visible, search }: {
  session: PdfSession; viewId: string; zoom: number; setZoom: (zoom: number) => void;
  visible: boolean; search: React.RefObject<HTMLInputElement>;
}) {
  const state = usePdfSnapshot(session), label = session.label;
  const [pageInput, setPageInput] = useState(String(state.currentPage));
  useEffect(() => { setPageInput(String(state.currentPage)); }, [state.currentPage]);
  const selected = state.activeMatch >= 0 ? state.activeMatch + 1 : 0;
  return <>
    {visible && <div className="pdf-toolbar is-overlay" data-pdf-toolbar={viewId} role="toolbar" aria-label={`${label} 阅读工具`}>
      <span className="pdf-filename" title={session.path}>{session.path.split('/').pop()}</span>
      <button className="tool-btn" aria-label="上一页" disabled={state.currentPage <= 1} onClick={() => session.goToPage(state.currentPage - 1)}><Icon name="chevron-up" /></button>
      <label className="pdf-page-control"><input aria-label={`${label} 页码`} inputMode="numeric" value={pageInput} onChange={event => setPageInput(event.target.value)}
        onBlur={() => session.goToPage(Number(pageInput))} onKeyDown={event => { if (event.key === 'Enter') session.goToPage(Number(pageInput)); }} /><span>/ {state.pageCount}</span></label>
      <button className="tool-btn" aria-label="下一页" disabled={state.currentPage >= state.pageCount} onClick={() => session.goToPage(state.currentPage + 1)}><Icon name="chevron-down" /></button>
      <button className="tool-btn" aria-label={`缩小 ${label}`} disabled={zoom <= PDF_MIN_ZOOM} onClick={() => setZoom(zoom - 0.25)}><Icon name="minus" /></button>
      <button className="pdf-zoom" onClick={() => setZoom(1)} title="适合宽度">{Math.round(zoom * 100)}%</button>
      <button className="tool-btn" aria-label={`放大 ${label}`} disabled={zoom >= PDF_MAX_ZOOM} onClick={() => setZoom(zoom + 0.25)}><Icon name="plus" /></button>
      <button className="tool-btn" aria-label={`${label} 反色`} title={`${label} 反色`} aria-pressed={state.dark} onClick={session.toggleDark}><Icon name="moon" /></button>
      <div className="pdf-search">
        <Icon name="search" /><input ref={search} type="search" aria-label={`搜索 ${label}`} placeholder={`搜索 ${label}`} value={state.query} onChange={event => session.setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); session.nextMatch(event.shiftKey ? -1 : 1); } }} />
        <span role="status">{state.query ? `${selected}/${state.matches.length}${state.truncated ? '+' : ''}` : ''}</span>
        <button className="tool-btn" aria-label={`上一个 ${label} 匹配`} disabled={!state.matches.length} onClick={() => session.nextMatch(-1)}><Icon name="chevron-up" /></button>
        <button className="tool-btn" aria-label={`下一个 ${label} 匹配`} disabled={!state.matches.length} onClick={() => session.nextMatch(1)}><Icon name="chevron-down" /></button>
      </div>
    </div>}
    {state.searchPending && <div className="pdf-message" role="status">正在搜索 {state.searchedPages}/{state.pageCount} 页…</div>}
    {!state.searchPending && state.query && !state.matches.length && <div className="pdf-message" role="status">{label === 'PDF' ? '未找到匹配文字。扫描图像 PDF 需要先有文字层。' : '未找到匹配文字。'}</div>}
    {state.error && <div className="pdf-message" role="alert">{state.error}</div>}
  </>;
}
