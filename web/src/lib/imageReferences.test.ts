import { beforeEach, expect, it, vi } from 'vitest';
import { analyzeMarkdown, type MarkdownModel } from '../../../packages/markdown-core/src/index';

const fixture = vi.hoisted(() => ({
  sessions: new Map<string, { analysis: MarkdownModel; snapshot: { id: string; dirty: boolean } }>(),
  contents: new Map<string, string>(), backlinks: [] as string[],
  entries: [] as { path: string; kind: 'file'; title: string; aliases: string[]; tags: string[]; headings: string[] }[],
  listeners: new Set<() => void>(), searchListeners: new Set<() => void>(),
  read: vi.fn(), backlinksRead: vi.fn(),
}));
vi.mock('@webobsidian/markdown-core', () => import('../../../packages/markdown-core/src/index'));
vi.mock('./api', () => ({
  vaultRequestIdentity: async () => 'image-reference-test',
  api: { backlinks: (path: string) => { fixture.backlinksRead(path); return Promise.resolve({ backlinks: fixture.backlinks }); },
    read: async (path: string) => { fixture.read(path); return { content: fixture.contents.get(path) ?? '', vault: 'image-reference-test' }; } },
}));
vi.mock('./documents', () => ({ documents: {
  pathVersion: 0, get: (path: string) => fixture.sessions.get(path),
  snapshots: () => [...fixture.sessions.values()].map(session => session.snapshot),
  subscribe: (listener: () => void) => { fixture.listeners.add(listener); return () => { fixture.listeners.delete(listener); }; },
} }));
vi.mock('./search', () => ({ searchEntries: () => fixture.entries,
  subscribeSearch: (listener: () => void) => { fixture.searchListeners.add(listener); return () => { fixture.searchListeners.delete(listener); }; } }));
import { resolveImageReference, subscribeImageReferences } from './imageReferences';

const files = ['assets/a.png', 'assets/b.png', 'source.md', 'other.md'];
const signal = () => new AbortController().signal;
beforeEach(() => {
  fixture.sessions.clear(); fixture.contents.clear(); fixture.backlinks = [];
  fixture.entries = files.map(path => ({ path, kind: 'file', title: path, aliases: [], tags: [], headings: [] }));
  fixture.read.mockClear(); fixture.backlinksRead.mockClear(); fixture.listeners.clear(); fixture.searchListeners.clear();
});

it('resolves the nearest preceding local instance and the first one for a forward reference', async () => {
  const source = '[[a.png]] 前\n\n![[a.png|别名]]\n\n[[a.png]] 中\n\n![[assets/a.png|再次]]\n\n[[a.png]] 后';
  const model = analyzeMarkdown(source, 'source.md');
  expect(await resolveImageReference('a.png', 'source.md', model, 0, signal(), files)).toMatchObject({ label: '图1-1', sourcePath: 'source.md' });
  expect(await resolveImageReference('a.png', 'source.md', model, source.indexOf('[[a.png]] 中'), signal(), files)).toMatchObject({ label: '图1-1' });
  expect(await resolveImageReference('a.png', 'source.md', model, source.indexOf('[[a.png]] 后'), signal(), files)).toMatchObject({ label: '图1-2' });
  expect(await resolveImageReference('a.png|', 'source.md', model, source.length, signal(), files)).toMatchObject({ label: 'a.png' });
  expect(await resolveImageReference('a.png|指定', 'source.md', model, source.length, signal(), files)).toMatchObject({ label: '指定' });
  expect(fixture.backlinksRead).not.toHaveBeenCalled();
});

it('reuses a unique cross-note original and refreshes it after an unsaved source edit', async () => {
  const model = analyzeMarkdown('[[a.png]]', 'source.md');
  fixture.backlinks = ['other.md', 'source.md'];
  fixture.contents.set('other.md', '# Chapter\n\n![[assets/a.png]]');
  const result = await resolveImageReference('a.png', 'source.md', model, 0, signal(), files);
  expect(result).toMatchObject({ label: 'other 图1-1', sourcePath: 'other.md', status: 'resolved' });
  expect(await resolveImageReference('a.png', 'source.md', model, 0, signal(), files)).toMatchObject({ label: 'other 图1-1' });
  expect(fixture.backlinksRead).toHaveBeenCalledTimes(1);
  fixture.sessions.set('other.md', { analysis: analyzeMarkdown('# Chapter\n\n![[b.png]]\n\n![[a.png]]', 'other.md'), snapshot: { id: 'other.md', dirty: true } });
  expect(await resolveImageReference('a.png', 'source.md', model, 0, signal(), files)).toMatchObject({ label: 'other 图1-2' });
  expect(fixture.backlinksRead).toHaveBeenCalledTimes(2);
});

it('does not choose one of several source notes or ambiguous attachments', async () => {
  const model = analyzeMarkdown('[[a.png]]', 'source.md');
  fixture.backlinks = ['one.md', 'two.md'];
  fixture.contents.set('one.md', '![[a.png]]'); fixture.contents.set('two.md', '![[assets/a.png]]');
  expect(await resolveImageReference('a.png', 'source.md', model, 0, signal(), files)).toMatchObject({ status: 'ambiguous', label: undefined });
  expect(await resolveImageReference('a.png', 'source.md', analyzeMarkdown('![[a.png]]'), 100, signal(), [...files, 'other/a.png']))
    .toMatchObject({ status: 'ambiguous', label: undefined });
});

it('refreshes subscriptions only for figure or catalog changes and disposes them', () => {
  fixture.sessions.set('other.md', { analysis: analyzeMarkdown('plain', 'other.md'), snapshot: { id: 'other.md', dirty: true } });
  const listener = vi.fn(), stop = subscribeImageReferences(listener);
  fixture.sessions.get('other.md')!.analysis = analyzeMarkdown('other text', 'other.md');
  for (const notify of fixture.listeners) notify();
  expect(listener).not.toHaveBeenCalled();
  fixture.sessions.get('other.md')!.analysis = analyzeMarkdown('![[a.png]]', 'other.md');
  for (const notify of fixture.listeners) notify();
  expect(listener).toHaveBeenCalledTimes(1);
  for (const notify of fixture.searchListeners) notify();
  expect(listener).toHaveBeenCalledTimes(1);
  fixture.entries = [...fixture.entries];
  for (const notify of fixture.searchListeners) notify();
  expect(listener).toHaveBeenCalledTimes(2);
  stop(); expect(fixture.listeners.size).toBe(0); expect(fixture.searchListeners.size).toBe(0);
});

it('honors cancellation before returning cross-note results', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(resolveImageReference('a.png', 'source.md', analyzeMarkdown('[[a.png]]'), 0, controller.signal, files)).rejects.toMatchObject({ name: 'AbortError' });
});

it('resolves table-escaped aliases against full-source figure instances', async () => {
  const source = '| Image | References |\n| --- | --- |\n| ![[a.png\\|Alias#dark]] | [[a.png]] [[a.png\\|]] [[a.png\\|Named\\|alias]] |';
  const model = analyzeMarkdown(source, 'source.md'), at = source.indexOf('[[a.png]]');
  expect(await resolveImageReference('a.png', 'source.md', model, at, signal(), files)).toMatchObject({ label: '图1-1' });
  expect(await resolveImageReference('a.png\\|', 'source.md', model, at, signal(), files)).toMatchObject({ label: 'a.png' });
  expect(await resolveImageReference('a.png\\|Named\\|alias', 'source.md', model, at, signal(), files)).toMatchObject({ label: 'Named|alias' });
});
