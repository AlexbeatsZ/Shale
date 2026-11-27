import { useState } from 'react';
import { GRAPH_PATH, useStore } from '../lib/store';
import { openWebViewer } from '../lib/openWebViewer';
import { hasWebViewer, isMacOS } from '../lib/platform';
import Icon from './Icon';

/** Shared empty-workspace/new-dock-tab launcher; all actions use existing commands. */
export default function WorkspaceLauncher({ viewId = 'main' }: { viewId?: string }) {
  const [error, setError] = useState('');
  const vaultName = useStore(s => s.tree?.name ?? 'Shale');
  const recent = useStore(s => s.recent);
  const filePaths = useStore(s => s.filePaths);
  const recentFiles = recent.filter(path => filePaths.includes(path)).slice(0, 3);
  const modifier = isMacOS() ? '⌘' : 'Ctrl';
  const sidebarId = viewId.startsWith('sidebar:') ? viewId.slice(8) : undefined;
  const openGraph = () => useStore.getState().openFile(GRAPH_PATH, true, viewId);
  const launch = (action: Promise<unknown>) => void action.catch(cause => setError(String(cause)));
  return <div className={`workspace-launcher${sidebarId ? ' is-compact' : ''}`}>
    <header className="launch-header">
      <div className="launch-brand" aria-hidden="true"><Icon name="book-open" size={32} /></div>
      <span className="launch-vault">{vaultName}</span>
      <h1>让想法，<br />在这里生长。</h1>
      <p>记下灵感，连接知识。<br className="launch-compact-break" />从一页新的笔记开始。</p>
    </header>
    <div className="launch-primary-actions">
      <button type="button" className="launch-action is-primary" onClick={() => launch(useStore.getState().newNote(undefined, viewId))}><Icon name="square-pen" size={24} /><span>新建笔记</span><kbd>{modifier} + N</kbd></button>
      <button type="button" className="launch-action is-tonal" onClick={() => sidebarId ? useStore.getState().pickRightNote(sidebarId) : useStore.getState().setPalette(true, 'files')}><Icon name="folder-open" size={24} /><span>打开文件</span><kbd>{modifier} + O</kbd></button>
    </div>
    <div className="launch-destinations">
      {hasWebViewer() && <button type="button" className="launch-destination" aria-label="打开网页浏览器" onClick={() => launch(openWebViewer(viewId))}><span className="launch-destination-icon"><Icon name="globe" size={24} /></span><span><strong>网页浏览器</strong><small>让阅读与笔记相连</small></span><Icon name="arrow-up-right" size={20} /></button>}
      <button type="button" className="launch-destination" aria-label="打开关系图谱" onClick={() => launch(openGraph())}><span className="launch-destination-icon"><Icon name="graph" size={24} /></span><span><strong>关系图谱</strong><small>发现知识之间的联系</small></span><Icon name="arrow-up-right" size={20} /></button>
    </div>
    {recentFiles.length > 0 && <section className="launch-recent" aria-label="最近打开">
      <h2>继续上次的思路</h2>
      {recentFiles.map(path => <button type="button" key={path} onClick={() => launch(useStore.getState().openFile(path, true, viewId))}>
        <Icon name="file-text" size={20} /><span>{path.split('/').pop()?.replace(/\.md$/i, '')}<small>{path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : vaultName}</small></span><Icon name="arrow-right" size={18} />
      </button>)}
    </section>}
    {error && <p className="editor-error" role="alert">{error}</p>}
  </div>;
}
