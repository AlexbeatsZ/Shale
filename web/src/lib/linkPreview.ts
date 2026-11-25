import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { equationContext, extractMetadata, footnotes, footnoteFragment, fragmentRange, isGlobalContentTarget, parseLinkTarget, resolveTarget } from '@shale/markdown-core';
import { contextOf, nonExecutingContext, renderContext, type RenderContext } from './renderContext';
import { followRenderedLink, linkIntent } from './fragmentNavigation';
import { syntaxModel, sourceOf } from './syntaxModel';
import { livePreviewReadonly } from './renderState';
import { RenderLifetime } from './shale/renderLifetime';

export function bindRenderedLink(anchor: HTMLAnchorElement, view: EditorView, target: string, footnote = false) {
  anchor.href = target; anchor.dataset.previewLink = target;
  if (footnote) anchor.dataset.footnote = 'true';
  anchor.addEventListener('mousedown', event => { if (event.button < 2) event.preventDefault(); });
  const open = (event: MouseEvent) => {
    if (event.button > 1) return;
    event.preventDefault(); event.stopPropagation(); followRenderedLink(view, target, linkIntent(event));
  };
  anchor.addEventListener('click', open); anchor.addEventListener('auxclick', open);
  // Chromium on macOS emits contextmenu instead of click for Control+primary.
  // A real secondary-button click continues through the ordinary context menu.
  anchor.addEventListener('contextmenu', event => {
    if (event.button === 0 && (event.ctrlKey || event.metaKey)) open(event);
  });
}

