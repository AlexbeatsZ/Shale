import type { PdfSession } from '../lib/pdf/session';
import { usePdfSnapshot } from '../lib/pdf/react';
import OutlineTree, { pagedOutline } from './OutlineTree';
import '../styles/pdf.css';

export default function PdfOutlinePanel({ session }: { session: PdfSession }) {
  const state = usePdfSnapshot(session);
  const label = session.label;
  if (state.status === 'loading') return <p className="pdf-panel-message" role="status">正在读取 {label} 目录…</p>;
  if (state.status !== 'ready') return <p className="pdf-panel-message" role="alert">{state.error || `${label} 已关闭`}</p>;
  if (state.outlineError) return <p className="pdf-panel-message" role="alert">{label} 目录读取失败：{state.outlineError}</p>;
  if (!state.outline.length) return <p className="pdf-panel-message">此 {label} 没有内置目录。</p>;
  return <OutlineTree key={session.path} owner={session} className="pdf-outline" label={label === 'PDF' ? 'PDF 内置目录' : 'PPT 幻灯片大纲'}
    nodes={pagedOutline(state.outline, session.path, state.currentPage, page => page)} onNavigate={session.goToPage} />;
}
