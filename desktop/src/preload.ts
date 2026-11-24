// Preload supplies native chrome; React shares the compact workspace tab row.
import { contextBridge, ipcRenderer } from 'electron';
import { installTitleBar } from './titlebar';
import type { DesktopBridge } from './bridge';
import type { McpConnectionInput } from './mcpLauncher';

const nativeArg = process.argv.find(arg => arg.startsWith('--shale-native-vault='));
const desktopApi: DesktopBridge = {
  isDesktop: true,
  inputMethod: {
    supported: process.platform === 'darwin' || process.platform === 'win32',
    list: () => ipcRenderer.invoke('desktop:input-method-list'),
    update: request => ipcRenderer.invoke('desktop:input-method-update', request),
  },
  platform: process.platform,
  version: process.argv.find(arg => arg.startsWith('--shale-version='))?.split('=')[1] ?? '',
  nativePlugins: !!nativeArg,
  runAction: action => ipcRenderer.invoke('desktop:action', action),
  webViewer: {
    onOpenTab: listener => {
      const handler = (_event: unknown, target: { guestId: number; url: string }) => listener(target);
      ipcRenderer.on('webviewer:open-tab', handler);
      return () => ipcRenderer.removeListener('webviewer:open-tab', handler);
    },
    setHotkeys: signatures => ipcRenderer.send('webviewer:hotkeys', signatures),
    onHotkey: listener => {
      const handler = (_event: unknown, key: Parameters<typeof listener>[0]) => listener(key);
      ipcRenderer.on('webviewer:hotkey', handler);
      return () => ipcRenderer.removeListener('webviewer:hotkey', handler);
    },
  },
  userscripts: {
    request: (action, payload) => ipcRenderer.invoke('userscripts:manage', action, payload ?? {}),
    subscribe: listener => {
      const handler = () => listener();
      ipcRenderer.on('userscripts:changed', handler);
      return () => ipcRenderer.removeListener('userscripts:changed', handler);
    },
  },
  mcp: {
    inspect: () => ipcRenderer.invoke('desktop:mcp-inspect'),
    configure: (input: McpConnectionInput) => ipcRenderer.invoke('desktop:mcp-configure', input),
    copyConfig: () => ipcRenderer.invoke('desktop:mcp-copy-config'),
    connect: () => ipcRenderer.invoke('desktop:mcp-connect'),
  },
  openVaultPath: (path: string): Promise<void> => ipcRenderer.invoke('desktop:open-vault-path', path),
  revealVaultPath: (path: string): Promise<void> => ipcRenderer.invoke('desktop:reveal-vault-path', path),
  setChrome: (dark, workspace) => {
    document.documentElement.dataset.nativeDark = String(dark);
    document.documentElement.dataset.nativeWorkspace = String(workspace);
    window.dispatchEvent(new Event('desktop:chrome'));
  },
  onBeforeClose: (listener: () => Promise<void>) => {
    const handler = (_event: unknown, token: string) => {
      void Promise.resolve().then(listener).then(
        () => ipcRenderer.send('desktop:close-result', token, { ok: true }),
        error => ipcRenderer.send('desktop:close-result', token, { ok: false, error: String(error) }),
      );
    };
    ipcRenderer.on('desktop:prepare-close', handler);
    ipcRenderer.send('desktop:renderer-ready', true);
    return () => {
      ipcRenderer.removeListener('desktop:prepare-close', handler);
      ipcRenderer.send('desktop:renderer-ready', false);
    };
  },
  vaultPath: nativeArg ? decodeURIComponent(nativeArg.slice('--shale-native-vault='.length)) : undefined,
};
if (process.isMainFrame) {
  if (process.contextIsolated) contextBridge.exposeInMainWorld('shaleDesktop', desktopApi);
  else {
    Object.defineProperty(window, 'shaleDesktop', { value: desktopApi });
    // Only present in the explicitly trusted, local desktop renderer.
    Object.defineProperty(window, 'shaleNativeRequire', { value: require });
  }
}

if (process.isMainFrame) {
  ipcRenderer.on('desktop:command', (_event, command: string) => {
    window.dispatchEvent(new CustomEvent('desktop-command', { detail: command }));
  });
  ipcRenderer.on('desktop:server-stopped', () => window.dispatchEvent(new Event('shale-server-stopped')));
  ipcRenderer.on('desktop:close-cancelled', () => window.dispatchEvent(new Event('desktop-close-cancelled')));
  window.addEventListener('DOMContentLoaded', () => void installTitleBar(), { once: true });
}
