import { app, Menu, type BrowserWindow } from 'electron';
import { desktopActions, type DesktopAction } from './bridge';

/** Only the checked local main-frame bridge can call this finite action set. */
export function performDesktopAction(window: BrowserWindow, requested: unknown): void {
  const definition = desktopActions.find(action => action.id === requested);
  if (!definition || 'macOnly' in definition && process.platform !== 'darwin') throw new Error('Unsupported desktop action');
  const action = definition.id as DesktopAction, contents = window.webContents;
  switch (action) {
    case 'app:reload': contents.reload(); break;
    case 'app:force-reload': contents.reloadIgnoringCache(); break;
    case 'app:toggle-devtools': contents.toggleDevTools(); break;
    case 'app:reset-zoom': contents.setZoomLevel(0); break;
    case 'app:zoom-in': contents.setZoomLevel(contents.getZoomLevel() + 0.5); break;
    case 'app:zoom-out': contents.setZoomLevel(contents.getZoomLevel() - 0.5); break;
    case 'app:toggle-fullscreen': window.setFullScreen(!window.isFullScreen()); break;
    case 'app:minimize': window.minimize(); break;
    case 'app:zoom-window': if (window.isMaximized()) window.unmaximize(); else window.maximize(); break;
    case 'workspace:close-window': window.close(); break;
    case 'app:quit': app.quit(); break;
    case 'app:hide': app.hide(); break;
    case 'app:hide-others': Menu.sendActionToFirstResponder('hideOtherApplications:'); break;
    case 'app:unhide': Menu.sendActionToFirstResponder('unhideAllApplications:'); break;
    case 'app:bring-to-front': Menu.sendActionToFirstResponder('arrangeInFront:'); break;
    case 'native:cut': contents.cut(); break;
    case 'native:copy': contents.copy(); break;
    case 'native:paste': contents.paste(); break;
    case 'native:paste-plain': contents.pasteAndMatchStyle(); break;
    case 'native:delete': contents.delete(); break;
    case 'native:select-all': contents.selectAll(); break;
    case 'native:start-speaking': Menu.sendActionToFirstResponder('startSpeaking:'); break;
    case 'native:stop-speaking': Menu.sendActionToFirstResponder('stopSpeaking:'); break;
  }
}
