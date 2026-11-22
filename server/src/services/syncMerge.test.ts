import { describe, expect, it } from 'vitest';
import { mergeReview } from '@webobsidian/markdown-core';
import { decodeText, describeChange, splitLines } from './syncMerge.js';

describe('sync text helpers', () => {
  it('keeps exact line endings and merges disjoint edits with the shared review core', () => {
    expect(splitLines('a\r\nb\nc').join('')).toBe('a\r\nb\nc');
    expect(mergeReview('a\nb\nc\nd\n', 'a\ninserted\nb\nc\nd\n', 'a\nb\nc\nD\n')).toBe('a\ninserted\nb\nc\nD\n');
    expect(mergeReview('a\nb\nc\n', 'a\nX\nc\n', 'a\nY\nc\n')).toBeNull();
  });
  it('treats NUL bytes and invalid UTF-8 as binary', () => {
    expect(decodeText(Buffer.from([0x61, 0]))).toBeNull();
    expect(decodeText(Buffer.from([0xff, 0xfe, 0x41]))).toBeNull();
    expect(decodeText(Buffer.from('中文'))).toBe('中文');
  });
  it('describes removed and added lines with collapsed context', () => {
    const local = Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n') + '\n';
    const remote = local.replace('line 10\n', 'line ten\n');
    expect(describeChange(local, remote).blocks).toEqual([
      { type: 'skip', lines: [], skipped: 7 }, { type: 'same', lines: ['line 7', 'line 8', 'line 9'] },
      { type: 'del', lines: ['line 10'] }, { type: 'add', lines: ['line ten'] },
      { type: 'same', lines: ['line 11', 'line 12', 'line 13'] }, { type: 'skip', lines: [], skipped: 6 },
    ]);
  });
});
