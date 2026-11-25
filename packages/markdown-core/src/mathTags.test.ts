import { describe, expect, it } from 'vitest';
import { removeMathTags } from './mathTags.js';

describe('formula tag cleanup', () => {
  it('cleans both delimiter families, starred tags, nested arguments and multiple tags', () => {
    const source = String.raw`$x \tag{a}$ / $$y \tag*{\text{A {B}}}$$ / \(z \tag{c}\) / \[w \tag {d}\]`;
    const expected = String.raw`$x$ / $$y$$ / \(z\) / \[w\]`;
    expect(removeMathTags(source)).toBe(expected);
    expect(removeMathTags(expected)).toBe(expected);
    expect(removeMathTags(String.raw`$$x \tag{a} + y \tag{b}$$`)).toBe('$$x + y$$');
  });
  it('preserves literal contexts, comments, incomplete tags, labels and numbering suppression', () => {
    const literal = '---\nexample: "\\tag{yaml}"\n---\n' +
      String.raw`prose \tag{plain} and \tagged{other}; ` + '`$x \\tag{code}$`\n' +
      '```math\nx \\tag{fence}\n```\n' +
      String.raw`$$x \\tag{escaped} \verb|\tag{verbatim}| \label{eq:x} \notag % \tag{comment}` + '\n' +
      String.raw`y \tag{unclosed$$`;
    expect(removeMathTags(literal)).toBe(literal);
    expect(removeMathTags(String.raw`$$x \tag{a\}b} \nonumber$$`)).toBe(String.raw`$$x \nonumber$$`);
  });
  it('retains quote prefixes and newlines for a multiline balanced argument', () => {
    expect(removeMathTags('> $$\n> x \\tag{A\n> {B}}\n> $$ ^eq-x')).toBe('> $$\n> x\n> \n> $$ ^eq-x');
  });
});
