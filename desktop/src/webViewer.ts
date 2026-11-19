import { session, type Session, type WebContents } from 'electron';
import path from 'node:path';
import { parseWebViewerUrl, webViewerPartition } from './webViewerAddress';

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

  host.on('did-attach-webview', (_event, guest) => {
    attachScripts(guest);
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
