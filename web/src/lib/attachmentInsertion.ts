import { ChangeSet } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { DocumentSession } from '@shale/markdown-core';
import { contextOf } from './renderContext';
import { sourceOf } from './syntaxModel';

type AttachmentSession = Pick<DocumentSession, 'id' | 'snapshot' | 'subscribeChanges' | 'edit'>;

/** Keep an upload attached to its original source range while the user edits. */
export function captureAttachmentInsertion(view: EditorView, session: AttachmentSession, isCurrent: () => boolean, position?: number) {
  const context = contextOf(view), source = sourceOf(view.state);
  if (view.state.readOnly || view.composing || session.snapshot.locked || session.snapshot.conflict || !isCurrent()
    || context.sourcePath !== session.id || source.model.text !== session.snapshot.text
    || source.model.text.slice(source.from, source.from + view.state.doc.length) !== view.state.doc.toString()) return;
  const selection = view.state.selection.main;
  let from = source.from + (position ?? selection.from), to = source.from + (position ?? selection.to);
  if (from < source.from || to > source.from + view.state.doc.length) return;
  let length = session.snapshot.text.length;
  const path = session.id;
  const release = session.subscribeChanges(edits => {
    const changes = ChangeSet.of(edits, length);
    // New typing inside a pending replacement belongs to the user. Keep it
    // and turn the upload into an insertion after the changed selection.
    const touched = from !== to && edits.some(edit => edit.from <= to && edit.to >= from);
    if (from === to || touched) from = to = changes.mapPos(to, 1);
    else { from = changes.mapPos(from, 1); to = changes.mapPos(to, -1); }
    length = changes.newLength;
  });
  return {
    session, path, release,
    insert(paths: readonly string[]) {
      if (!paths.length) return;
      if (!isCurrent() || session.id !== path || session.snapshot.locked || session.snapshot.conflict)
        throw new Error('原笔记已关闭、移动或暂时无法编辑');
      const current = session.snapshot;
      const prefix = from > 0 && current.text[from - 1] !== '\n' ? '\n' : '';
      const suffix = to < current.text.length && current.text[to] !== '\n' ? '\n' : '';
      const insert = prefix + paths.map(path => `![[${path}]]`).join('\n') + suffix;
      if (view.dom.isConnected) {
        if (view.state.readOnly || contextOf(view).sourcePath !== path) throw new Error('原编辑位置已切换为只读或其他笔记');
        const offset = sourceOf(view.state).from;
        if (from >= offset && to <= offset + view.state.doc.length
          && current.text.slice(offset, offset + view.state.doc.length) === view.state.doc.toString()) {
          const version = current.version;
          view.dispatch({ changes: { from: from - offset, to: to - offset, insert }, userEvent: 'input.paste' });
          if (session.snapshot.version === version) throw new Error('原编辑位置拒绝了附件插入');
          return;
        }
      }
      if (context.sourceFragment) throw new Error('原嵌入编辑位置已关闭或改变');
      session.edit(current.version, [{ from, to, insert }], 'input.paste');
    },
  };
}

const uploadsByDocument = new WeakMap<AttachmentSession, Promise<void>>();
type Insertion = NonNullable<ReturnType<typeof captureAttachmentInsertion>>;

/** Upload immediately, then commit batches in the order they were pasted. */
export function insertUploadedImages(target: Insertion, files: readonly File[],
  upload: (file: File, sourcePath: string) => Promise<{ path: string }>, notify: (message: string) => void): Promise<void> {
  const uploading = (async () => {
    const paths: string[] = [];
    for (const file of files) {
      try { paths.push((await upload(file, target.path)).path); }
      catch (error) { notify(error instanceof Error ? error.message : String(error)); }
    }
    return paths;
  })();
  const previous = uploadsByDocument.get(target.session) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const paths = await uploading;
    try {
      target.insert(paths);
      for (const path of paths) notify(`已插入 ${path}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      notify(`${reason}，附件已保存到 ${paths.join('、')}`);
    } finally { target.release(); }
  });
  uploadsByDocument.set(target.session, operation);
  void operation.finally(() => { if (uploadsByDocument.get(target.session) === operation) uploadsByDocument.delete(target.session); });
  return operation;
}
