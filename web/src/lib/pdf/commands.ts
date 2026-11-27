import { useStore } from '../store';
import { currentPdfFor } from './react';

export function currentPdf() {
  const state = useStore.getState();
  return currentPdfFor(state.currentPath(), state.currentViewId());
}
export const pdfFilterCommand = {
  id: 'pdf:toggle-dark', title: '切换 PDF / PPT 反色（深色背景适配）',
  available: () => !!currentPdf(),
  run: () => currentPdf()?.toggleDark(),
};
