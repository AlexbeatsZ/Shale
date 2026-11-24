import { session, type Session, type WebContents } from 'electron';
import path from 'node:path';
import { parseWebViewerUrl, webViewerPartition } from './webViewerAddress';
import { eventHotkey, hotkeySignature } from '../../packages/search-core/src/hotkeys';
import type { WebViewerHotkey } from './bridge';

const configuredSessions = new WeakSet<Session>();

export function configureWebViewer(host: WebContents, runtimePort: () => number, attachScripts: (guest: WebContents) => void) {
  const runtimeUrl = (url: URL) => Number(url.port) === runtimePort();
  const allowed = (value: string) => {
    const url = parseWebViewerUrl(value);
    return url && !runtimeUrl(url);
  };

  const browsing = session.fromPartition(webViewerPartition);
  if (!configuredSessions.has(browsing)) {
    browsing.setPermissionRequestHandler((_contents, _permission, respond) => respond(false));
    browsing.setPermissionCheckHandler(() => false);
    // Reject access to the app port through redirects, subresources and WebSockets.
    browsing.webRequest.onBeforeRequest((request, respond) => respond({ cancel: runtimeUrl(new URL(request.url)) }));
    configuredSessions.add(browsing);
  }

  host.on('will-attach-webview', (event, preferences, params) => {
    if (!host.getURL().startsWith(`http://127.0.0.1:${runtimePort()}/`) ||
        params.partition !== webViewerPartition || params.webpreferences || params.preload ||
        params.useragent || params.httpreferrer || !allowed(params.src)) {
      event.preventDefault();
      return;
    }

    Object.assign(preferences, {
      session: browsing,
      preload: path.join(__dirname, 'webViewerPreload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      plugins: false,
      enableBlinkFeatures: undefined,
      disableBlinkFeatures: undefined,
      safeDialogs: true,
    });
  });

  // A focused guest receives keys in its own process, so the host's capture
  // listener never sees them. The host publishes its bound signatures and
  // matching keys are handed back before the page or its menus consume them.
  let hotkeys = new Set<string>();
  host.ipc.on('webviewer:hotkeys', (_event, signatures: unknown) => {
    if (Array.isArray(signatures) && signatures.length <= 2000 && signatures.every(item => typeof item === 'string' && item.length <= 80))
      hotkeys = new Set(signatures);
  });
  const mac = process.platform === 'darwin';

  host.on('did-attach-webview', (_event, guest) => {
    attachScripts(guest);
    guest.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.isComposing || !hotkeys.size || host.isDestroyed()) return;
      const key: WebViewerHotkey = { key: input.key, code: input.code, ctrlKey: input.control, metaKey: input.meta,
        altKey: input.alt, shiftKey: input.shift, repeat: input.isAutoRepeat };
      const binding = eventHotkey(key);
      if (!binding || !hotkeys.has(hotkeySignature(binding, mac))) return;
      event.preventDefault();
      host.send('webviewer:hotkey', key);
    });
    const guard = (event: Electron.Event, url: string) => {
      if (!allowed(url)) event.preventDefault();
    };
    guest.on('will-navigate', guard);
    guest.on('will-redirect', guard);
    guest.setWindowOpenHandler(({ url }) => {
      if (allowed(url) && !host.isDestroyed()) host.send('webviewer:open-tab', { guestId: guest.id, url });
      return { action: 'deny' };
    });
  });
}
