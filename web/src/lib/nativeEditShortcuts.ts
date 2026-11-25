import { nativeEditShortcut } from '../../../desktop/src/editShortcuts';
import { isMacOS } from './platform';

/** Run only after the user's command bindings had the first opportunity. */
export function dispatchNativeEdit(event: KeyboardEvent): boolean {
  const bridge = window.shaleDesktop;
  if (!bridge?.runEditAction || event.defaultPrevented || event.isComposing || event.getModifierState('AltGraph')) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('[data-hotkey-recorder]')) return false;
  const action = nativeEditShortcut(event, isMacOS());
  if (!action) return false;
  const editor = target?.closest<HTMLElement>('.cm-editor');
  // Shared history and Vim's Normal/Visual Control chords belong to CodeMirror.
  if (editor) {
    if (action === 'undo' || action === 'redo') return false;
    const mode = editor.dataset.vimMode;
    if (mode && mode !== 'insert' && mode !== 'replace' && event.ctrlKey && !event.metaKey) return false;
  }
  void bridge.runEditAction(action).catch(error => console.error('Native edit failed', error));
  return true;
}
