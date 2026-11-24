import type { McpConnectionInput, McpLauncherState } from './mcpLauncher';
import type { UserscriptBridge } from '../../web/src/lib/userscripts/types';

/** App-owned menu actions: the shortcut catalog is their only keyboard authority. */
export const desktopActions = [
  { id: 'app:reload', title: '重新加载应用' },
  { id: 'app:force-reload', title: '强制重新加载应用' },
  { id: 'app:toggle-devtools', title: '显示或隐藏开发者工具' },
  { id: 'app:reset-zoom', title: '恢复界面实际大小' },
  { id: 'app:zoom-in', title: '放大应用界面' },
  { id: 'app:zoom-out', title: '缩小应用界面' },
  { id: 'app:toggle-fullscreen', title: '切换原生全屏' },
  { id: 'app:minimize', title: '最小化窗口' },
  { id: 'app:zoom-window', title: '缩放窗口' },
  { id: 'workspace:close-window', title: '关闭应用窗口' },
  { id: 'app:quit', title: '退出应用' },
  { id: 'app:hide', title: '隐藏应用', macOnly: true },
  { id: 'app:hide-others', title: '隐藏其他应用', macOnly: true },
  { id: 'app:unhide', title: '显示所有应用', macOnly: true },
  { id: 'app:bring-to-front', title: '将所有窗口置于前方', macOnly: true },
  { id: 'native:cut', title: '剪切' },
  { id: 'native:copy', title: '复制' },
  { id: 'native:paste', title: '粘贴' },
  { id: 'native:paste-plain', title: '粘贴并匹配样式' },
  { id: 'native:delete', title: '删除所选内容' },
  { id: 'native:select-all', title: '全选' },
  { id: 'native:start-speaking', title: '开始朗读', macOnly: true },
  { id: 'native:stop-speaking', title: '停止朗读', macOnly: true },
] as const;
export type DesktopAction = typeof desktopActions[number]['id'];
export const desktopCommands = ['new', 'files', 'save', 'settings', 'vault-switch', 'editor:undo', 'editor:redo', ...desktopActions.map(action => action.id)] as const;
export type DesktopCommand = typeof desktopCommands[number];

export interface DesktopBridge {
  inputMethod: import('./inputMethodTypes').InputMethodBridge;
  isDesktop: true;
  platform: string;
  version: string;
  nativePlugins: boolean;
  runAction(action: DesktopAction): Promise<void>;
  vaultPath?: string;
  userscripts?: UserscriptBridge;
  webViewer?: {
    onOpenTab(listener: (target: { guestId: number; url: string }) => void): () => void;
    /** Shale hotkey signatures a focused page hands back instead of consuming. */
    setHotkeys(signatures: string[]): void;
    onHotkey(listener: (key: WebViewerHotkey) => void): () => void;
  };
  mcp: {
    inspect(): Promise<McpLauncherState>;
    configure(input: McpConnectionInput): Promise<McpLauncherState>;
    copyConfig(): Promise<void>;
    connect(): Promise<McpLauncherState>;
  };
  openVaultPath(path: string): Promise<void>;
  revealVaultPath(path: string): Promise<void>;
  setChrome(dark: boolean, workspace: boolean): void;
  onBeforeClose(listener: () => Promise<void>): () => void;
}

export interface WebViewerHotkey {
  key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean;
}
