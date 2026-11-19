import { isHomepagePath, useStore } from './store';
import { hasWebViewer } from './platform';

export async function openWebViewer(viewId = useStore.getState().currentViewId(), url = '', popup = false) {
  if (!hasWebViewer()) return;
  const state = useStore.getState();
  if (viewId.startsWith('sidebar:')) {
    const tab = state.rightTabs.find(tab => tab.id === viewId.slice(8));
    if (tab) return state.openSidebarTab(tab.side ?? 'right', 'webviewer', { url }, !popup && tab.type === 'empty' ? tab.id : undefined);
    return;
  }
  const path = `webviewer://${crypto.randomUUID()}`;
  if (viewId === 'split' && !popup) {
    await state.openToSide(path);
  } else if (popup || !isHomepagePath(state.activePath)) {
    await state.showTab(path);
  } else {
    await state.openFile(path, true, 'main');
  }
  if (url) updateCentralWebViewer(path, url, url);
}

export function updateCentralWebViewer(path: string, url: string, title: string) {
  const tab = useStore.getState().tabs.find(tab => tab.path === path);
  if (!tab || tab.webUrl === url && tab.title === title) return;
  useStore.setState(state => ({ tabs: state.tabs.map(tab => tab.path === path ? { ...tab, webUrl: url, title } : tab) }));
}
