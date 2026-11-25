import { useSyncExternalStore } from 'react';
import { api } from './api';
import { UiSettingsSchema, type UiSettings } from '../../../server/src/contracts/uiSettings';

export type LineNumberStyle = UiSettings['lineNumbers'];
let current: LineNumberStyle = 'off', revision = 0;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();
export const lineNumberStyle = () => current;
export const subscribeLineNumbers = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
function accept(value: unknown) {
  const parsed = UiSettingsSchema.safeParse(value);
  if (!parsed.success || parsed.data.lineNumbers === current) return;
  current = parsed.data.lineNumbers;
  listeners.forEach(listener => listener());
}
if (typeof window !== 'undefined') window.addEventListener('settings-changed', event => {
  revision++;
  accept((event as CustomEvent<{ ui?: unknown }>).detail?.ui);
});
export function ensureLineNumbers() {
  const before = revision;
  return loading ??= api.getSettings().then(settings => {
    if (revision === before) accept(settings.ui);
  }).catch(() => { loading = undefined; });
}
export const useLineNumbers = () => useSyncExternalStore(subscribeLineNumbers, lineNumberStyle);
