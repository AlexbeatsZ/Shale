import { execFileSync } from 'node:child_process';
import { migrateDesktopProfile } from '../../scripts/identity-migration.mjs';
import { InputMethodService, inputMethodBackend } from './inputMethod';
import { performDesktopAction } from './nativeActions';
import { performNativeEdit } from './editShortcuts';
import { app, BrowserWindow, Menu, dialog, ipcMain, shell, safeStorage, clipboard, type IpcMainEvent, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron';
import { configureWebViewer } from './webViewer';
import { UserscriptService } from './userscripts/service';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { effectiveVaultPath, openExistingPath, revealVaultItem } from './paths';
import { McpLauncher } from './mcpLauncher';
import { writeJson } from './files';
import { ServerProcess } from './serverProcess';
import { type DesktopCommand } from './bridge';

// ---------------------------------------------------------------------------
// Paths & persisted desktop config
// ---------------------------------------------------------------------------
// Everything user-specific lives under Electron's per-user userData dir:
//   <userData>/desktop-config.json  — startup Vault hint and trusted-plugin option
//   <userData>/server-data/         — the server's DATA_DIR (settings.json, index)
//   <userData>/logs/server.log      — server child stdout/stderr (debugging)
app.setName('Shale');
const customProfile = app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData', customProfile ? path.resolve(customProfile) : migrateDesktopProfile(app.getPath('appData')));
app.setPath('sessionData', app.getPath('userData'));
if (process.platform === 'win32') app.setAppUserModelId('io.github.alexbeatsz.shale');

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'desktop-config.json');
const DATA_DIR = () => path.join(app.getPath('userData'), 'server-data');
const LOG_FILE = () => path.join(app.getPath('userData'), 'logs', 'server.log');
const DEVELOPMENT_ICON = path.join(__dirname, '..', 'buildResources',
  process.platform === 'darwin' ? 'icon-macos.png' : process.platform === 'win32' ? 'icon-windows.ico' : 'icon.png');

interface DesktopConfig {
  vaultPath?: string;
  trustedPlugins?: boolean;
}

let serverProcess: ServerProcess | undefined;
let serverReady = false;
const rendererReady = new WeakSet<BrowserWindow>();
let serverPort = 0;
let mainWindow: BrowserWindow | null = null;
let desktopConfig: DesktopConfig | undefined;
let mcpLauncher: McpLauncher | undefined;
let userscripts: UserscriptService | undefined;
let inputMethodService: InputMethodService | undefined;
let initialVaultChoice: string | undefined;
let finishingQuit = false;
let quitRequest: Promise<void> | undefined;
let quitRequested = false;
const forcedClosures = new WeakSet<BrowserWindow>();
const approvedClosures = new WeakSet<BrowserWindow>();
let pendingClose: { window: BrowserWindow; token: string; resolve: () => void; reject: (error: Error) => void } | undefined;

function prepareWindowClose(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed() || !rendererReady.has(window)) return Promise.resolve();
  if (window.webContents.isCrashed()) return confirmUnresponsiveClose(window);
  try {
    if (new URL(window.webContents.getURL()).origin !== baseUrl(serverPort)) return Promise.resolve();
  } catch { return Promise.resolve(); }
  return new Promise<void>((resolve, reject) => {
    const token = randomUUID();
    const timeout = setTimeout(() => {
      void confirmUnresponsiveClose(window).then(() => finish(), error => finish(error));
    }, 30_000);
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      if (pendingClose?.token === token) pendingClose = undefined;
      if (error) {
        if (!window.isDestroyed()) window.webContents.send('desktop:close-cancelled', token);
        reject(error);
      } else resolve();
    };
    pendingClose = { window, token, resolve: () => finish(), reject: error => finish(error) };
    window.webContents.send('desktop:prepare-close', token);
  });
}

