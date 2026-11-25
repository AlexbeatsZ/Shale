import type { WebContents } from 'electron';

const actions = ['undo', 'redo', 'cut', 'copy', 'paste', 'pasteAndMatchStyle', 'selectAll'] as const;
export type NativeEditAction = typeof actions[number];
type EditKey = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };

/** Chromium's native edit defaults, independent of app/menu accelerators. */
export function nativeEditShortcut(input: EditKey, mac: boolean): NativeEditAction | undefined {
  if (input.altKey || (mac ? !input.metaKey || input.ctrlKey : !input.ctrlKey || input.metaKey)) return;
  const key = input.key.toLowerCase();
  if (key === 'v') return input.shiftKey ? 'pasteAndMatchStyle' : 'paste';
  if (key === 'z') return input.shiftKey ? 'redo' : 'undo';
  if (input.shiftKey) return;
  if (key === 'c') return 'copy';
  if (key === 'x') return 'cut';
  if (key === 'a') return 'selectAll';
  if (!mac && key === 'y') return 'redo';
}

/** The caller supplies the already authorized host or the attached guest itself. */
export function performNativeEdit(contents: Pick<WebContents, NativeEditAction>, requested: unknown): void {
  if (!actions.includes(requested as NativeEditAction)) throw new Error('Unsupported native edit action');
  contents[requested as NativeEditAction]();
}
