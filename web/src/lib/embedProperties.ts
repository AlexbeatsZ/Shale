import { request } from './api';
import type { VaultConfigurationSource } from '../../../server/src/contracts';

export const EMBED_PROPERTIES_PATH = '.shale/embeds.css';
const listeners = new Set<() => void>();
let names: readonly string[] = [];
export const customEmbedProperties = () => names;
export function subscribeEmbedProperties(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
const notify = () => {
  listeners.forEach(listener => listener());
  window.dispatchEvent(new Event('embed-properties-changed'));
};

/** A single Vault stylesheet supplies named boolean properties through .embed-property-NAME. */
export function initializeEmbedProperties(reportError: (error: string) => void) {
  let stopped = false, generation = 0, timer: ReturnType<typeof setTimeout> | undefined;
  let style: HTMLStyleElement | undefined;
  const refresh = async () => {
    const current = ++generation;
    try {
      const source = await request<VaultConfigurationSource>('/api/settings/embed-properties');
      if (stopped || current !== generation) return;
      style?.remove(); style = undefined;
      const declared = new Set<string>();
      if (source.exists) {
        style = document.createElement('style'); style.dataset.embedProperties = source.vault;
        style.textContent = source.content; document.head.append(style);
        const read = (rules: CSSRuleList) => {
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule) for (const match of rule.selectorText.matchAll(/\.embed-property-([a-z][a-z0-9-]*)(?![\w-])/g)) declared.add(match[1]);
            if ('cssRules' in rule) read((rule as CSSGroupingRule).cssRules);
          }
        };
        if (style.sheet) read(style.sheet.cssRules);
      }
      names = [...declared].sort(); notify();
    } catch (error) { if (!stopped && current === generation) reportError(`图片属性样式读取失败：${String(error)}`); }
  };
  const changed = (event: Event) => {
    if ((event as CustomEvent<{ path?: string }>).detail?.path !== EMBED_PROPERTIES_PATH) return;
    clearTimeout(timer); timer = setTimeout(() => void refresh(), 0);
  };
  const dispose = () => {
    stopped = true; generation++; clearTimeout(timer); style?.remove(); names = []; notify();
    window.removeEventListener('vault-configuration-changed', changed); window.removeEventListener('vault-changed', dispose);
  };
  window.addEventListener('vault-configuration-changed', changed); window.addEventListener('vault-changed', dispose);
  void refresh();
  return dispose;
}
