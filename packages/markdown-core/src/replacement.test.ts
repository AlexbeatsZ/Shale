import { describe, it, expect } from 'vitest';
import { compileReplacement, expandReplacement, replacementCallback } from './replacement.js';

const replace = (input: string, pattern: RegExp, template: string) =>
  input.replace(pattern, replacementCallback(compileReplacement(template)));
describe('one LaTeX replacement language', () => {
  it('keeps captured and selected text literal, including placeholder-looking data', () => {
    const result = expandReplacement(
      compileReplacement('[[0]] ${VISUAL} ${1:[[1]]} $0'),
      {
        captures: ['$1\\alpha', 'value'],
        visual: '${2:x}[[0]]',
      },
      true,
    );
    expect(result.text).toBe('$1\\alpha ${2:x}[[0]] value ');
    expect(result.tabstops).toEqual([
      { index: 1, from: 21, to: 26 },
      { index: 0, from: 27, to: 27 },
    ]);
  });
  it('supports named captures, full match, literal dollars and literal backslashes', () => {
    expect(replace('abc', /(?<word>b)/, '${DOLLAR}1:[[<word>]]:${MATCH}:\\n')).toBe('a$1:b:b:\\nc');
    expect(replace('x', /x/, '${1:default}$0')).toBe('default');
    expect(replace('x', /x/, '${LBRACKET}[0]]')).toBe('[[0]]');
    expect(replace('x', /x/, '[[9]]')).toBe('[[9]]');
  });
});
