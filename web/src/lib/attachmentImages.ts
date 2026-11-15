import type { EditorView } from '@codemirror/view';
import { api } from './api';
import { documents } from './documents';
import { captureAttachmentInsertion, insertUploadedImages } from './attachmentInsertion';
import { contextOf } from './renderContext';

/** Shared native-event, Ctrl+V, context-menu and drop image insertion. */
export function insertImageFiles(view: EditorView, files: readonly File[], clipboard = false, position?: number): Promise<void> {
  const context = contextOf(view), sourcePath = context.sourcePath;
  const session = documents.get(sourcePath);
  if (!session) return Promise.resolve();
  const images = files.filter(file => file.type.startsWith('image/'));
  if (!images.length) return Promise.resolve();
  const target = captureAttachmentInsertion(view, session,
    () => documents.get(sourcePath) === session && documents.canRefresh(sourcePath), position);
  if (!target) return Promise.resolve();
  const named = images.map(file => {
    if (!clipboard || file.name !== 'image.png') return file;
    // Chromium names raw clipboard bitmaps image.png. Copied files retain names.
    const stamp = new Date(), pad = (value: number) => String(value).padStart(2, '0');
    const time = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;
    return new File([file], `Pasted image ${time}.png`, { type: file.type });
  });
  return insertUploadedImages(target, named, (file, path) => api.upload(file, undefined, path),
    message => context.reportError?.(message));
}
