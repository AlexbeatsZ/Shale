import { useStore } from './store';
import { hasWebViewer } from './platform';

export function openWebViewer(sidebarId?: string) {
  if (hasWebViewer()) return useStore.getState().openRightTab('webviewer', { url: '' }, sidebarId);
}
