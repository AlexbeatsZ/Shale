import type { EditorView } from '@codemirror/view';
import { api } from './api';
import { useStore } from './store';
import { defaultUiSettings, documentAppearance, type UiSettings } from '../../../server/src/contracts/uiSettings';
import { wheelPixels } from './pdf/zoom';

let ui: UiSettings = defaultUiSettings;
let initialized = false;
let users = 0;
let requestedSize: number | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let saving: { value: number } | undefined;
let generation = 0;

export interface DocumentFontPreview { fontTextSize: number | null }

function preview(fontTextSize: number | null) {
  window.dispatchEvent(new CustomEvent<DocumentFontPreview>('document-font-preview', { detail: { fontTextSize } }));
}

/** The application supplies its already loaded settings and retains ownership of document CSS. */
export function configureMarkdownWheelZoom(settings: UiSettings): void {
  const externalSizeChange = settings.fontTextSize !== ui.fontTextSize && settings.fontTextSize !== saving?.value;
  ui = settings;
  if (requestedSize !== undefined && (externalSizeChange || !ui.ctrlWheelFontSize)) {
    clearTimeout(timer); timer = undefined;
    requestedSize = undefined; generation++;
    preview(null);
  }
}

function settingsChanged(event: Event) {
  const detail = (event as CustomEvent<{ ui?: Partial<UiSettings> }>).detail;
  if (detail?.ui) configureMarkdownWheelZoom({ ...ui, ...detail.ui });
}

async function saveSize() {
  clearTimeout(timer); timer = undefined;
  if (saving || requestedSize === undefined) return;
  const value = requestedSize, version = generation;
  saving = { value };
  try {
    const settings = await api.putSettings({ ui: { fontTextSize: value } });
    configureMarkdownWheelZoom({ ...ui, ...settings.ui });
  }
  catch (error) { useStore.getState().notify(`保存正文字号失败：${String(error)}`); }
  finally {
    saving = undefined;
    if (version === generation) { requestedSize = undefined; preview(null); }
    else if (requestedSize !== undefined) timer = setTimeout(() => void saveSize(), 0);
  }
}

/** Bind to each native Markdown editor so nested editors consume their own wheel event first. */
export function bindMarkdownWheelZoom(view: EditorView): () => void {
  users++;
  if (!initialized) {
    initialized = true;
    window.addEventListener('settings-changed', settingsChanged);
  }
  let amount = 0;
  const wheel = (event: WheelEvent) => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented || !event.deltaY) return;
    event.preventDefault(); event.stopPropagation();
    if (!ui.ctrlWheelFontSize || useStore.getState().vaultSessionStale) return;
    amount += wheelPixels(event);
    if (Math.abs(amount) < 40) return;
    const limits = documentAppearance.fontTextSize;
    const delta = amount < 0 ? 1 : -1; amount = 0;
    const size = Math.max(limits.min, Math.min(limits.max, (requestedSize ?? ui.fontTextSize) + delta));
    if (size === (requestedSize ?? ui.fontTextSize)) return;
    requestedSize = size; generation++;
    preview(size);
    clearTimeout(timer); timer = setTimeout(() => void saveSize(), 120);
  };
  view.dom.addEventListener('wheel', wheel, { passive: false });
  return () => {
    view.dom.removeEventListener('wheel', wheel);
    if (--users === 0) {
      window.removeEventListener('settings-changed', settingsChanged);
      initialized = false;
      void saveSize();
    }
  };
}
