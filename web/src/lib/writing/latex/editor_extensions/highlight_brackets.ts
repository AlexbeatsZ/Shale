import { EditorView, Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, type Range } from '@codemirror/state';
import { decorationInputsChanged } from '../../../decorationDependencies';
import { tempKeyPress } from '../snippets/snippet_management';
import { EquationText } from '../utils/tokenizer';
import { findFormulaBrackets, type FormulaBracket } from '../utils/bracketPairs';
import { getMathBoundsPlugin } from '../editor_context/mathbounds';
import { cmDarkClass, cmLightClass } from './shale_utils';

const cursorClass = 'latex-suite-highlighted-bracket';
const colorClass = 'latex-suite-color-bracket';
const errorClass = 'latex-suite-mismatched-bracket';

const palette = [
  ['#8c6500', '#efc451'], // Gold
  ['#8044b4', '#c895ef'], // Purple
  ['#245bcc', '#79aaff'], // Blue
  ['#26743d', '#78cf88'], // Green
  ['#ad480c', '#f39a65'], // Orange
  ['#00717c', '#56d5db'], // Cyan
];

const colors = palette.map((_, index) => Decoration.mark({ class: `${colorClass}-${index}` }));
const errorMark = Decoration.mark({ class: errorClass });
const cursorMark = Decoration.mark({ class: cursorClass });

function bracketsFor(overlay: ReturnType<ReturnType<typeof getMathBoundsPlugin>['getEquationOverlays']>[number]) {
  const node = overlay.bound.tree;
  return findFormulaBrackets(node, new EquationText(overlay.text, overlay.overlay.from, overlay.overlay.to));
}

function colorBrackets(view: EditorView, cache: Map<string, Range<Decoration>[]>) {
  const nextCache = new Map<string, Range<Decoration>[]>();
  const marks: Range<Decoration>[] = [];
  for (const overlay of getMathBoundsPlugin(view).getEquationOverlays(view.state)) {
    const { from } = overlay.overlay;
    let local = nextCache.get(overlay.text) ?? cache.get(overlay.text);
    if (!local) {
      local = [];
      for (const bracket of bracketsFor(overlay)) {
        if (bracket.kind === 'error') {
          local.push(errorMark.range(bracket.range.from - from, bracket.range.to - from));
        } else {
          const mark = colors[bracket.depth % colors.length]!;
          local.push(mark.range(bracket.open.from - from, bracket.open.to - from));
          local.push(mark.range(bracket.close.from - from, bracket.close.to - from));
        }
      }
    }
    nextCache.set(overlay.text, local);
    for (const mark of local) marks.push(mark.value.range(mark.from + from, mark.to + from));
  }
  return { decorations: Decoration.set(marks, true), cache: nextCache };
}

function highlightCursorBrackets(view: EditorView): DecorationSet {
  const marks: Range<Decoration>[] = [];
  const overlays = getMathBoundsPlugin(view).getEquationOverlays(view.state);
  for (const range of view.state.selection.ranges) {
    const overlay = overlays.find(({ overlay }) => overlay.from <= range.from && range.to <= overlay.to);
    if (!overlay) continue;
    let selected: Extract<FormulaBracket, { kind: 'pair' }> | undefined;
    for (const bracket of bracketsFor(overlay)) {
      if (bracket.kind !== 'pair') continue;
      if (bracket.open.from > range.to) break;
      if (!range.empty &&
          ((bracket.close.to >= range.from && bracket.close.to <= range.to) ||
           (bracket.open.from >= range.from && bracket.open.from <= range.to))) {
        selected = bracket;
        break;
      }
      if (bracket.close.to >= range.to) selected = bracket;
    }
    if (!selected) continue;
    marks.push(cursorMark.range(selected.open.from, selected.open.to));
    marks.push(cursorMark.range(selected.close.from, selected.close.to));
  }
  return Decoration.set(marks, true);
}

function refresh(update: ViewUpdate) {
  return !update.transactions.some(tr => tr.annotation(tempKeyPress)) &&
    (update.viewportChanged || update.transactions.some(tr => decorationInputsChanged(tr)));
}

const colorPairedBracketsPlugin = ViewPlugin.fromClass(class {
  cache = new Map<string, Range<Decoration>[]>();
  decorations: DecorationSet;

  constructor(view: EditorView) {
    ({ decorations: this.decorations, cache: this.cache } = colorBrackets(view, this.cache));
  }

  update(update: ViewUpdate) {
    if (refresh(update)) {
      ({ decorations: this.decorations, cache: this.cache } = colorBrackets(update.view, this.cache));
    }
  }
}, { decorations: value => value.decorations });

function themedBracket(theme: string, name: string) {
  return `${theme}.${name}, ${theme}.${name} :is(.cm-bracket, [class^="cm-tex-"])`;
}

const colorPairedBracketsTheme = EditorView.baseTheme({
  ...Object.fromEntries(palette.flatMap(([light, dark], index) => [
    [themedBracket(cmLightClass, `${colorClass}-${index}`), { color: light }],
    [themedBracket(cmDarkClass, `${colorClass}-${index}`), { color: dark }],
  ])),
  [themedBracket(cmLightClass, errorClass)]: { color: '#bc252d', textDecoration: 'underline wavy' },
  [themedBracket(cmDarkClass, errorClass)]: { color: '#ff7883', textDecoration: 'underline wavy' },
});

export const colorPairedBracketsPluginLowestPrec = Prec.lowest([colorPairedBracketsPlugin, colorPairedBracketsTheme]);

const highlightCursorBracketsPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = highlightCursorBrackets(view);
  }

  update(update: ViewUpdate) {
    if (refresh(update)) this.decorations = highlightCursorBrackets(update.view);
  }
}, { decorations: value => value.decorations });

const highlightBracketsTheme = EditorView.baseTheme({
  [`${cmLightClass}.${cursorClass}`]: { backgroundColor: 'hsl(var(--accent-h) var(--accent-s) 40% / 30%)' },
  [`${cmDarkClass}.${cursorClass}`]: { backgroundColor: 'hsl(var(--accent-h) var(--accent-s) 70% / 60%)' },
});

export const highlightCursorBracketsExtension = [highlightCursorBracketsPlugin, highlightBracketsTheme];
