import { desktopActions, type DesktopAction } from '../../../desktop/src/bridge';
import type { NativeCommand } from './commands';
import { saveWorkspaceBeforeExit } from './store';
import { getActiveEditor } from './activeEditor';
import { isMacOS } from './platform';

export async function runDesktopAction(id: DesktopAction) {
  const bridge = window.shaleDesktop;
  if (!bridge?.runAction) throw new Error('此命令需要桌面应用');
  if (id === 'app:reload' || id === 'app:force-reload') {
    await saveWorkspaceBeforeExit();
  }
  if (id.startsWith('native:') && !document.activeElement?.matches('input, textarea, webview, [contenteditable="true"]')) getActiveEditor()?.focus();
  await bridge.runAction(id);
}
export const desktopActionCommands: NativeCommand[] = desktopActions.map(action => ({
  id: action.id, title: action.title, hotkeys: [],
  available: () => !!window.shaleDesktop?.runAction && (!('macOnly' in action) || isMacOS()),
  run: () => runDesktopAction(action.id),
}));