function requestWindowClose(window: BrowserWindow, quit: boolean): Promise<void> {
  quitRequested ||= quit;
  if (quitRequest) return quitRequest;
  quitRequest = (async () => {
    try {
      await prepareWindowClose(window);
      await inputMethodService?.releaseAll();
      if (quitRequested) {
        await Promise.all([mcpLauncher?.stop(), userscripts?.stop()]);
        await serverProcess?.stop();
        finishingQuit = true;
        app.quit();
      } else if (!window.isDestroyed()) {
        approvedClosures.add(window);
        window.close();
      }
    } catch (error) {
      approvedClosures.delete(window);
      if (!window.isDestroyed()) {
        window.webContents.send('desktop:close-cancelled');
        window.show();
        dialog.showErrorBox('无法关闭 Shale', String(error));
      }
    } finally { quitRequested = false; quitRequest = undefined; }
  })();
  return quitRequest;
}

async function confirmUnresponsiveClose(window: BrowserWindow): Promise<void> {
  const result = await dialog.showMessageBox(window, {
    type: 'warning', title: '页面未响应',
    message: '页面无法确认保存结果。关闭可能丢失尚未保存的编辑。',
    buttons: ['继续编辑或等待', '关闭窗口'], defaultId: 0, cancelId: 0,
  });
  if (result.response !== 1) throw new Error('关闭已取消');
  forcedClosures.add(window);
}

async function readConfig(): Promise<DesktopConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<DesktopConfig>;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as DesktopConfig;
    }
    throw new Error('桌面配置格式无效，请检查 desktop-config.json');
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
  }
  return {};
}

async function writeConfig(cfg: DesktopConfig): Promise<void> {
  await writeJson(CONFIG_FILE(), cfg);
}

// ---------------------------------------------------------------------------
// Server entry / runtime layout
// ---------------------------------------------------------------------------
// Packaged: extraResources puts the bundle at <resources>/server/dist/index.mjs.
// Dev (electron dist/main.js): it lives at <desktop>/.gen/server/dist/index.mjs.
function serverEntry(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server', 'dist', 'index.mjs');
  }
  return path.join(__dirname, '..', '.gen', 'server', 'dist', 'index.mjs');
}

// GUI-launched apps (esp. macOS Finder) inherit a minimal PATH, so `git` (needed
// by the optional vault-sync feature) is often not found. Prepend the usual spots.
function augmentedPath(): string {
  const extra = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const current = process.env.PATH ?? '';
  const parts = current.split(path.delimiter).filter(Boolean);
  for (const p of extra) if (!parts.includes(p)) parts.push(p);
  return parts.join(path.delimiter);
}

async function startServer(cfg: DesktopConfig): Promise<void> {
  serverProcess = new ServerProcess({
    executable: process.execPath, entry: serverEntry(), dataDir: DATA_DIR(), logFile: LOG_FILE(),
    env: {
      ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production',
      DATA_DIR: DATA_DIR(), VAULT_PATH: cfg.vaultPath,
      SHALE_INITIAL_VAULT: initialVaultChoice,
      SHALE_REQUIRE_VAULT: '1',
      ALLOWED_ROOTS_JSON: JSON.stringify([os.homedir(), cfg.vaultPath].filter(Boolean)),
      PATH: augmentedPath(),
    },
    onExit: error => {
      serverReady = false;
      dialog.showErrorBox('本地服务已停止', `${error.message}\n请重新启动 Shale，当前页面的编辑仍保留在窗口中。`);
      mainWindow?.webContents.send('desktop:server-stopped');
    },
  });
  serverPort = await serverProcess.start();
  serverReady = true;
}

function baseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

// ---------------------------------------------------------------------------
// Vault selection
// ---------------------------------------------------------------------------
async function ensureVault(cfg: DesktopConfig): Promise<DesktopConfig | undefined> {
  const persisted = await fs.stat(path.join(DATA_DIR(), 'settings.json')).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  const current = persisted ? await effectiveVaultPath(DATA_DIR()) : cfg.vaultPath;
  if (current) {
    try {
      const st = await fs.stat(current);
      if (st.isDirectory()) return { ...cfg, vaultPath: current };
    } catch (error: any) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
    }
  }
  const picked = await pickVaultDialog();
  if (!picked) return undefined;
  cfg.vaultPath = picked;
  initialVaultChoice = picked;
  await writeConfig(cfg);
  return cfg;
}