export function mountLinkPreview(host: HTMLElement, context: RenderContext, target: string): () => void {
  const document = host.ownerDocument, lifetime = new RenderLifetime(); void lifetime.load();
  let active: RenderLifetime | undefined, pending: RenderLifetime | undefined;
  const resolved = resolveTarget(target, context.sourcePath, context.files());
  const title = document.createElement('a'); title.className = 'cm-link-preview-header';
  title.textContent = resolved.status === 'resolved' ? resolved.path + (resolved.fragment ? '#' + resolved.fragment : '') : target;
  title.href = target; title.onclick = event => { event.preventDefault(); context.openLink(target, linkIntent(event)); };
  const body = document.createElement('div'); body.className = 'cm-link-preview-body';
  host.append(title, body); body.textContent = '加载预览…';
  lifetime.register(() => { pending?.unload(); active?.unload(); delete body.dataset.renderPending; });
  const mount = (source: string, from: number, model: ReturnType<typeof import('@shale/markdown-core')['analyzeMarkdown']>, scoped: RenderContext) => {
    if (lifetime.signal.aborted) return;
    pending?.unload();
    const render = new RenderLifetime(); void render.load(); pending = render;
    const fragmentHost = document.createElement('div');
    Object.assign(fragmentHost.style, { height: '0', overflow: 'hidden', visibility: 'hidden', pointerEvents: 'none' });
    body.appendChild(fragmentHost); body.dataset.renderPending = 'true';
    render.register(() => fragmentHost.remove());
    const failed = (error: unknown) => {
      if (lifetime.signal.aborted || render.signal.aborted || pending !== render) return;
      render.unload(); pending = undefined; delete body.dataset.renderPending;
      const status = document.createElement('span'); status.setAttribute('role', 'alert'); status.textContent = '预览失败：' + String(error);
      if (!active) body.replaceChildren(status);
      else { body.querySelector(':scope > [role="alert"]')?.remove(); body.appendChild(status); }
    };
    const options = { id: scoped.sourcePath + '#preview', mode: 'reading' as const, sourceFrom: from,
      context: { ...nonExecutingContext(scoped), footnoteBody: true, navigationId: undefined, recordNavigation: undefined },
      equations: equationContext(model, from), mathSource: { model, from }, onError: failed,
      onReady: () => {
        if (lifetime.signal.aborted || render.signal.aborted || pending !== render) return;
        active?.unload(); active = render; pending = undefined;
        fragmentHost.removeAttribute('style'); body.replaceChildren(fragmentHost); delete body.dataset.renderPending;
      },
    };
    try {
      const stop = context.mountFragment?.(fragmentHost, source, options);
      if (!stop) { failed(new Error('Markdown fragment renderer is unavailable')); return; }
      render.register(stop);
    } catch (error) { failed(error); }
  };
  const destination = parseLinkTarget(target);
  const local = !isGlobalContentTarget(target) && (!destination.path || destination.path === context.sourcePath);
  if (resolved.status === 'resolved' && /\.pdf$/i.test(resolved.path)) {
    // A binary attachment is not a Markdown DocumentSession. Share only the
    // read-only resource, with cancellation and the same per-file appearance.
    void Promise.all([import('./pdf/resource'), import('./pdf/preferences'), import('./mediaFilter'), import('./store')]).then(async ([{ acquirePdfResource }, { pdfDarkPreference }, { bindDarkMedia }, { useStore }]) => {
      if (lifetime.signal.aborted) return;
      const acquired = await acquirePdfResource(resolved.path, lifetime.signal);
      if (lifetime.signal.aborted) { acquired.release(); return; }
      lifetime.register(acquired.release);
      const canvas = document.createElement('canvas'); canvas.style.cssText = 'max-width:100%;height:auto;filter:var(--embed-filter, none)';
      body.replaceChildren(canvas);
      // Theme changes are observed by bindDarkMedia; preferences remount its binding.
      let stop = () => {};
      const bind = () => { stop(); stop = bindDarkMedia(body, () => pdfDarkPreference(resolved.path, useStore.getState().pdfDarkOverrides), () => host); };
      let preferences = useStore.getState().pdfDarkOverrides;
      bind(); lifetime.register(() => stop());
      lifetime.register(useStore.subscribe(state => {
        if (state.pdfDarkOverrides !== preferences) { preferences = state.pdfDarkOverrides; bind(); }
      }));
      await acquired.resource.render(1, canvas, 420, lifetime.signal);
    }).catch(error => { if (!lifetime.signal.aborted) body.textContent = '预览失败：' + String(error); });
  } else if (local && context.mathSource) {
    const model = context.mathSource.model, range = fragmentRange(model, destination.fragment);
    if (range) mount(model.text.slice(range.from, range.to), range.from, model, context);
    else body.textContent = '未找到链接目标';
  } else void context.renderEmbed(target, lifetime.signal).then(note => {
    if (lifetime.signal.aborted) return;
    if (!note) { body.textContent = '未找到笔记或链接目标'; return; }
    const paint = () => {
      if (lifetime.signal.aborted) return;
      const data = note.read();
      if (!data?.mathSource) {
        pending?.unload(); pending = undefined; active?.unload(); active = undefined;
        delete body.dataset.renderPending; body.textContent = '未找到链接目标'; return;
      }
      mount(data.source, data.from, data.mathSource.model, { ...note.context, mountFragment: context.mountFragment });
    };
    lifetime.register(note.subscribe(paint)); paint();
  }).catch(error => { if (!lifetime.signal.aborted) body.textContent = '预览失败：' + String(error); });
  return () => lifetime.unload();
}

