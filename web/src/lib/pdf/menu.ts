import type { PdfSession } from './session';
import type { RenderMenuItem } from '../renderContext';
import { fileManagerMenuItems } from '../revealInFileManager';
import { useStore } from '../store';

export function pdfMenuItems(session: PdfSession): RenderMenuItem[] {
  return [
    { id: 'pdf:toggle-dark', label: `${session.label} 反色`, checked: session.getSnapshot().dark, onClick: session.toggleDark },
    ...fileManagerMenuItems(session.path, false, useStore.getState().notify),
  ];
}
