import type { SyntaxNode } from '@lezer/common';
import type { EquationText } from './tokenizer';

type Bounds = { from: number; to: number };
type Scope = 'ordinary' | 'group' | 'scalable';
type Delimiter = Bounds & {
  side: 'open' | 'close';
  scope: Scope;
  symbol: string;
  partner?: Delimiter;
};

export type FormulaBracket =
  | { kind: 'pair'; open: Bounds; close: Bounds; depth: number }
  | { kind: 'error'; range: Bounds };

const pairs = new Map([
  ['(', ')'], ['[', ']'], ['{', '}'], ['\\{', '\\}'], ['\\langle', '\\rangle'],
  ['\\lvert', '\\rvert'], ['\\lVert', '\\rVert'], ['\\lceil', '\\rceil'],
  ['\\lfloor', '\\rfloor'], ['\\lgroup', '\\rgroup'], ['\\llcorner', '\\lrcorner'],
  ['\\lmoustache', '\\rmoustache'],
]);
const closingSymbols = new Set(pairs.values());
const aliases = new Map([
  ['\\lbrace', '\\{'], ['\\rbrace', '\\}'], ['\\lbrack', '['], ['\\rbrack', ']'],
  ['\\lparen', '('], ['\\rparen', ')'],
]);
const scalableAliases = new Map([
  ['<', '\\langle'], ['>', '\\rangle'], ['\\lt', '\\langle'], ['\\gt', '\\rangle'],
  ['|', '\\lvert'], ['\\vert', '\\lvert'],
  ['\\|', '\\lVert'], ['\\Vert', '\\lVert'],
]);
const symmetricSymbols = new Set([
  '/', '\\backslash', '\\uparrow', '\\Uparrow', '\\downarrow', '\\Downarrow',
  '\\updownarrow', '\\Updownarrow',
]);

function readScalableDelimiter(command: Bounds, doc: EquationText) {
  const rest = doc.slice(command.to, doc.to);
  const match = /^[ \t]*(\\(?:[a-zA-Z]+|[^\n])|[^\s\\])/.exec(rest);
  const token = match?.[1] ?? '';
  const symbol = scalableAliases.get(token) ?? aliases.get(token) ?? token;
  const valid = symbol === '.' || symmetricSymbols.has(symbol) ||
    (symbol !== '{' && pairs.has(symbol)) || (symbol !== '}' && closingSymbols.has(symbol));
  return valid && match ? { to: command.to + match[0].length, symbol } : { to: command.to, symbol: '' };
}

function collectDelimiters(mathNode: SyntaxNode | null, doc: EquationText): Delimiter[] {
  const delimiters: Delimiter[] = [];
  let scalableEnd = doc.from;
  const add = (from: number, to: number, token: string, scope: Scope) => {
    if (from < scalableEnd) return;
    const symbol = aliases.get(token) ?? token;
    if (pairs.has(symbol)) delimiters.push({ from, to, side: 'open', scope, symbol });
    else if (closingSymbols.has(symbol)) delimiters.push({ from, to, side: 'close', scope, symbol });
  };

  // Include error-recovery siblings of the first Math node, such as a stray \right.
  mathNode?.parent?.cursor().iterate(node => {
    if (node.to <= scalableEnd || node.from >= doc.to) return false;
    const { from, to, name } = node;
    if (name === 'LeftCtrlSeq' || name === 'RightCtrlSeq') {
      const delimiter = readScalableDelimiter(node, doc);
      scalableEnd = delimiter.to;
      delimiters.push({
        from, ...delimiter, side: name === 'LeftCtrlSeq' ? 'open' : 'close', scope: 'scalable',
      });
      return false;
    }
    if (name === 'CtrlSeq' && doc.slice(from, to) === '\\middle') {
      scalableEnd = readScalableDelimiter(node, doc).to;
      return false;
    }
    if (name === 'OpenBrace' || name === 'CloseBrace') {
      add(from, to, doc.slice(from, to), 'group');
    } else if (name === 'MathSpecialChar') {
      for (let pos = from; pos < to; pos++) add(pos, pos + 1, doc.slice(pos, pos + 1), 'ordinary');
    } else if (name === 'CtrlSeq' || name === 'CtrlSym' || name === 'SymbolCtrlSeq' ||
               name === 'OpenBracket' || name === 'CloseBracket') {
      const container = node.node.parent?.name;
      if (container !== 'LongArg' && container !== 'ShortArg')
        add(from, to, doc.slice(from, to), 'ordinary');
    }
  });
  return delimiters;
}

function matchDelimiters(open: Delimiter, close: Delimiter): boolean {
  if (open.scope !== 'scalable') return pairs.get(open.symbol) === close.symbol;
  const a = open.symbol, b = close.symbol;
  const left = a === '\\lvert' || a === '\\lVert', right = b === '\\lvert' || b === '\\lVert';
  if (a === '.') return b === '.' || right || closingSymbols.has(b) || symmetricSymbols.has(b);
  if (b === '.') return left || pairs.has(a) || symmetricSymbols.has(a);
  return pairs.get(a) === b || (a === b && (left || symmetricSymbols.has(a)));
}

export function findFormulaBrackets(mathNode: SyntaxNode | null, doc: EquationText): FormulaBracket[] {
  const delimiters = collectDelimiters(mathNode, doc);
  const stack: Delimiter[] = [];
  const groups: number[] = [];

  for (const token of delimiters) {
    if (token.side === 'open') {
      if (token.scope !== 'ordinary') groups.push(stack.length);
      stack.push(token);
      continue;
    }
    // TeX groups and scalable fences close independently of unpaired punctuation inside.
    const index = token.scope === 'ordinary' ? stack.length - 1 : groups.at(-1) ?? -1;
    const open = stack[index];
    if (open?.scope !== token.scope) continue;
    stack.length = index;
    if (token.scope !== 'ordinary') groups.pop();
    if (matchDelimiters(open, token)) {
      open.partner = token;
      token.partner = open;
    }
  }

  const brackets: FormulaBracket[] = [];
  let depth = 0;
  for (const token of delimiters) {
    if (!token.partner) brackets.push({ kind: 'error', range: token });
    else if (token.side === 'close') depth--;
    else brackets.push({ kind: 'pair', open: token, close: token.partner, depth: depth++ });
  }
  return brackets;
}
