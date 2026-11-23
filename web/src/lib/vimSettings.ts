import { useSyncExternalStore } from 'react';
import { api } from './api';
import { UiSettingsSchema, type UiSettings } from '../../../server/src/contracts/uiSettings';

export type VimSettings = Pick<UiSettings, 'vimEnabled' | 'vimInputMethod' | 'vimEnglishSource'>;
let current: VimSettings = { vimEnabled: false, vimInputMethod: true, vimEnglishSource: '' };
const listeners = new Set<() => void>();
let loading: Promise<void> | undefined, revision = 0;
export const vimSettings = () => current;
export const subscribeVimSettings = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function accept(value: unknown) {
  const parsed = UiSettingsSchema.safeParse(value);
  if (!parsed.success) return;
  const { vimEnabled, vimInputMethod, vimEnglishSource } = parsed.data;
  const next = { vimEnabled, vimInputMethod, vimEnglishSource };
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next; revision++; listeners.forEach(listener => listener());
}
if (typeof window !== 'undefined') window.addEventListener('settings-changed', event => {
  revision++; accept((event as CustomEvent<{ ui?: unknown }>).detail?.ui);
});
export function ensureVimSettings() {
  const before = revision;
  return loading ??= api.getSettings().then(value => { if (before === revision) accept(value.ui); }).catch(() => { loading = undefined; });
}
export function useVimSettings() {
  return useSyncExternalStore(subscribeVimSettings, vimSettings);
}
