import { createElement, useSyncExternalStore } from 'react';
import { SourceDocument, rebaseReview, reviewHunks, type ReviewHunk } from '@shale/markdown-core';
import { documents } from '../documents';
import { useStore } from '../store';
import { resolveSyncConflict, subscribeSyncConflicts, syncConflictSnapshot } from '../syncConflicts';
import type { ReviewCandidate, ReviewSource } from './view';

/**
 * A text sync conflict reviewed like an MCP proposal: this device's text is the baseline and the
 * server's version is the candidate. Accepted hunks are edited into the note through the editor;
 * once no hunk is pending the note is saved and the conflict is resolved with the reviewed text.
 */
type Entry = { key: string; candidate: ReviewCandidate };
const entries = new Map<string, Entry>();
let busy = false; let error = '';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener); const stop = subscribeSyncConflicts(listener);
  return () => { listeners.delete(listener); stop(); };
};

function candidate(path: string): ReviewCandidate | null {
  const file = syncConflictSnapshot().get(path);
  if (!file || file.relatedPaths?.length || file.action !== 'modify' || file.localText === null || file.remoteText === null) { entries.delete(path); return null; }
  const key = `${file.conflictId}:${file.localText.length}:${file.remoteText.length}`;
  let entry = entries.get(path);
  if (entry?.key !== key) {
    entry = { key, candidate: { id: `sync:${path}`, baseline: file.localText, hunks: reviewHunks(file.localText, file.remoteText) } };
    entries.set(path, entry);
  }
  return entry.candidate;
}

const pending = (entry: ReviewCandidate) => entry.hunks.filter(hunk => hunk.decision === 'pending');

function setDecision(path: string, ids: string[], decision: ReviewHunk['decision']) {
  const entry = entries.get(path); if (!entry) return;
  entry.candidate = { ...entry.candidate, hunks: entry.candidate.hunks.map(hunk => ids.includes(hunk.id) ? { ...hunk, decision } : hunk) };
}

async function finish(path: string) {
  const entry = entries.get(path);
  if (!entry || pending(entry.candidate).length) return;
  busy = true; error = ''; notify();
  try {
    await documents.saveLeaving(path);
    const text = documents.get(path)?.snapshot.text ?? '';
    const unchanged = text === new SourceDocument(entry.candidate.baseline).text;
    await resolveSyncConflict(path, unchanged ? 'local' : 'merged');
    entries.delete(path);
  } catch (failure) { error = (failure as Error).message; useStore.getState().notify(error, 6000); }
  finally { busy = false; notify(); }
}

/** Applies every still-pending hunk (decision 'accepted') or drops them ('rejected'), then resolves. */
export async function decideRemainingSync(path: string, decision: 'accepted' | 'rejected') {
  const entry = entries.get(path); if (!entry || busy) return;
  const ids = pending(entry.candidate).map(hunk => hunk.id);
  if (decision === 'accepted') {
    const session = documents.get(path);
    if (!session) return;
    const baseline = new SourceDocument(entry.candidate.baseline).text;
    const hunks = entry.candidate.hunks.map(hunk => ({ ...hunk,
      from: new SourceDocument(entry.candidate.baseline.slice(0, hunk.from)).text.length,
      to: new SourceDocument(entry.candidate.baseline.slice(0, hunk.to)).text.length, insert: hunk.insert.replace(/\r\n|\r/g, '\n') }));
    const placed = rebaseReview(baseline, hunks, session.snapshot.text);
    if (!placed) { useStore.getState().notify('笔记在冲突后改动了相同的行，请逐块处理', 6000); return; }
    let text = session.snapshot.text;
    for (const hunk of [...placed].reverse()) if (hunk.decision === 'pending') text = text.slice(0, hunk.from) + hunk.insert + text.slice(hunk.to);
    session.setRawText(session.snapshot.raw.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text, 'sync.accept');
  }
  setDecision(path, ids, decision); notify();
  await finish(path);
}

function SyncReviewToolbar({ path }: { path: string }) {
  useSyncExternalStore(subscribe, () => entries.get(path)?.candidate);
  const entry = entries.get(path); if (!entry) return null;
  const left = pending(entry.candidate).length;
  return createElement('div', { className: 'native-review-bar', role: 'region', 'aria-label': '同步冲突审阅' },
    createElement('span', { className: 'sync-conflict-badge is-modify' }, '同步冲突'),
    createElement('span', null, `本机 ↔ 服务器 · 剩余 ${left} 块`),
    left > 0 && createElement('button', { className: 'btn', disabled: busy, onClick: () => { void decideRemainingSync(path, 'accepted'); } }, '接受剩余'),
    left > 0 && createElement('button', { className: 'btn secondary', disabled: busy, onClick: () => { void decideRemainingSync(path, 'rejected'); } }, '拒绝剩余'),
    error && createElement('span', { role: 'alert' }, error));
}

export const syncReviewSource: ReviewSource = {
  subscribe,
  candidate,
  busy: () => busy,
  decide(view, decision, hunk, path) {
    if (!entries.has(path) || busy) return;
    if (decision === 'accepted') view.dispatch({ changes: { from: hunk.from, to: hunk.to, insert: hunk.insert }, userEvent: 'input.sync' });
    setDecision(path, [hunk.id], decision); notify();
    void finish(path);
  },
  toolbar: path => createElement(SyncReviewToolbar, { path }),
};