async function pickVaultDialog(): Promise<string | undefined> {
  const result = await dialog.showOpenDialog({
    title: "选择仓库文件夹",
    message: '选择用作 Shale 仓库的文件夹',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: '使用此文件夹',
  });
  return result.canceled ? undefined : result.filePaths[0];
}

// ---------------------------------------------------------------------------
// Window + menu
// ---------------------------------------------------------------------------
function createWindow(starting = false): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#1e1e1e',
    title: 'Shale',
    icon: app.isPackaged ? undefined : DEVELOPMENT_ICON,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? {
      trafficLightPosition: { x: 12, y: 9 },
    } : {
      titleBarOverlay: { color: starting ? '#1e1e1e' : '#f6f6f6', symbolColor: starting ? '#dddddd' : '#333333', height: 32 },
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Native Shale plugins have the same machine access as the user.
      // Keep the restricted host by default; trust is a per-install choice.
      contextIsolation: !desktopConfig?.trustedPlugins,
      nodeIntegration: !!desktopConfig?.trustedPlugins,
      nodeIntegrationInSubFrames: false,
      sandbox: !desktopConfig?.trustedPlugins,
      webviewTag: true,
      additionalArguments: [`--shale-version=${app.getVersion()}`, ...(desktopConfig?.trustedPlugins ? [`--shale-native-vault=${encodeURIComponent(desktopConfig.vaultPath ?? '')}`] : [])],
    },
  });
  mainWindow.webContents.setUserAgent(`${mainWindow.webContents.getUserAgent()} ShaleDesktop`);
  configureWebViewer(mainWindow.webContents, () => serverPort, guest => userscripts?.attach(guest));

  // Retain menu access behind F10, without a visible menu row or native accelerators.
  if (process.platform !== 'darwin') mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url);
    if (target.origin !== baseUrl(serverPort) || target.pathname !== '/') {
      event.preventDefault();
      if (target.origin !== baseUrl(serverPort) && /^https?:/.test(url)) void shell.openExternal(url);
    }
  });
  mainWindow.webContents.on('will-redirect', (event, url) => {
    const target = new URL(url);
    if (target.origin !== baseUrl(serverPort) || target.pathname !== '/') event.preventDefault();
  });

  // Open external links (http/https not on our origin) in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url) && new URL(url).origin !== baseUrl(serverPort)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const syncFullscreen = () => mainWindow?.webContents.send('desktop:fullscreen', mainWindow.isFullScreen());
  mainWindow.on('enter-full-screen', syncFullscreen);
  mainWindow.on('leave-full-screen', syncFullscreen);
  mainWindow.webContents.on('did-finish-load', syncFullscreen);
  mainWindow.on('maximize', () => mainWindow?.webContents.send('desktop:fullscreen', mainWindow.isFullScreen()));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  const window = mainWindow;
  window.on('close', event => {
    if (finishingQuit || approvedClosures.has(window)) return;
    event.preventDefault();
    void requestWindowClose(window, process.platform !== 'darwin');
  });
  window.webContents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
    if (isMainFrame && !inPlace) rendererReady.delete(window);
  });
  window.webContents.on('render-process-gone', () => rendererReady.add(window));
  window.webContents.on('will-prevent-unload', event => {
    if (forcedClosures.has(window)) { event.preventDefault(); return; }
    approvedClosures.delete(window);
    finishingQuit = false;
    window.webContents.send('desktop:close-cancelled');
    dialog.showErrorBox('关闭已取消', '页面仍有未保存内容，请处理后再关闭');
  });

  // Show a real window before cold Vault indexing. A second click must focus
  // this window rather than looking as though the first launch did nothing.
  void mainWindow.loadURL(starting ? `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Shale</title>
<style>html{color-scheme:dark}body{margin:0;background:#1e1e1e;color:#ddd;font:15px system-ui;display:grid;place-content:center;height:100vh;text-align:center}.drag{-webkit-app-region:drag;position:fixed;inset:0 140px auto 0;height:32px}p{color:#aaa;font-size:13px}.spinner{margin:0 auto 20px;width:28px;height:28px;border:3px solid #444;border-top-color:#b9a3e3;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style></head>
<body><div class="drag"></div><div class="spinner"></div><div role="status">正在打开笔记库</div><p>正在准备本地服务与索引，首次打开可能需要一些时间。</p></body></html>`)}` : baseUrl(serverPort));
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin';
  // Native menus dispatch the same registered commands as the palette/hotkeys.
  const command = (id: DesktopCommand) => () => mainWindow?.webContents.send('desktop:command', id);
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ label: 'Shale', submenu: [
      { role: 'about' as const, label: '关于 Shale' },
      { type: 'separator' as const },
      { label: '设置…', click: command('settings') },
      { type: 'separator' as const },
      { role: 'services' as const, label: '服务' },
      { type: 'separator' as const },
      { role: 'hide' as const, label: '隐藏 Shale' },
      { role: 'hideOthers' as const, label: '隐藏其他' },
      { role: 'unhide' as const, label: '全部显示' },
      { type: 'separator' as const },
      { role: 'quit' as const, label: '退出 Shale' },
    ] }] : []),
    {
      label: "文件",
      submenu: [
        { label: '新建笔记', click: command('new') },
        { label: '打开笔记…', click: command('files') },
        { label: '保存', click: command('save') },
        { type: 'separator' },
        { label: "信任原生插件 (下次启动生效)", type: 'checkbox', checked: !!desktopConfig?.trustedPlugins,
          click: async (item) => { const cfg = await readConfig(); cfg.trustedPlugins = item.checked; await writeConfig(cfg); } },
        { label: "切换仓库…", click: command('vault-switch') },
        {
          label: "打开仓库文件夹",
          click: async () => {
            try { await openExistingPath(await effectiveVaultPath(DATA_DIR(), desktopConfig?.vaultPath)); }
            catch (error) { dialog.showErrorBox('无法打开笔记库', String(error)); }
          },
        },
        { type: 'separator' },
        { label: "打开数据文件夹", click: () => shell.openPath(DATA_DIR()) },
        { label: "打开日志", click: () => shell.openPath(LOG_FILE()) },
        { type: 'separator' },
        isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'pasteAndMatchStyle', label: '粘贴并匹配样式' },
        { role: 'delete', label: '删除' },
        { role: 'selectAll', label: '全选' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'startSpeaking' as const, label: '开始朗读' },
          { role: 'stopSpeaking' as const, label: '停止朗读' }] : []),
      ],
    },
    {
      label: "显示",
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { role: 'minimize', label: '最小化' },
        ...(isMac ? [{ role: 'zoom' as const, label: '缩放' }, { role: 'close' as const, label: '关闭窗口' },
          { type: 'separator' as const }, { role: 'front' as const, label: '全部置于顶层' },
          { role: 'window' as const, label: '窗口' }] : [{ role: 'close' as const, label: '关闭窗口' }]),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: "GitHub 上的 Shale",
          click: () => shell.openExternal('https://github.com/AlexbeatsZ/shale'),
        },
      ],
    },
  ];
  const roleCommands: Partial<Record<NonNullable<MenuItemConstructorOptions['role']>, DesktopCommand>> = {
    undo: 'editor:undo', redo: 'editor:redo', cut: 'native:cut', copy: 'native:copy', paste: 'native:paste',
    pasteAndMatchStyle: 'native:paste-plain', delete: 'native:delete', selectAll: 'native:select-all',
    reload: 'app:reload', forceReload: 'app:force-reload', toggleDevTools: 'app:toggle-devtools',
    resetZoom: 'app:reset-zoom', zoomIn: 'app:zoom-in', zoomOut: 'app:zoom-out', togglefullscreen: 'app:toggle-fullscreen',
    minimize: 'app:minimize', zoom: 'app:zoom-window', close: 'workspace:close-window', quit: 'app:quit',
    hide: 'app:hide', hideOthers: 'app:hide-others', unhide: 'app:unhide', front: 'app:bring-to-front',
    startSpeaking: 'native:start-speaking', stopSpeaking: 'native:stop-speaking',
  };
  const withoutShortcuts = (items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] => items.map(item => {
    const id = item.role ? roleCommands[item.role] : undefined;
    const next = { ...item, accelerator: '' };
    // A native role's selector can execute before click on Mac; remove it for catalog actions.
    if (id) { delete next.role; next.id = id; next.click = command(id); }
    if (Array.isArray(item.submenu)) next.submenu = withoutShortcuts(item.submenu);
    return next;
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(withoutShortcuts(template)));
}

// Only the local app's top-level frame may operate native desktop chrome.
function desktopWindow(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | null {
  const frame = event.senderFrame;
  if (!mainWindow || !frame || event.sender !== mainWindow.webContents || frame !== event.sender.mainFrame) return null;
  try {
    return new URL(frame.url).origin === baseUrl(serverPort) ? mainWindow : null;
  } catch {
    return null;
  }
}

function registerTitleBar(): void {
  ipcMain.handle('desktop:open-application-menu', (event) => {
    const win = desktopWindow(event);
    const menu = Menu.getApplicationMenu();
    if (!win || !menu) return;
    return new Promise<void>((resolve) => menu.popup({
      window: win,
      x: 0,
      y: 32,
      callback: resolve,
    }));
  });
  ipcMain.on('desktop:titlebar-theme', (event, dark: boolean) => {
    const win = desktopWindow(event);
    if (win && process.platform !== 'darwin' && typeof dark === 'boolean') win.setTitleBarOverlay({
      color: dark ? '#262626' : '#f6f6f6',
      symbolColor: dark ? '#dadada' : '#333333',
    });
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
function registerDesktopRequests(): void {
  const inputMethod = inputMethodService = new InputMethodService(inputMethodBackend(path.join(
    app.isPackaged ? path.join(process.resourcesPath, 'input-method') : path.join(__dirname, '..', '.gen', 'input-method', process.arch),
    process.platform === 'win32' ? 'im-select.exe' : 'im-select'), process.pid),
    () => !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused());
  ipcMain.handle('desktop:input-method-list', event => {
    if (!desktopWindow(event)) throw new Error('Local application frame required');
    return inputMethod.list();
  });
  ipcMain.handle('desktop:input-method-update', (event, request: unknown) => {
    if (!desktopWindow(event)) throw new Error('Local application frame required');
    return inputMethod.update(request);
  });
  ipcMain.handle('desktop:action', (event, action: unknown) => {
    const window = desktopWindow(event);
    if (!window) throw new Error('Local application frame required');
    performDesktopAction(window, action);
  });
  ipcMain.handle('desktop:edit', (event, action: unknown) => {
    const window = desktopWindow(event);
    if (!window) throw new Error('Local application frame required');
    performNativeEdit(window.webContents, action);
  });

  const mcp = mcpLauncher = new McpLauncher({
    runtimeDir: path.join(app.getPath('userData'), 'mcp'),
    binary: path.join(app.isPackaged ? path.join(process.resourcesPath, 'mcp-tunnel')
      : path.join(__dirname, '..', '.gen', 'tunnel', process.arch), process.platform === 'win32' ? 'tunnel-client.exe' : 'tunnel-client'),
    mcpEntry: path.join(path.dirname(serverEntry()), 'mcp.cjs'),
    executable: process.execPath, endpointFile: path.join(DATA_DIR(), 'operations-endpoint.json'),
    serverUrl: baseUrl(serverPort), secrets: safeStorage,
  });
  ipcMain.handle('desktop:mcp-inspect', async event => {
    if (!desktopWindow(event)) throw new Error('Local application frame required');
    return mcp.inspect();
  });
  ipcMain.handle('desktop:mcp-configure', async (event, input) => {
    if (!desktopWindow(event)) throw new Error('Local application frame required');
    return mcp.configure(input);
  });
  ipcMain.handle('desktop:mcp-copy-config', async event => {
    if (!desktopWindow(event)) throw new Error('Local application frame required');
    clipboard.writeText((await mcp.inspect()).clientConfig);
  });
  ipcMain.handle('desktop:mcp-connect', async event => {
    if (!desktopWindow(event)) throw new Error('Local application frame required');
    return mcp.connect();
  });
  ipcMain.on('desktop:renderer-ready', (event, ready: unknown) => {
    const window = desktopWindow(event);
    if (!window) return;
    if (ready === true) rendererReady.add(window); else rendererReady.delete(window);
  });
  ipcMain.on('desktop:close-result', (event, token: unknown, result: unknown) => {
    const window = desktopWindow(event);
    if (!window || !pendingClose || pendingClose.window !== window || pendingClose.token !== token) return;
    const answer = result as { ok?: unknown; error?: unknown } | null;
    if (answer?.ok === true) pendingClose.resolve();
    else pendingClose.reject(new Error(typeof answer?.error === 'string' ? answer.error : '保存未完成'));
  });
  ipcMain.handle('desktop:open-vault-path', async (event, requested: unknown) => {
    if (!desktopWindow(event)) throw new Error('Local application frame required');
    if (typeof requested !== 'string' || !requested.trim() || requested.length > 32768 || requested.includes('\0')) throw new Error('文件路径无效');
    const location = requested.startsWith('~/') ? path.join(os.homedir(), requested.slice(2)) : requested;
    let target: string;
    if (path.isAbsolute(location)) target = path.normalize(location);
    else {
      const vault = await effectiveVaultPath(DATA_DIR(), desktopConfig?.vaultPath);
      target = path.resolve(vault, location);
      const relative = path.relative(vault, target);
      if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('相对路径必须位于当前笔记库内');
    }
    await openExistingPath(target);
  });
  ipcMain.handle('desktop:reveal-vault-path', async (event, requested: unknown) => {
    if (!desktopWindow(event)) throw new Error('Local application frame required');
    if (typeof requested !== 'string') throw new Error('文件路径无效');
    await revealVaultItem(DATA_DIR(), requested, desktopConfig?.vaultPath);
  });

}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && desktopConfig) createWindow(!serverReady);
  });

  app.whenReady().then(async () => {
    try {
      // Isolated test launches use Chromium's mock keychain and never touch the login keychain.
      if (app.isPackaged && process.platform === 'darwin' && !app.commandLine.hasSwitch('use-mock-keychain')) {
        const marker = path.join(app.getPath('userData'), 'keychain-migrated-v1');
        try { await fs.access(marker); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          execFileSync(path.join(process.resourcesPath, 'input-method', 'migrate-keychain'), [app.getPath('exe')], { encoding: 'utf8' });
          await fs.writeFile(marker, 'Shale', { mode: 0o600 });
        }
      }
      if (!app.isPackaged && process.platform === 'darwin') app.dock?.setIcon(DEVELOPMENT_ICON);
      const cfg = await ensureVault(await readConfig());
      if (!cfg) { app.quit(); return; }
      desktopConfig = cfg;
      await writeConfig(cfg);
      registerTitleBar();
      createWindow(true);
      await startServer(cfg);
      buildMenu();
      registerDesktopRequests();
      userscripts = new UserscriptService({ dataDir: DATA_DIR(), fallbackVault: cfg.vaultPath,
        window: () => mainWindow, hostAllowed: event => !!desktopWindow(event) });
      await userscripts.start();
      if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(baseUrl(serverPort));
    } catch (err) {
      await serverProcess?.stop();
      if (!quitRequested && !finishingQuit) dialog.showErrorBox('Shale failed to start', String(err instanceof Error ? err.stack ?? err.message : err));
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', (event) => {
    if (!finishingQuit && mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault();
      void requestWindowClose(mainWindow, true);
      return;
    }
    if (!finishingQuit && (mcpLauncher || serverProcess || userscripts)) {
      event.preventDefault();
      if (!quitRequest) quitRequest = Promise.resolve().then(async () => {
        await Promise.all([mcpLauncher?.stop(), userscripts?.stop()]);
        await serverProcess?.stop();
        finishingQuit = true;
        app.quit();
      })
        .catch(error => dialog.showErrorBox('无法退出 Shale', String(error))).finally(() => { quitRequest = undefined; });
      return;
    }
  });
}
