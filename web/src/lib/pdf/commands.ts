import { useStore } from '../store';
import { getPdfSession } from './react';
import { getVirtualReading } from '../virtualReading';

function currentPdf() {
  const state = useStore.getState(), path = state.currentPath(), view = state.currentViewId();
  const direct = getPdfSession(path, view);
  if (direct) return direct;
  const reader = getVirtualReading(path, view), snapshot = reader?.getSnapshot();
  return snapshot?.activeSource ? getPdfSession(snapshot.activeSource, 'virtual:' + view) : null;
}
export const pdfFilterCommand = {
  id: 'pdf:toggle-dark', title: '切换 PDF / PPT 反色（深色背景适配）',
  available: () => !!currentPdf(),
  run: () => currentPdf()?.toggleDark(),
};
