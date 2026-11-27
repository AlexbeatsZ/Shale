import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ notes: new Map<string, string>() }));
vi.mock('./vaultFile.js', () => ({
  readFileText: async (path: string) => {
    const source = fixture.notes.get(path);
    if (source === undefined) throw new Error('Missing fixture');
    return source;
  },
  getVaultRoot: () => '/fixture',
}));
vi.mock('./settings.js', () => ({ getSettings: async () => ({
  search: { prefix: true, fuzzy: 0.2, chinese: { enabled: true, fuzzyRules: [] } },
}) }));
import { QmdEngine } from './search.js';
import { VaultCatalog } from './catalog.js';
import { parseNote } from './markdown.js';

let engine: QmdEngine;
beforeEach(() => {
  fixture.notes.clear();
  engine = new QmdEngine(new VaultCatalog());
  for (const [path, source] of Object.entries({
    'Callout.md': '---\ntags: [study]\n---\n> [!question] Question',
    'Folded.md': '---\ntags: [study/old]\n---\n> [!QUESTION]- Folded',
    'Plain.md': '# question\n\nquestion [question] !question [! question] [!questio] [!questionnaire]',
    'Custom.md': '> [!my-question] Custom',
    'Title.md': '---\ntitle: "[!question]"\n---\nNo callout in body',
    'Split.md': 'question\n[!ques\ntion]',
  })) {
    fixture.notes.set(path, source);
    engine.upsertNote(path, parseNote(path, source));
  }
  engine.finish();
});

describe('literal callout searches', () => {
  it.each(['literal', 'pinyin'] as const)('retains marker punctuation in %s mode despite fuzzy/prefix settings', async mode => {
    const hits = await engine.search('[!question]', 0, mode);
    expect(hits.map(hit => hit.path).sort()).toEqual(['Callout.md', 'Folded.md', 'Title.md']);
    expect(hits.every(hit => hit.matchKind === 'literal')).toBe(true);
  });
  it('combines tags, quotes, field scopes and limits after source verification', async () => {
    expect((await engine.search('"[!question]" #study -#study/old')).map(hit => hit.path)).toEqual(['Callout.md']);
    expect((await engine.search('body:[!question]')).map(hit => hit.path).sort()).toEqual(['Callout.md', 'Folded.md']);
    expect((await engine.search('title:[!question]')).map(hit => hit.path)).toEqual(['Title.md']);
    expect((await engine.search('[!question]', 1)).map(hit => hit.path)).toHaveLength(1);
    expect(await engine.search('[!missing]')).toEqual([]);
    expect((await engine.search('[!my-question]')).map(hit => hit.path)).toEqual(['Custom.md']);
  });
  it('keeps exact marker source offsets for result highlights', async () => {
    fixture.notes.set('Folded.md', fixture.notes.get('Folded.md') + '\n[!ques tion] [!问题]');
    const result = await engine.matchesFor('Folded.md', engine.queryTerms('"[!question]" #study'));
    expect(result.count).toBe(1);
    expect(result.sourceRanges?.map(range => range.text)).toEqual(['[!QUESTION]']);
    const phonetic = await engine.matchesFor('Folded.md', ['[!question]'], {
      pinyin: { enabled: true }, pinyinQuery: '[!question]',
    });
    expect(phonetic.sourceRanges).toEqual(result.sourceRanges);
  });
});