export class LinkPreviewPopover {
  popup?: HTMLElement; dispose?: () => void;
  timer?: ReturnType<typeof setTimeout>; closing?: ReturnType<typeof setTimeout>;
  element?: HTMLElement; target?: string;
  schedule(element: HTMLElement, target: string, context: RenderContext) {
    clearTimeout(this.closing);
    if (this.element === element && this.target === target && (this.popup || this.timer)) return;
    this.close(); this.element = element; this.target = target;
    this.timer = setTimeout(() => { this.timer = undefined; this.show(element, target, context); }, 300);
  }
  show(element: HTMLElement, target: string, context: RenderContext) {
    const box = element.getBoundingClientRect();
    if (!element.isConnected || element.closest('[hidden]') || box.bottom < 0 || box.top > window.innerHeight) return;
    const popup = document.createElement('div'); popup.className = 'cm-link-preview'; popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', '链接预览');
    popup.style.position = 'fixed'; popup.style.zIndex = '1200';
    popup.onmouseenter = () => clearTimeout(this.closing); popup.onmouseleave = () => this.leave();
    popup.addEventListener('click', event => { if ((event.target as Element).closest('a')) queueMicrotask(this.close); }, true);
    document.body.append(popup); this.popup = popup; this.dispose = mountLinkPreview(popup, context, target);
    const rect = element.getBoundingClientRect();
    popup.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(480, window.innerWidth - 16) - 8)) + 'px';
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 260));
    popup.style.top = top + 'px'; popup.style.maxHeight = Math.min(440, window.innerHeight - top - 8) + 'px';
    document.addEventListener('keydown', this.key); document.addEventListener('pointerdown', this.outside, true); window.addEventListener('blur', this.close);
    document.addEventListener('scroll', this.scroll, true);
  }
  contains(node: Node | null) { return !!node && !!this.popup?.contains(node); }
  leave() { clearTimeout(this.timer); this.timer = undefined; clearTimeout(this.closing); this.closing = setTimeout(this.close, 180); }
  key = (event: KeyboardEvent) => { if (event.key === 'Escape') this.close(); };
  outside = (event: PointerEvent) => { if (!this.contains(event.target as Node) && !this.element?.contains(event.target as Node)) this.close(); };
  scroll = (event: Event) => { if (!this.contains(event.target as Node)) this.close(); };
  close = () => {
    clearTimeout(this.timer); clearTimeout(this.closing); this.timer = undefined;
    this.dispose?.(); this.dispose = undefined; this.popup?.remove(); this.popup = undefined; this.element = undefined; this.target = undefined;
    document.removeEventListener('keydown', this.key); document.removeEventListener('pointerdown', this.outside, true); window.removeEventListener('blur', this.close);
    document.removeEventListener('scroll', this.scroll, true);
  };
}

export const linkPreview = ViewPlugin.fromClass(class {
  target?: { element: HTMLElement; target: string; footnote: boolean };
  popover = new LinkPreviewPopover();
  modifier = false;
  constructor(readonly view: EditorView) {
    view.dom.addEventListener('mouseover', this.over);
    view.dom.addEventListener('mouseout', this.out);
    document.addEventListener('keydown', this.key); document.addEventListener('keyup', this.key);
  }
  over = (event: MouseEvent) => {
    if ((event.target as Element).closest('.cm-editor') !== this.view.dom) return;
    if ((event.target as Element).closest('.cm-image-wrap,[data-image-reference]')) { this.close(); return; }
    this.modifier = event.ctrlKey || event.metaKey;
    const element = (event.target as Element).closest<HTMLElement>('[data-preview-link]');
    let target = element?.dataset.previewLink, footnote = !!element?.dataset.footnote;
    if (!target) {
      const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return;
      const model = this.view.state.field(syntaxModel);
      target = extractMetadata(model).linkOccurrences.find(link => pos >= link.from && pos <= link.to)?.target;
      const note = [...footnotes(model).references].find(([from, note]) => note.references.some(ref => ref.from === from && pos >= ref.from && pos <= ref.to))?.[1];
      if (note) { target = '#' + footnoteFragment(note); footnote = true; }
    }
    if (!target || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(target)) { this.leave(); return; }
    if (this.target?.element === element && this.target.target === target) return;
    this.close(); this.target = { element: element ?? event.target as HTMLElement, target, footnote };
    this.schedule();
  };
  schedule() {
    if (!this.target || (!this.target.footnote && !this.modifier && !this.view.state.field(livePreviewReadonly))) return;
    this.popover.schedule(this.target.element, this.target.target, { ...contextOf(this.view), mathSource: sourceOf(this.view.state) });
  }
  leave() { this.popover.leave(); }
  out = (event: MouseEvent) => {
    if (this.target?.element.contains(event.relatedTarget as Node)) return;
    if (this.popover.contains(event.relatedTarget as Node)) return;
    this.leave();
  };
  key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { this.close(); return; }
    this.modifier = event.ctrlKey || event.metaKey;
    if (this.modifier) this.schedule(); else if (!this.target?.footnote && !this.view.state.field(livePreviewReadonly)) this.popover.close();
  };
  close = () => { this.popover.close(); this.target = undefined; };
  update(update: ViewUpdate) {
    if (update.docChanged || update.startState.facet(renderContext) !== update.state.facet(renderContext)) this.close();
  }
  destroy() {
    this.close(); this.view.dom.removeEventListener('mouseover', this.over); this.view.dom.removeEventListener('mouseout', this.out);
    document.removeEventListener('keydown', this.key); document.removeEventListener('keyup', this.key);
  }
});
