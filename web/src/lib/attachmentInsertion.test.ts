import { expect, it, vi } from 'vitest';
import { EditorState, StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { changesBetween } from '@shale/markdown-core';
import { DocumentSession } from '../../../packages/markdown-core/src/session';
import { captureAttachmentInsertion, insertUploadedImages } from './attachmentInsertion';
import { renderContext } from './renderContext';
import { syntaxModel } from './syntaxModel';

function fixture(text = 'before\nafter', from = 6, to = from, fragment = false) {
  const session = new DocumentSession('note.md', text, undefined, async () => ({}));
  const normalized = session.snapshot.text;
  const offset = fragment ? normalized.indexOf('before') : 0;
  const context = { sourcePath: 'note.md', sourceFragment: fragment,
    mathSource: fragment ? { model: session.analysis, from: offset } : undefined };
  let state = EditorState.create({ doc: normalized.slice(offset), selection: { anchor: from, head: to },
    extensions: [renderContext.of(context as never), syntaxModel] });
  const dom = { isConnected: true };
  let current = true;
  const view = { get state() { return state; }, dom, composing: false,
    dispatch(spec: Parameters<EditorState['update']>[0]) {
      const transaction = state.update(spec);
      state = transaction.state;
      const edits: Parameters<DocumentSession['edit']>[1][number][] = [];
      transaction.changes.iterChanges((start, end, _from, _to, insert) => edits.push({ from: start + offset, to: end + offset, insert: insert.toString() }));
      session.edit(session.snapshot.version, edits, 'edit');
    },
  } as unknown as EditorView;
  session.subscribe(() => {
    const next = session.snapshot.text.slice(offset);
    if (next !== state.doc.toString()) state = state.update({ changes: changesBetween(state.doc.toString(), next) }).state;
  });
  return { view, session, dom,
    capture: (position?: number) => captureAttachmentInsertion(view, session, () => current, position)!,
    stale: () => { current = false; },
    readonly: () => { state = state.update({ effects: StateEffect.appendConfig.of(EditorState.readOnly.of(true)) }).state; },
  };
}

const image = (name: string) => ({ name, type: 'image/png' }) as File;
const pending = () => {
  let resolve!: (result: { path: string }) => void;
  const promise = new Promise<{ path: string }>(done => { resolve = done; });
  return { promise, resolve };
};

it('inserts at the captured caret and maps typing before it without following a later selection', async () => {
  const target = fixture(), upload = pending(), notify = vi.fn();
  const operation = insertUploadedImages(target.capture(), [image('photo.png')], () => upload.promise, notify);
  target.view.dispatch({ changes: { from: 0, insert: 'new ' }, selection: { anchor: 16 } });
  upload.resolve({ path: 'assets/photo.png' });
  await operation;
  expect(target.session.snapshot.text).toBe('new before\n![[assets/photo.png]]\nafter');
  expect(target.session.undo()).toBe(true);
  expect(target.session.snapshot.text).toBe('new before\nafter');
  expect(target.session.redo()).toBe(true);
  expect(target.session.snapshot.text).toContain('![[assets/photo.png]]');
});

it('replaces the captured selection with one ordered multi-image paste', async () => {
  const target = fixture('before remove after', 7, 13);
  await insertUploadedImages(target.capture(), [image('one'), image('two')], async file => ({ path: file.name }), vi.fn());
  expect(target.session.snapshot.text).toBe('before \n![[one]]\n![[two]]\n after');
  target.session.undo();
  expect(target.session.snapshot.text).toBe('before remove after');
});

it('preserves new typing that replaces an old selection during upload', async () => {
  const target = fixture('before remove after', 7, 13), upload = pending();
  const operation = insertUploadedImages(target.capture(), [image('one')], () => upload.promise, vi.fn());
  target.view.dispatch({ changes: { from: 7, to: 13, insert: 'typed' } });
  upload.resolve({ path: 'one' });
  await operation;
  expect(target.session.snapshot.text).toBe('before typed\n![[one]]\n after');
});

it('commits concurrent paste batches in capture order even when the second upload finishes first', async () => {
  const target = fixture(), first = pending(), second = pending();
  const firstPaste = insertUploadedImages(target.capture(), [image('first')], () => first.promise, vi.fn());
  const secondPaste = insertUploadedImages(target.capture(), [image('second')], () => second.promise, vi.fn());
  second.resolve({ path: 'second' });
  await Promise.resolve();
  expect(target.session.snapshot.text).toBe('before\nafter');
  first.resolve({ path: 'first' });
  await Promise.all([firstPaste, secondPaste]);
  expect(target.session.snapshot.text).toBe('before\n![[first]]\n![[second]]\nafter');
});

it('keeps successful files in one undo step when another upload fails', async () => {
  const target = fixture(), notify = vi.fn();
  await insertUploadedImages(target.capture(), [image('one'), image('bad'), image('two')], async file => {
    if (file.name === 'bad') throw new Error('upload failed');
    return { path: file.name };
  }, notify);
  expect(notify).toHaveBeenCalledWith('upload failed');
  expect(target.session.snapshot.text).toBe('before\n![[one]]\n![[two]]\nafter');
  target.session.undo();
  expect(target.session.snapshot.text).toBe('before\nafter');
});

it('maps editable fragment positions to the source and uses the drop position independently of the selection', async () => {
  const target = fixture('# Heading\n\nbefore\nafter', 12, 12, true);
  await insertUploadedImages(target.capture(6), [image('drop')], async () => ({ path: 'drop' }), vi.fn());
  expect(target.session.snapshot.text).toBe('# Heading\n\nbefore\n![[drop]]\nafter');
});

it('refuses read-only, locked and stale targets while reporting already uploaded paths', async () => {
  const readonly = fixture(); readonly.readonly();
  expect(readonly.capture()).toBeUndefined();
  for (const disable of ['stale', 'readonly', 'locked'] as const) {
    const target = fixture(), upload = pending(), notify = vi.fn();
    const operation = insertUploadedImages(target.capture(), [image('one')], () => upload.promise, notify);
    if (disable === 'locked') target.session.holdEdits(); else target[disable]();
    upload.resolve({ path: 'saved.png' });
    await operation;
    expect(target.session.snapshot.text).toBe('before\nafter');
    expect(notify.mock.calls.at(-1)?.[0]).toContain('附件已保存到 saved.png');
  }
});

it('retains the original full document when its view closes and never writes through a closed fragment', async () => {
  for (const fragment of [false, true]) {
    const target = fixture('before\nafter', 6, 6, fragment), upload = pending(), notify = vi.fn();
    const operation = insertUploadedImages(target.capture(), [image('one')], () => upload.promise, notify);
    target.dom.isConnected = false;
    upload.resolve({ path: 'saved.png' });
    await operation;
    expect(target.session.snapshot.text.includes('![[saved.png]]')).toBe(!fragment);
  }
});

it('preserves original raw line endings and the unaffected suffix', async () => {
  const target = fixture('\ufeffbefore\r\nafter\r\n', 6);
  await insertUploadedImages(target.capture(), [image('one')], async () => ({ path: 'one' }), vi.fn());
  expect(target.session.snapshot.raw).toBe('\ufeffbefore\r\n![[one]]\r\nafter\r\n');
});
