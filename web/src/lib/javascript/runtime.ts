import type { App } from '../shale/runtime';
import { Component } from '../shale/events';
import { registerCodeProcessor, type CodeBlockContext } from '../shale/markdown';
import { JavascriptRun } from './lifetime';
export { JavascriptRun } from './lifetime';

import { executableSource } from './directive';
import './styles.css';

type Sandbox = typeof import('./sandbox');
let sandboxLoading: Promise<Sandbox> | undefined;
const loadSandbox = () => sandboxLoading ??= import('./sandbox').catch(error => { sandboxLoading = undefined; throw error; });

class JavascriptBlock extends Component {
  private disposed = false;
  private timer?: number;
  private run?: JavascriptRun;
  private complete?: JavascriptRun;
  private error?: HTMLElement;
  constructor(private app: App, private source: string, private host: HTMLElement, private ctx: CodeBlockContext) {
    super();
    host.classList.add('interactive-js-render');
  }
  onload() { return this.render(); }
  onunload() { this.disposed = true; window.clearTimeout(this.timer); this.error?.remove(); }
  private schedule = () => {
    if (this.disposed || this.timer !== undefined) return;
    this.timer = window.setTimeout(() => { this.timer = undefined; void this.render(); }, 80);
  };
  private async render() {
    if (this.disposed || this.ctx.signal.aborted) return;
    window.clearTimeout(this.timer); this.timer = undefined;
    this.error?.remove(); this.error = undefined;
    if (this.run && this.run !== this.complete) this.removeChild(this.run);
    const doc = this.host.ownerDocument;
    const output = doc.createElement('div'); output.className = 'interactive-js-output';
    const stage = doc.createElement('div'); stage.append(output); this.host.append(stage);
    stage.style.visibility = 'hidden'; stage.style.height = '0'; stage.style.overflow = 'hidden';
    const pending = doc.createElement('span'); pending.setAttribute('role', 'status'); pending.textContent = '正在渲染…';
    if (!this.complete) this.host.append(pending);
    const run = new JavascriptRun(this.app, output, this.ctx.renderContext,
      () => { if (this.run === run) this.schedule(); }, this.ctx.requestMeasure);
    run.register(() => { pending.remove(); stage.remove(); });
    this.run = this.addChild(run); void run.load();
    this.host.dataset.renderPending = 'true'; this.host.setAttribute('aria-busy', 'true');
    try {
      const sandbox = await loadSandbox(); run.assertActive();
      await sandbox.renderJavascriptFrame(this.source, output, run, this.ctx.requestMeasure);
      run.assertActive();
      if (this.complete) this.removeChild(this.complete);
      this.complete = run;
      stage.style.visibility = ''; stage.style.height = ''; stage.style.overflow = '';
    } catch (error) {
      if (!run.signal.aborted) {
        // Dispose partial output as well as charts/observers created before errors.
        this.removeChild(run);
        const pre = this.host.ownerDocument.createElement('pre'); pre.className = 'interactive-js-error';
        pre.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
        this.host.append(pre); this.error = pre;
      }
    } finally {
      pending.remove();
      if (!this.disposed && this.run === run) {
        delete this.host.dataset.renderPending; this.host.removeAttribute('aria-busy'); this.ctx.requestMeasure();
        if (run.signal.aborted) this.run = this.complete;
      }
    }
  }
}

/** Called by application bootstrap with the existing app, never imported back. */
export function installJavascript(app: App): () => void {
  const owner = new Component(); void owner.load();
  for (const language of ['js-widget', 'javascript-widget', 'js', 'javascript']) {
    const dedicated = language.endsWith('-widget');
    registerCodeProcessor(owner, language, (source, element, context: CodeBlockContext) => {
      const block = new JavascriptBlock(app, executableSource(source, dedicated)!, element, context);
      context.addChild(block);
      return block.load();
    }, 0, { scope: 'script', accepts: source => executableSource(source, dedicated) !== null });
  }
  return () => owner.unload();
}
