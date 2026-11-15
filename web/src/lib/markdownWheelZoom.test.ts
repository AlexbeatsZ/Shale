import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { defaultUiSettings } from '../../../server/src/contracts/uiSettings';

const fixture = vi.hoisted(() => ({ putSettings: vi.fn(), getSettings: vi.fn(), notify: vi.fn() }));
vi.mock('./api', () => ({ api: fixture }));
vi.mock('./store', () => ({ useStore: { getState: () => ({ vaultSessionStale: false, notify: fixture.notify }) } }));

class DetailEvent extends Event {
  detail: unknown;
  constructor(type: string, options: { detail: unknown }) { super(type); this.detail = options.detail; }
}

let cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers(); vi.resetModules();
  fixture.putSettings.mockReset(); fixture.getSettings.mockReset(); fixture.notify.mockReset();
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('CustomEvent', DetailEvent);
});
afterEach(async () => {
  cleanups.forEach(cleanup => cleanup()); cleanups = [];
  await vi.runAllTimersAsync(); vi.useRealTimers(); vi.unstubAllGlobals();
});

async function editor() {
  const module = await import('./markdownWheelZoom');
  const dom = new EventTarget();
  cleanups.push(module.bindMarkdownWheelZoom({ dom } as unknown as EditorView));
  return { ...module, dom, wheel() {
    const event = new Event('wheel', { cancelable: true });
    Object.assign(event, { ctrlKey: true, altKey: false, metaKey: false, deltaY: -100, deltaMode: 0 });
    dom.dispatchEvent(event); return event;
  } };
}

it('blocks document page zoom by default without fetching additional settings', async () => {
  const view = await editor();
  expect(view.wheel().defaultPrevented).toBe(true);
  await vi.runAllTimersAsync();
  expect(fixture.getSettings).not.toHaveBeenCalled(); expect(fixture.putSettings).not.toHaveBeenCalled();
});

it('previews each font step immediately and saves a coalesced font-only patch', async () => {
  const view = await editor(), previews: unknown[] = [];
  window.addEventListener('document-font-preview', event => previews.push((event as CustomEvent).detail));
  view.configureMarkdownWheelZoom({ ...defaultUiSettings, ctrlWheelFontSize: true, theme: 'obsidian-dark' });
  fixture.putSettings.mockResolvedValue({ ui: { ...defaultUiSettings, ctrlWheelFontSize: true, theme: 'obsidian-dark', fontTextSize: 20 } });
  view.wheel(); view.wheel();
  expect(previews).toEqual([{ fontTextSize: 19 }, { fontTextSize: 20 }]);
  expect(fixture.putSettings).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(120);
  expect(fixture.putSettings).toHaveBeenCalledExactlyOnceWith({ ui: { fontTextSize: 20 } });
  expect(previews.at(-1)).toEqual({ fontTextSize: null });
});

it('restores the persisted font after failure and yields to an explicit font setting', async () => {
  const view = await editor(), previews: unknown[] = [];
  window.addEventListener('document-font-preview', event => previews.push((event as CustomEvent).detail));
  view.configureMarkdownWheelZoom({ ...defaultUiSettings, ctrlWheelFontSize: true });
  fixture.putSettings.mockRejectedValue(new Error('disk busy'));
  view.wheel(); await vi.advanceTimersByTimeAsync(120);
  expect(previews.at(-1)).toEqual({ fontTextSize: null }); expect(fixture.notify).toHaveBeenCalledOnce();
  view.wheel(); expect(previews.at(-1)).toEqual({ fontTextSize: 19 });
  view.configureMarkdownWheelZoom({ ...defaultUiSettings, ctrlWheelFontSize: true, fontTextSize: 24 });
  expect(previews.at(-1)).toEqual({ fontTextSize: null });
  await vi.advanceTimersByTimeAsync(120); expect(fixture.putSettings).toHaveBeenCalledOnce();
});
