import { Compartment, type Extension } from '@codemirror/state';
import { EditorView, GutterMarker, ViewPlugin, gutter, highlightActiveLineGutter, lineNumbers } from '@codemirror/view';
import { ensureLineNumbers, lineNumberStyle, subscribeLineNumbers } from './lineNumberSettings';

class RelativeNumber extends GutterMarker {
  constructor(readonly number: string) { super(); }
  eq(other: RelativeNumber) { return other.number === this.number; }
  toDOM() { return document.createTextNode(this.number); }
}
const spacer = (view: EditorView) => new RelativeNumber('9'.repeat(String(view.state.doc.lines).length));
const relativeNumbers = gutter({
  class: 'cm-lineNumbers cm-relativeLineNumbers',
  lineMarker: (view, line) => new RelativeNumber(String(Math.abs(
    view.state.doc.lineAt(line.from).number - view.state.doc.lineAt(view.state.selection.main.head).number,
  ))),
  lineMarkerChange: update => update.startState.doc.lineAt(update.startState.selection.main.head).number !==
    update.state.doc.lineAt(update.state.selection.main.head).number,
  initialSpacer: spacer,
  updateSpacer: (previous, update) => update.docChanged ? spacer(update.view) : previous,
});

/** Reconfigure only the gutter, retaining document, Vim mode, selection and history. */
export function editorLineNumbers(): Extension {
  const numbers = new Compartment();
  return [numbers.of([]), EditorView.baseTheme({
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 6px', minWidth: '2ch', fontVariantNumeric: 'tabular-nums' },
    '.cm-lineNumbers .cm-activeLineGutter': { color: 'var(--text-normal)', fontWeight: '600' },
  }), ViewPlugin.fromClass(class {
    private alive = true;
    private key = '';
    private stop: () => void;
    constructor(readonly view: EditorView) {
      this.stop = subscribeLineNumbers(() => this.configure());
      this.configure();
      void ensureLineNumbers();
    }
    update() { this.configure(); }
    private configure() {
      const style = this.view.state.readOnly ? 'off' : lineNumberStyle();
      if (this.key === style) return;
      this.key = style;
      queueMicrotask(() => {
        if (this.alive && this.key === style) this.view.dispatch({ effects: numbers.reconfigure(
          style === 'off' ? [] : [style === 'absolute' ? lineNumbers() : relativeNumbers, highlightActiveLineGutter()],
        ) });
      });
    }
    destroy() { this.alive = false; this.stop(); }
  })];
}
