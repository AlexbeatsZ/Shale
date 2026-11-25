import { mathRegions } from './math.js';
import { analyzeMarkdown, type MarkdownModel, type SourceSpan } from './syntax.js';

/** Balanced TeX commands inside known formulas; never a document-wide regex. */
function tagRanges(tex: string): SourceSpan[] {
  const ranges: SourceSpan[] = [];
  for (let at = 0; at < tex.length; at++) {
    if (tex[at] === '%') {
      const newline = tex.indexOf('\n', at);
      if (newline < 0) break;
      at = newline;
      continue;
    }
    if (tex[at] !== '\\') continue;
    const start = at;
    const command = /^[A-Za-z]+/.exec(tex.slice(at + 1))?.[0];
    if (!command) { at++; continue; } // Escaped backslashes, braces and percent signs.
    at += command.length;
    if (command === 'verb') {
      let delimiter = at + 1;
      if (tex[delimiter] === '*') delimiter++;
      const end = tex.indexOf(tex[delimiter], delimiter + 1);
      if (end < 0) break;
      at = end;
      continue;
    }
    if (command !== 'tag') continue;
    let open = at + 1;
    if (tex[open] === '*') open++;
    while (/\s/.test(tex[open] ?? '') && open < tex.length) open++;
    if (tex[open] !== '{') continue;
    let depth = 1, end = open + 1;
    for (; end < tex.length; end++) {
      if (tex[end] === '\\') { end++; continue; }
      if (tex[end] === '%') {
        const newline = tex.indexOf('\n', end);
        if (newline < 0) break;
        end = newline;
      } else if (tex[end] === '{') depth++;
      else if (tex[end] === '}' && --depth === 0) break;
    }
    if (depth) continue;
    let from = start;
    while (from > 0 && /[\t ]/.test(tex[from - 1])) from--;
    ranges.push({ from, to: end + 1 });
    at = end;
  }
  return ranges;
}

/** Preserve source delimiters, line breaks and quote prefixes, including nested arguments. */
export function removeMathTags(text: string, model: MarkdownModel = analyzeMarkdown(text)): string {
  if (!text.includes('\\tag')) return text;
  const removals: SourceSpan[] = [];
  for (const region of mathRegions(model)) {
    if (!region.closed || region.kind !== 'dollar') continue;
    const ranges = tagRanges(region.tex);
    let offset = 0;
    for (const segment of region.segments) {
      const length = segment.to - segment.from;
      for (const range of ranges) {
        const from = Math.max(offset, range.from), to = Math.min(offset + length, range.to);
        if (from < to) removals.push({ from: segment.from + from - offset, to: segment.from + to - offset });
      }
      offset += length + 1;
    }
  }
  let result = text;
  for (const range of removals.sort((a, b) => b.from - a.from))
    result = result.slice(0, range.from) + result.slice(range.to);
  return result;
}
