import { useState } from 'react';
import { GRAPH_PATH, useStore } from '../lib/store';
import { openWebViewer } from '../lib/openWebViewer';
import { hasWebViewer } from '../lib/platform';
import Icon from './Icon';

/** Shared empty-workspace/new-dock-tab launcher; all actions use existing commands. */
export default function WorkspaceLauncher({ viewId = 'main' }: { viewId?: string }) {
  const [error, setError] = useState('');
  const sidebarId = viewId.startsWith('sidebar:') ? viewId.slice(8) : undefined;
  const openGraph = () => {
    const state = useStore.getState();
    return viewId === 'main' ? state.showTab(GRAPH_PATH) : state.openFile(GRAPH_PATH, true, viewId);
  };
  const launch = (action: Promise<unknown>) => void action.catch(cause => setError(String(cause)));
  return <div className="workspace-launcher">
    <button className="launch-action" onClick={() => launch(useStore.getState().newNote(undefined, viewId))}><Icon name="square-pen" size={16} /><span>新建笔记</span><kbd>Ctrl + N</kbd></button>
    <button className="launch-action" onClick={() => sidebarId ? useStore.getState().pickRightNote(sidebarId) : useStore.getState().setPalette(true, 'files')}><Icon name="search" size={16} /><span>打开文件</span><kbd>Ctrl + O</kbd></button>
    {hasWebViewer() && <button className="launch-action" onClick={() => launch(openWebViewer(viewId))}><Icon name="globe" size={16} /><span>打开网页浏览器</span></button>}
    <button className="launch-action" onClick={() => launch(openGraph())}><Icon name="graph" size={16} /><span>打开关系图谱</span></button>
    {error && <p className="editor-error" role="alert">{error}</p>}
  </div>;
}
