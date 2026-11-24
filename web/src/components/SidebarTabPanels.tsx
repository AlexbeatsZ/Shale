import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '../lib/store';
import { activateNavigation } from '../lib/activeEditor';
import { sharedApp, subscribePlugins, pluginRevision } from '../lib/plugins';
import type { SidebarTab } from '../lib/sidebarTabs';
import { openFragment } from '../lib/fragmentNavigation';
import WorkspaceFile from './WorkspaceFile';
import GraphView from './GraphView';
import Icon from './Icon';
import BookmarksPanel from './BookmarksPanel';
import WorkspaceLauncher from './WorkspaceLauncher';
import WebViewerTab from './WebViewerTab';

const SidebarFile = memo(function SidebarFile({ tab, active }: { tab: SidebarTab; active: boolean }) {
  const opened = useRef(false);
  const editor = useRef<import('@codemirror/view').EditorView | null>(null);
  if (active) opened.current = true;
  return <div className="sidebar-note" hidden={!active} data-sidebar-tab={tab.id}
    onPointerDownCapture={() => activateNavigation('sidebar:' + tab.id)} onFocusCapture={() => activateNavigation('sidebar:' + tab.id)}>
    {opened.current && <WorkspaceFile path={tab.state.file} navigationId={'sidebar:' + tab.id} onReady={view => {
      editor.current = view;
      if (view && tab.state.fragment) void openFragment(tab.state.file, tab.state.fragment, view, { viewId: 'sidebar:' + tab.id });
    }} />}
  </div>;
});

/** DOM-owned plugin views survive tab switches; close alone disposes them. */
const SidebarView = memo(function SidebarView({ tab, active }: { tab: SidebarTab; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const leaf = useRef<ReturnType<typeof sharedApp.workspace.rightLeaf>>();
  const opened = useRef(false);
  const [error, setError] = useState('');
  const revision = useSyncExternalStore(subscribePlugins, pluginRevision);
  const state = JSON.stringify(tab.state);
  useEffect(() => {
    if ((!active && !opened.current) || !host.current) return;
    opened.current = true;
    const current = leaf.current ??= sharedApp.workspace.rightLeaf(tab);
    let cancelled = false;
    void current.mountView(tab, host.current).then(() => { if (!cancelled) setError(''); })
      .catch(cause => { if (!cancelled) setError(String(cause)); });
    return () => { cancelled = true; };
  }, [active, state, tab.type, revision]);
  useEffect(() => () => { void leaf.current?.closeView(); }, []);
  return <section className="sidebar-view" hidden={!active} data-sidebar-tab={tab.id}
    onPointerDownCapture={() => activateNavigation('sidebar:' + tab.id)} onFocusCapture={() => activateNavigation('sidebar:' + tab.id)}>
    {error && <p className="editor-error" role="alert">{error}</p>}<div className="sidebar-view-host" ref={host} />
  </section>;
});


/** Both docks retain the same session/leaf hosts; side changes only placement. */
export default function SidebarTabPanels({ side, open }: { side: 'left' | 'right'; open: boolean }) {
  const allTabs = useStore(s => s.rightTabs);
  const activeId = useStore(s => side === 'left' ? s.leftActiveId : s.rightActiveId);
  const tabs = allTabs.filter(tab => (tab.side ?? 'right') === side);
  const tab = tabs.find(tab => tab.id === activeId);
  return <>
    {/* Notes and web pages carry their own title/toolbar; the rail closes them. */}
    {tab && !['webviewer', 'markdown', 'file'].includes(tab.type) && <div className="sidebar-tab-header"><Icon name={tab.icon} size={16} /><span>{tab.title}</span>
      <button className="tool-btn" title="关闭标签页" aria-label={side === 'left' ? '关闭左侧标签页' : '关闭右侧标签页'} onClick={() => void useStore.getState().closeRightTab(tab.id)}><Icon name="x" size={16} /></button></div>}
    {open && tab?.type === 'empty' && <WorkspaceLauncher key={tab.id} viewId={'sidebar:' + tab.id} />}
    {tabs.filter(tab => tab.type === 'markdown' || tab.type === 'file').map(tab => <SidebarFile key={tab.id} tab={tab} active={open && tab.id === activeId} />)}
    {open && tab?.type === 'graph' && <div className="sidebar-view" data-sidebar-tab={tab.id}
      onPointerDownCapture={() => activateNavigation('sidebar:' + tab.id)} onFocusCapture={() => activateNavigation('sidebar:' + tab.id)}>
      <GraphView navigationId={'sidebar:' + tab.id} />
    </div>}
    {open && tab?.type === 'bookmarks' && <div className="sidebar-body"><BookmarksPanel /></div>}
    {tabs.filter(tab => tab.type === 'webviewer').map(tab => <WebViewerTab key={tab.id} id={tab.id} url={tab.state.url} sidebar active={open && tab.id === activeId} />)}
    {tabs.filter(tab => !['empty', 'markdown', 'file', 'graph', 'bookmarks', 'webviewer'].includes(tab.type)).map(tab => <SidebarView key={tab.id + tab.type} tab={tab} active={open && tab.id === activeId} />)}
  </>;
}
