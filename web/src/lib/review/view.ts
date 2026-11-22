import { StateEffect, StateField, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from '@codemirror/view';
import { SourceDocument, rebaseReview, type ReviewHunk } from '@webobsidian/markdown-core';
import { contextOf, nonExecutingContext } from '../renderContext';
import { reviewSnapshot, subscribeReview, decideReview } from './client';
import { createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ReviewToolbar } from '../../components/ReviewHost';
import { RenderLifetime } from '../obsidian/renderLifetime';

const refreshReview = StateEffect.define<void>();
export type Placed = { id: string; from: number; to: number; insert: string; original: string; conflict?: boolean };
/** A candidate against the current note: baseline text plus line hunks, as stored by MCP proposals. */
export type ReviewCandidate = { id: string; baseline: string; hunks: ReviewHunk[]; inactive?: boolean };
/**
 * One review presentation for every candidate source (MCP proposals, sync conflicts):
 * existing lines are red, candidate lines are green blocks with Accept/Reject, plus a toolbar.
 */
export type ReviewSource = {
  subscribe(listener: () => void): () => void;
  candidate(path: string): ReviewCandidate | null;
  busy(): boolean;
  decide(view: EditorView, decision: 'accepted' | 'rejected', hunk: Placed, path: string): void;
  toolbar(path: string): ReactElement;
};
type ReviewView = { proposal: ReviewCandidate | null; hunks: Placed[]; decorations: DecorationSet };
const reviewMounts = new WeakMap<HTMLElement, RenderLifetime>();

/** The bar belongs to CM's existing centered document column, like the hunks. */
class ReviewToolbarWidget extends WidgetType {
  constructor(readonly path: string, readonly source: ReviewSource) { super(); }
  eq(other: ReviewToolbarWidget) { return this.path === other.path && this.source === other.source; }
  toDOM() {
    const host = document.createElement('div');
    const lifetime = new RenderLifetime();
    void lifetime.load(); reviewMounts.set(host, lifetime);
    const root = createRoot(host); root.render(this.source.toolbar(this.path));
    lifetime.register(() => queueMicrotask(() => root.unmount()));
    return host;
  }
  destroy(dom: HTMLElement) { const lifetime = reviewMounts.get(dom); reviewMounts.delete(dom); lifetime?.unload(); }
  ignoreEvent() { return true; }
}

class CandidateWidget extends WidgetType {
  constructor(readonly proposal: string, readonly hunk: Placed, readonly busy: boolean, readonly source: ReviewSource, readonly path: string) { super(); }
  eq(other: CandidateWidget) { return this.proposal === other.proposal && this.hunk.id === other.hunk.id && this.hunk.insert === other.hunk.insert && this.busy === other.busy; }
  toDOM(view: EditorView) {
    const root = document.createElement('div'); root.className = 'native-review-candidate';
    const lifetime = new RenderLifetime();
    void lifetime.load(); reviewMounts.set(root, lifetime);
    let cleanup: (() => void) | undefined;
    lifetime.register(() => { cleanup?.(); cleanup = undefined; });
    root.dataset.reviewHunk = this.hunk.id;
    const actions = root.appendChild(document.createElement('div')); actions.className = 'native-review-actions';
    const button = (text: string, run: () => void) => { const b = actions.appendChild(document.createElement('button'));
      b.textContent = text; b.type = 'button'; b.className = text === '接受' ? 'btn' : 'btn secondary'; b.disabled = this.busy; b.onclick = run; return b; };
    button('接受', () => this.source.decide(view, 'accepted', this.hunk, this.path));
    button('拒绝', () => this.source.decide(view, 'rejected', this.hunk, this.path));
    const body = root.appendChild(document.createElement('div'));
    const context = nonExecutingContext(contextOf(view));
    context.allowBlockEffects = false;
    let source = false;
    const draw = () => {
      if (lifetime.signal.aborted) return;
      cleanup?.(); cleanup = undefined; body.replaceChildren();
      if (!this.hunk.insert) { body.textContent = '删除这些行'; return; }
      if (source || !context.mountFragment) { const pre = body.appendChild(document.createElement('pre')); pre.textContent = this.hunk.insert; return; }
      const preview = body.appendChild(document.createElement('div'));
      cleanup = context.mountFragment(preview, this.hunk.insert, { id: `review:${this.proposal}:${this.hunk.id}`, mode: 'reading',
        context, autoFocus: false });
    };
    const toggle = button('查看源码', () => { source = !source; toggle.textContent = source ? '查看预览' : '查看源码'; draw(); });
    draw(); return root;
  }
  destroy(dom: HTMLElement) { const lifetime = reviewMounts.get(dom); reviewMounts.delete(dom); lifetime?.unload(); }
  ignoreEvent() { return true; }
}

/** Only actual document/range changes affect decorations; selection-only updates are free. */
export function reviewExtension(path: string, source: ReviewSource): Extension {
  const build = (state: import('@codemirror/state').EditorState, proposal: ReviewCandidate | null, hunks: Placed[]): ReviewView => {
    const ranges: Range<Decoration>[] = [];
    if (proposal) ranges.push(Decoration.widget({ widget: new ReviewToolbarWidget(path, source), block: true, side: -1 }).range(0));
    for (const h of hunks) {
      if (h.conflict) continue;
      if (h.to > h.from) {
        const last = state.doc.lineAt(Math.max(h.from, h.to - 1)).number;
        for (let n = state.doc.lineAt(h.from).number; n <= last; n++) ranges.push(Decoration.line({ class: 'native-review-removed' }).range(state.doc.line(n).from));
      }
      const at = h.to > h.from ? state.doc.lineAt(h.to - 1).to : h.from;
      ranges.push(Decoration.widget({ widget: new CandidateWidget(proposal!.id, h, source.busy(), source, path), block: true,
        side: h.to > h.from || at === state.doc.length ? 1 : -1 }).range(at));
    }
    return { proposal, hunks, decorations: Decoration.set(ranges, true) };
  };
  const load = (state: import('@codemirror/state').EditorState) => {
    const p = source.candidate(path);
    if (!p) return build(state, null, []);
    if (p.inactive) return build(state, p, []);
    const normalized = new SourceDocument(p.baseline);
    const hunks = p.hunks.map(h => ({ ...h,
      from: new SourceDocument(p.baseline.slice(0, h.from)).text.length,
      to: new SourceDocument(p.baseline.slice(0, h.to)).text.length,
      insert: h.insert.replace(/\r\n|\r/g, '\n'),
    }));
    const placed = rebaseReview(normalized.text, hunks, state.doc.toString());
    return build(state, p, placed?.filter(h => h.decision === 'pending').map(h => ({ ...h, original: state.sliceDoc(h.from, h.to) })) ?? []);
  };
  const field = StateField.define<ReviewView>({
    create: load,
    update(value, tr) {
      if (tr.effects.some(e => e.is(refreshReview))) return load(tr.state);
      if (!tr.docChanged || !value.hunks.length) return value;
      const touched = new Set<string>();
      tr.changes.iterChangedRanges((from, to) => {
        for (const h of value.hunks) {
          const a = tr.startState.doc.lineAt(h.from).from;
          const b = tr.startState.doc.lineAt(Math.max(h.from, h.to - 1)).to;
          if (from <= b && to >= a) touched.add(h.id);
        }
      });
      return build(tr.state, value.proposal, value.hunks.map(h => {
        const changed = touched.has(h.id) || h.conflict;
        const from = tr.changes.mapPos(h.from, changed ? -1 : 1), to = tr.changes.mapPos(h.to, changed ? 1 : -1);
        return { ...h, from, to, conflict: changed ? tr.state.sliceDoc(from, to) !== h.original : false };
      }));
    },
    provide: f => EditorView.decorations.from(f, v => v.decorations),
  });
  return [field, ViewPlugin.fromClass(class {
    stop: () => void;
    constructor(readonly view: EditorView) {
      this.stop = source.subscribe(() => queueMicrotask(() => { if (view.dom.isConnected) view.dispatch({ effects: refreshReview.of() }); }));
    }
    destroy() { this.stop(); }
  })];
}

/** MCP candidate proposals: decisions go through the operations review lifecycle on the server. */
export const mcpReviewSource: ReviewSource = {
  subscribe: subscribeReview,
  candidate(path) {
    const p = reviewSnapshot().selected;
    if (!p || p.fileOperation || p.path !== path) return null;
    return { id: p.id, baseline: p.baseline, hunks: p.hunks, inactive: Boolean(p.restored || p.uncertain) };
  },
  busy: () => reviewSnapshot().busy,
  decide: (_view, decision, hunk) => { void decideReview(decision, hunk.id); },
  toolbar: path => createElement(ReviewToolbar, { path }),
};

export function nativeReviewExtension(path: string): Extension { return reviewExtension(path, mcpReviewSource); }
