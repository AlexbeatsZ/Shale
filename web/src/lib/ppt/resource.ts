import { parse, parseInWorker, renderSlideToSvg, slideText, type Presentation } from '@web-ppt/core';
import workerUrl from '@web-ppt/core/worker?worker&url';
import { requestBinary } from '../api';
import type { PagedDocumentResource } from '../pdf/documentResource';
import { aborted, assertLive, pdfRenderQueue, pdfTextQueue } from '../pdf/queue';
import type { PageText } from '../pdf/text';
import type { PdfOutlineEntry } from '../pdf/types';
import { measureSlideText, slideTextSvg } from './svgText';

interface SlidePage { markup: string; textSvg: SVGSVGElement; text: PageText }

export class PptResource implements PagedDocumentResource {
  readonly lifetime = new AbortController();
  readonly ready: Promise<{ numPages: number }>;
  private presentation?: Presentation;
  private pages = new Map<number, Promise<SlidePage>>();
  private operations = new Set<Promise<unknown>>();
  private worker?: Worker;
  get pageRatio() { return this.presentation ? this.presentation.height / this.presentation.width : 9 / 16; }

  constructor(readonly path: string, readonly vault: string, readonly url: string) {
    this.ready = this.load();
  }

  private async load() {
    const signal = this.lifetime.signal;
    const bytes = await requestBinary(this.url, { vault: this.vault, signal });
    assertLive(signal);
    const header = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
    const presentation = header[0] === 0x50 && header[1] === 0x4b
      ? await this.parseWorker(bytes) : await parse(bytes);
    if (signal.aborted) { presentation.dispose?.(); throw aborted(); }
    this.presentation = presentation;
    if (!presentation.slides.length || !Number.isFinite(presentation.width) || presentation.width <= 0 ||
      !Number.isFinite(presentation.height) || presentation.height <= 0) {
      presentation.dispose?.(); this.presentation = undefined;
      throw new Error('演示文稿没有可显示的幻灯片或页面尺寸无效');
    }
    return { numPages: presentation.slides.length };
  }

  private async parseWorker(bytes: ArrayBuffer) {
    const worker = new Worker(workerUrl, { type: 'module' });
    this.worker = worker;
    const signal = this.lifetime.signal;
    let stop!: () => void;
    const failed = new Promise<never>((_resolve, reject) => {
      const cancel = () => reject(aborted());
      const error = (event: Event) => reject(new Error(event instanceof ErrorEvent && event.message
        ? `PPT 解析进程加载失败：${event.message}` : 'PPT 解析进程加载失败'));
      signal.addEventListener('abort', cancel, { once: true });
      worker.addEventListener('error', error);
      worker.addEventListener('messageerror', error);
      stop = () => {
        signal.removeEventListener('abort', cancel);
        worker.removeEventListener('error', error); worker.removeEventListener('messageerror', error);
      };
    });
    try {
      return await Promise.race([parseInWorker(worker, bytes).then(presentation => {
        if (signal.aborted) { presentation.dispose?.(); throw aborted(); }
        return presentation;
      }), failed]);
    } finally { stop(); worker.terminate(); this.worker = undefined; }
  }

  private page(number: number): Promise<SlidePage> {
    assertLive(this.lifetime.signal);
    let result = this.pages.get(number);
    if (result) { this.pages.delete(number); this.pages.set(number, result); return result; }
    result = pdfTextQueue.run(async () => {
      await this.ready;
      assertLive(this.lifetime.signal);
      const presentation = this.presentation!;
      const slide = presentation.slides[number - 1];
      if (!slide) throw new Error('幻灯片页码无效');
      const markup = renderSlideToSvg(presentation, slide, { textMode: 'svg', includeNotes: false });
      const textSvg = slideTextSvg(markup, presentation.width, presentation.height);
      return { markup, textSvg, text: measureSlideText(textSvg, presentation.width, presentation.height) };
    }, this.lifetime.signal);
    this.pages.set(number, result);
    void result.catch(() => { if (this.pages.get(number) === result) this.pages.delete(number); });
    while (this.pages.size > 16) this.pages.delete(this.pages.keys().next().value!);
    return result;
  }

