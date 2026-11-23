import type { EditorView } from '@codemirror/view';

export interface NativeVimState { mode: string; group: number; owner: string }
export const nativeVimStates = new WeakMap<EditorView, NativeVimState>();
export function vimAllowsInsert(view: EditorView): boolean {
  const mode = nativeVimStates.get(view)?.mode;
  return !mode || mode === 'insert' || mode === 'replace';
}
export function vimEditOrigin(view: EditorView): string | undefined {
  const state = nativeVimStates.get(view);
  return state ? `vim:${state.owner}:${state.group}` : undefined;
}
