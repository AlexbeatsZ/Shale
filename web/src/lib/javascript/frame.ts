import './frame.css';
import { chart, echarts, type ChartOptions } from './charts';
import type { EChartsOption } from 'echarts';
import { createUI } from './ui';
import { compileJavascript } from './execute';

type Reply = { type: 'reply'; id: number; error?: string };
type HostMessage = Reply | { type: 'theme'; theme: 'light' | 'dark' } | { type: 'dispose' };

/** This module is built into a standalone script with no host imports. */
function connect(event: MessageEvent) {
  if (event.source !== parent || event.data?.type !== 'shale-widget' || event.ports.length !== 1) return;
  window.removeEventListener('message', connect);
  const port = event.ports[0];
  const source = String(event.data.source);
  const sourcePath = String(event.data.sourcePath);
  const controller = new AbortController();
  const cleanups: (() => void)[] = [];
  const pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
  let sequence = 0;
  let measuring = false;
  const container = document.getElementById('widget-container')!;
  const theme = (value: 'light' | 'dark') => {
    document.documentElement.dataset.theme = value;
    window.dispatchEvent(new Event('widget-theme'));
  };
  const measure = () => {
    if (measuring || controller.signal.aborted) return;
    measuring = true;
    requestAnimationFrame(() => {
      measuring = false;
      port.postMessage({ type: 'height', height: Math.ceil(Math.max(document.body.getBoundingClientRect().height, container.scrollHeight)) });
    });
  };
  const onCleanup = (cleanup: () => void) => {
    if (controller.signal.aborted) cleanup();
    else cleanups.push(cleanup);
  };
  const dispose = () => {
    controller.abort();
    for (const cleanup of cleanups.splice(0).reverse()) {
      try { cleanup(); } catch { /* One failing local cleanup must not stop the others. */ }
    }
    for (const request of pending.values()) request.reject(new Error('图表已关闭'));
    pending.clear();
    port.close();
  };
  const request = (method: string, args: unknown[] = []) => new Promise<void>((resolve, reject) => {
    if (controller.signal.aborted) { reject(new Error('图表已关闭')); return; }
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    try { port.postMessage({ type: 'request', id, method, args }); }
    catch (error) { pending.delete(id); reject(error); }
  });
  const showError = (error: unknown) => {
    const pre = document.createElement('pre');
    pre.className = 'interactive-js-error';
    pre.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
    container.append(pre); measure();
  };
  // Preserve these read-only application entry points while a chart has focus.
  window.addEventListener('keydown', event => {
    if (!event.isTrusted || !event.ctrlKey || event.altKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'p' && (key !== 'o' || event.shiftKey)) return;
    event.preventDefault();
    void request('palette', [key === 'o' ? 'files' : 'commands']).catch(showError);
  });
  window.addEventListener('error', event => { event.preventDefault(); showError(event.error ?? event.message); });
  window.addEventListener('unhandledrejection', event => { event.preventDefault(); showError(event.reason); });
  window.addEventListener('pagehide', dispose, { once: true });
  const observer = new ResizeObserver(measure);
  observer.observe(document.body);
  onCleanup(() => observer.disconnect());
  port.onmessage = (message: MessageEvent<HostMessage>) => {
    const value = message.data;
    if (value.type === 'dispose') dispose();
    else if (value.type === 'theme') { theme(value.theme); measure(); }
    else if (value.type === 'reply') {
      const waiting = pending.get(value.id);
      pending.delete(value.id);
      if (value.error) waiting?.reject(new Error(value.error));
      else waiting?.resolve();
    }
  };
  theme(event.data.theme === 'dark' ? 'dark' : 'light');
  const component = {
    register: onCleanup,
    registerDomEvent(target: EventTarget, name: string, callback: EventListener, options?: AddEventListenerOptions) {
      target.addEventListener(name, callback, options);
      onCleanup(() => target.removeEventListener(name, callback, options));
    },
    registerInterval(id: number) { onCleanup(() => window.clearInterval(id)); return id; },
  };
  const widgets = Object.fromEntries(['uptimer', 'directoryIndex', 'folderTagOverview', 'outline', 'callouts']
    .map(name => [name, (...args: unknown[]) => request('widgets.' + name, args)]));
  try {
    const execute = compileJavascript(source,
      ['container', 'sourcePath', 'component', 'echarts', 'chart', 'ui', 'widgets', 'watch', 'onCleanup', 'renderMarkdown', 'signal'],
      'shale-chart/' + encodeURIComponent(sourcePath));
    void execute(container, sourcePath, component, echarts,
      (option: EChartsOption, options?: ChartOptions) => chart(container, onCleanup, option, options),
      createUI(container, onCleanup, controller.signal, measure), widgets,
      (path: string) => request('watch', [path]), onCleanup,
      (markdown: string) => request('renderMarkdown', [markdown]), controller.signal)
      .then(() => { measure(); port.postMessage({ type: 'complete' }); })
      .catch(error => port.postMessage({ type: 'error', error: String(error instanceof Error ? error.stack ?? error.message : error) }));
  } catch (error) { port.postMessage({ type: 'error', error: String(error) }); }
}
window.addEventListener('message', connect);
