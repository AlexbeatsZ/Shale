import type { PageText } from './text';
import type { PdfOutlineEntry } from './types';

/** The existing page reader consumes either local PDF pages or PowerPoint slides. */
export interface PagedDocumentResource {
  readonly lifetime: AbortController;
  readonly ready: Promise<{ numPages: number }>;
  readonly pageRatio?: number;
  render(page: number, canvas: HTMLCanvasElement, width: number, signal: AbortSignal): Promise<{ width: number; height: number }>;
  renderText(page: number, container: HTMLElement, width: number, signal: AbortSignal): Promise<void>;
  text(page: number): Promise<PageText>;
  outline(): Promise<PdfOutlineEntry[]>;
  destroy(): Promise<void>;
}

export const isPresentation = (path: string) => /\.pptx?$/i.test(path);
export const isPagedDocument = (path: string) => /\.(pdf|pptx?)$/i.test(path);
export const pagedDocumentLabel = (path: string) => isPresentation(path) ? 'PPT' : 'PDF';
