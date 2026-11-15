import { css, scriptPath } from 'virtual:javascript-frame';
import type { JavascriptRun } from './lifetime';
import { createWidgets, type WidgetLibrary, type OutlineOptions, type UptimerOptions, type FolderTagOverviewOptions, type CalloutOptions } from './widgets';

type FrameMessage = { type: string; height?: number; error?: string; id?: number; method?: string; args?: unknown[] };

/** Only explicit read/render capabilities cross this channel. No host objects do. */
async function request(run: JavascriptRun, native: HTMLElement, widgets: WidgetLibrary, method: string, args: unknown[]) {
  run.assertActive();
  switch (method) {
    case 'palette':
      if (args[0] !== 'files' && args[0] !== 'commands') throw new Error('图表仅可打开文件或命令选择器');
      run.app.commands.executeCommandById(args[0]); return;
    case 'watch':
      if (typeof args[0] !== 'string') throw new Error('watch 需要笔记路径');
      run.watch(args[0]); return;
    case 'renderMarkdown':
      if (typeof args[0] !== 'string') throw new Error('renderMarkdown 需要 Markdown 文本');
      return run.renderMarkdown(args[0], native);
    case 'widgets.outline': return widgets.outline(args[0] as OutlineOptions | undefined);
    case 'widgets.directoryIndex': return widgets.directoryIndex();
    case 'widgets.folderTagOverview': return widgets.folderTagOverview(args[0] as FolderTagOverviewOptions);
    case 'widgets.callouts': return widgets.callouts(args[0] as CalloutOptions);
    case 'widgets.uptimer': return widgets.uptimer(args[0] as UptimerOptions | undefined);
    default: throw new Error('图表不支持此宿主操作');
  }
}

export function renderJavascriptFrame(source: string, output: HTMLElement, run: JavascriptRun,
  measure: () => void): Promise<void> {
  const doc = output.ownerDocument;
  const frame = doc.createElement('iframe');
  frame.className = 'interactive-js-frame';
  frame.title = '笔记交互图表';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");
  frame.referrerPolicy = 'no-referrer';
  const runtimeUrl = new URL(scriptPath, doc.location.href).href;
  const policy = `default-src 'none'; script-src ${runtimeUrl} 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  // Embedded enforcement also applies this policy to attempted frame navigations.
  frame.setAttribute('csp', policy);
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="widget-container"></div><script src="${runtimeUrl}"></script></body></html>`;
  const native = doc.createElement('div');
  native.className = 'interactive-js-native-output';
  output.append(frame, native);
  // Existing native widgets render into their own host-owned output.
  const widgets = createWidgets({
    app: run.app, container: native, context: run.context, sourcePath: run.sourcePath,
    note: run.note.bind(run), watch: run.watch, watchDirectory: run.watchDirectory.bind(run),
    renderMarkdown: (markdown, target = native, context = run.context) => run.renderMarkdown(markdown, target, context),
    targetContext: run.targetContext.bind(run),
  });
  const channel = new MessageChannel();
  const theme = () => output.closest('.theme-dark, .theme-light')?.classList.contains('theme-dark') ? 'dark' : 'light';
  const observer = new MutationObserver(() => channel.port1.postMessage({ type: 'theme', theme: theme() }));
  for (let ancestor = output.parentElement; ancestor; ancestor = ancestor.parentElement)
    observer.observe(ancestor, { attributes: true, attributeFilter: ['class'] });

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (error) reject(error); else resolve();
    };
    const timeout = window.setTimeout(() => finish(new Error('图表初始化超时')), 30000);
    run.onCleanup(() => {
      observer.disconnect();
      channel.port1.postMessage({ type: 'dispose' });
      channel.port1.close(); channel.port2.close();
      frame.remove(); native.remove();
      finish(new Error('图表已关闭'));
    });
    channel.port1.onmessage = (event: MessageEvent<FrameMessage>) => {
      if (run.signal.aborted || !event.data || typeof event.data !== 'object') return;
      const value = event.data;
      if (value.type === 'complete') finish();
      else if (value.type === 'error') finish(new Error(String(value.error)));
      else if (value.type === 'height' && Number.isFinite(value.height)) {
        frame.style.height = Math.max(1, Math.min(30000, value.height!)) + 'px'; measure();
      } else if (value.type === 'request' && Number.isSafeInteger(value.id) && typeof value.method === 'string' && Array.isArray(value.args)) {
        void request(run, native, widgets, value.method, value.args).then(
          () => { if (!run.signal.aborted) channel.port1.postMessage({ type: 'reply', id: value.id }); },
          error => { if (!run.signal.aborted) channel.port1.postMessage({ type: 'reply', id: value.id, error: String(error) }); },
        );
      }
    };
    frame.addEventListener('load', () => {
      if (!run.signal.aborted) frame.contentWindow?.postMessage({ type: 'webobsidian-widget', source, sourcePath: run.sourcePath, theme: theme() }, '*', [channel.port2]);
    }, { once: true });
  });
}