  async text(number: number) { return (await this.page(number)).text; }

  async renderText(number: number, container: HTMLElement, width: number, signal: AbortSignal) {
    const page = await this.page(number);
    assertLive(signal); assertLive(this.lifetime.signal);
    const svg = page.textSvg.cloneNode(true) as SVGSVGElement;
    svg.classList.add('ppt-text-layer');
    svg.setAttribute('width', String(width)); svg.setAttribute('height', String(width * this.pageRatio));
    container.replaceChildren(svg);
  }

  async render(number: number, canvas: HTMLCanvasElement, width: number, requestSignal: AbortSignal) {
    const signal = AbortSignal.any([requestSignal, this.lifetime.signal]);
    const operation = pdfRenderQueue.run(async () => {
      const page = await this.page(number);
      assertLive(signal); assertLive(this.lifetime.signal);
      // Only parser-owned local assets are inlined. SVG image loading keeps slide
      // actions and markup outside the application document.
      const sources = [...new Set(page.markup.match(/blob:[^"'\s)<>]+/g) ?? [])];
      let markup = page.markup;
      for (const source of sources) {
        const response = await fetch(source, { signal });
        const blob = await response.blob();
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        markup = markup.split(source).join(data);
      }
      assertLive(signal); assertLive(this.lifetime.signal);
      const image = new Image();
      const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
      const height = width * this.pageRatio;
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (width * height)));
      try {
        await new Promise<void>((resolve, reject) => {
          const cancel = () => { image.src = ''; finish(aborted()); };
          const finish = (error?: Error) => {
            signal.removeEventListener('abort', cancel); this.lifetime.signal.removeEventListener('abort', cancel);
            if (error) reject(error); else resolve();
          };
          image.onload = () => finish(); image.onerror = () => finish(new Error('幻灯片图片渲染失败'));
          signal.addEventListener('abort', cancel, { once: true });
          this.lifetime.signal.addEventListener('abort', cancel, { once: true });
          image.src = url;
        });
        assertLive(signal); assertLive(this.lifetime.signal);
        canvas.width = Math.max(1, Math.floor(width * ratio)); canvas.height = Math.max(1, Math.floor(height * ratio));
        canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('无法创建幻灯片画布');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return { width, height };
      } finally { image.onload = null; image.onerror = null; image.src = ''; URL.revokeObjectURL(url); }
    }, signal);
    this.operations.add(operation);
    try { return await operation; } finally { this.operations.delete(operation); }
  }

  async outline(): Promise<PdfOutlineEntry[]> {
    await this.ready;
    assertLive(this.lifetime.signal);
    const presentation = this.presentation!;
    const pages = presentation.slides.map((slide, index) => ({
      title: slideText({ ...slide, notes: undefined }).split('\n').find(line => line.trim())?.trim() || `第 ${index + 1} 页`,
      page: index + 1, children: [] as PdfOutlineEntry[],
    }));
    const sections = presentation.sections?.filter(section => section.slideIndexes?.length);
    if (!sections?.length) return pages;
    const assigned = new Set<number>();
    const entries: PdfOutlineEntry[] = sections.map(section => {
      const children = section.slideIndexes!.filter(index => pages[index] && !assigned.has(index)).map(index => {
        assigned.add(index); return pages[index];
      });
      return { title: section.name, page: children[0]?.page ?? null, children };
    });
    entries.push(...pages.filter((_page, index) => !assigned.has(index)));
    return entries;
  }

  async destroy() {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort(); this.worker?.terminate();
    await Promise.allSettled([...this.operations]);
    this.pages.clear(); this.presentation?.dispose?.(); this.presentation = undefined;
  }
}
