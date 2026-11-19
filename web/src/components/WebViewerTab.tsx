import { useEffect, useRef, useState } from 'react';
import type { WebviewTag } from 'electron';
import { parseWebViewerUrl, webViewerPartition } from '../../../desktop/src/webViewerAddress';
import { activateNavigation } from '../lib/activeEditor';
import type { SidebarTab } from '../lib/sidebarTabs';
import { useStore } from '../lib/store';
import Icon from './Icon';

function addressUrl(input: string) {
  const value = input.trim();
  const bareHost = !/^[a-z][a-z\d+.-]*:/i.test(value) || /^[^\s/:]+:\d+(?:[/?#]|$)/.test(value);
  return parseWebViewerUrl(bareHost ? `https://${value}` : value);
}

export default function WebViewerTab({ tab, active }: { tab: SidebarTab; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const guest = useRef<WebviewTag>();
  const loaded = useRef('');
  const opened = useRef(false);
  const [address, setAddress] = useState<string>(tab.state.url);
  const [error, setError] = useState('');
  const [controls, setControls] = useState({ ready: false, back: false, forward: false });
  const url = String(tab.state.url);
  if (active) opened.current = true;
  const mountGuest = opened.current && !!url;
  const select = () => activateNavigation('sidebar:' + tab.id);

  useEffect(() => {
    if (active && !url) input.current?.focus();
  }, [active, url]);

  useEffect(() => {
    const container = host.current;
    const bridge = window.webobsidianDesktop?.webViewer;
    if (!mountGuest || !container || !bridge) return;

    const view = document.createElement('webview') as WebviewTag;
    view.setAttribute('partition', webViewerPartition);
    view.setAttribute('allowpopups', '');
    view.setAttribute('aria-label', '网页内容');
    let ready = false;
    const persistTab = (address: string, title: string) => {
      // Native close holds the workspace inert while saving its final layout.
      if (document.getElementById('root')?.inert) return;
      const state = useStore.getState();
      const current = state.rightTabs.find(item => item.id === tab.id);
      if (current && (current.state.url !== address || current.title !== title)) {
        state.updateRightTab(tab.id, { state: { url: address }, title });
      }
    };
    const syncControls = () => {
      ready = true;
      setControls({ ready, back: view.canGoBack(), forward: view.canGoForward() });
    };
    const syncTitle = (title: string) => {
      if (title && loaded.current) persistTab(loaded.current, title.slice(0, 512));
    };
    const updateAddress = (target: string) => {
      const address = parseWebViewerUrl(target)?.href;
      if (!address) return;
      loaded.current = address;
      setAddress(address);
      persistTab(address, view.getTitle().slice(0, 512) || address);
      syncControls();
    };
    view.addEventListener('dom-ready', () => {
      syncControls();
      syncTitle(view.getTitle());
    });
    view.addEventListener('did-navigate', event => updateAddress(event.url));
    view.addEventListener('did-navigate-in-page', event => {
      if (event.isMainFrame) updateAddress(event.url);
    });
    view.addEventListener('page-title-updated', event => syncTitle(event.title));
    view.addEventListener('did-start-loading', () => setError(''));
    view.addEventListener('did-fail-load', event => {
      if (event.isMainFrame && event.errorCode !== -3) setError(`页面加载失败（${event.errorDescription}）`);
    });
    view.addEventListener('render-process-gone', () => setError('网页进程已退出，请刷新页面'));
    view.addEventListener('focus', select);
    const unsubscribe = bridge.onOpenTab(target => {
      // Only the tab that owns this guest may open its popup.
      if (!ready || document.getElementById('root')?.inert || target.guestId !== view.getWebContentsId()) return;
      const state = useStore.getState();
      const source = state.rightTabs.find(item => item.id === tab.id);
      if (source) void state.openSidebarTab(source.side ?? 'right', 'webviewer', { url: target.url });
    });
    const restoreAfterClose = () => {
      if (ready) updateAddress(view.getURL());
    };
    window.addEventListener('desktop-close-cancelled', restoreAfterClose);

    guest.current = view;
    container.append(view);
    return () => {
      unsubscribe();
      window.removeEventListener('desktop-close-cancelled', restoreAfterClose);
      view.remove();
      guest.current = undefined;
      loaded.current = '';
    };
  }, [mountGuest, tab.id]);

  useEffect(() => {
    if (!guest.current || !parseWebViewerUrl(url) || loaded.current === url) return;
    loaded.current = url;
    setAddress(url);
    guest.current.src = url;
  }, [mountGuest, url]);

  return <section className="sidebar-view" hidden={!active} data-sidebar-tab={tab.id}
    onPointerDownCapture={select} onFocusCapture={select}>
    <form className="webviewer-toolbar" onSubmit={event => {
      event.preventDefault();
      const target = addressUrl(address);
      if (!target || target.port === window.location.port) {
        setError('请输入有效的 HTTP(S) 网页地址');
        return;
      }
      if (target.href === url && controls.ready) guest.current?.reload();
      else useStore.getState().updateRightTab(tab.id, { state: { url: target.href }, title: target.href });
    }}>
      <button type="button" className="tool-btn" title="后退" aria-label="后退" disabled={!controls.back} onClick={() => guest.current?.goBack()}><Icon name="arrow-left" size={16} /></button>
      <button type="button" className="tool-btn" title="前进" aria-label="前进" disabled={!controls.forward} onClick={() => guest.current?.goForward()}><Icon name="arrow-right" size={16} /></button>
      <button type="button" className="tool-btn" title="刷新网页" aria-label="刷新网页" disabled={!controls.ready} onClick={() => guest.current?.reload()}><Icon name="refresh-cw" size={16} /></button>
      <input ref={input} className="text-input" aria-label="网页地址" placeholder="输入网页地址" spellCheck={false}
        value={address} onChange={event => { setAddress(event.target.value); setError(''); }} />
      <button type="submit" className="tool-btn" title="打开网页" aria-label="打开网页"><Icon name="arrow-up-right" size={16} /></button>
    </form>
    {error && <p className="editor-error" role="alert">{error}</p>}
    <div ref={host} className="webviewer-content" />
  </section>;
}
