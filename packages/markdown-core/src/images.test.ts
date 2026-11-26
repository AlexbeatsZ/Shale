import { expect, it } from 'vitest';
import { analyzeMarkdown } from './syntax.js';
import { SourceDocument } from './source.js';
import { extractMetadata } from './metadata.js';
import { tableModels } from './tables.js';
import { imageAt, imageCaption, imageEmbeds, imageReferenceText, parseImageParameters, rewriteImageAttribute, validateImageAttribute } from './images.js';

it('parses English image flags and values only from the alias attributes', () => {
  expect(parseImageParameters('image.png', '示意图#dark#align=center#width=420#height=200#scale=1.5')).toMatchObject({
    target: 'image.png', alias: '示意图', dark: true, align: 'center', width: 420, height: 200, scale: 1.5,
  });
  // Target fragments and trailing sizes are ordinary target/alias text.
  expect(parseImageParameters('image.png#dark', '示意图|300x200')).toMatchObject({
    target: 'image.png#dark', alias: '示意图|300x200', dark: false, width: undefined, height: undefined,
  });
  expect(parseImageParameters('my-dark-Wiki.png', '说明#full#fit=cover#custom')).toMatchObject({
    dark: false, full: true, fit: 'cover', attributes: { full: true, fit: 'cover', custom: true },
  });
  expect(parseImageParameters('a.svg#symbol', '标题\\#部分#dark')).toMatchObject({ target: 'a.svg#symbol', alias: '标题#部分', dark: true });
  expect(parseImageParameters('data:image/svg+xml,%3Csvg%3E#dark', '')).toMatchObject({
    target: 'data:image/svg+xml,%3Csvg%3E#dark', dark: false,
  });
});

it('ignores invalid existing values while validating property edits', () => {
  expect(parseImageParameters('a.png', '#width=0#height=-2#scale=Infinity#align=up#dark=false')).toMatchObject({
    width: undefined, height: undefined, scale: 1, align: 'left', dark: false,
  });
  for (const value of [0, -1, 1.5, Infinity, '']) expect(validateImageAttribute('width', value)).toBe(false);
  expect(validateImageAttribute('width', 320)).toBe(true);
  expect(validateImageAttribute('scale', 0.5)).toBe(true);
  expect(validateImageAttribute('align', 'center')).toBe(true);
  expect(validateImageAttribute('dark', true)).toBe(true);
  expect(validateImageAttribute('dark', 'true')).toBe(false);
});

it('numbers wiki and Markdown images by nonempty H1 chapters and excludes literal or commented images', () => {
  const source = '# Empty\n\n# First\n\n![[one.png|别名#dark]]\n\n[[one.png]]\n\n![说明#width=200](two.png)\n\n## Subsection\n\n![[three.svg]]\n\n# Empty again\n\n# Second\n\n> ![[four.png|]]\n\n`![[no.png]]`\n\n<!-- ![[no2.png]] -->\n\n%% ![[no3.png]] %%\n';
  const model = analyzeMarkdown(source, 'chapter.md');
  const images = imageEmbeds(model);
  expect(images.map(image => [image.target, image.number])).toEqual([
    ['one.png', '1-1'], ['two.png', '1-2'], ['three.svg', '1-3'], ['four.png', '2-1'],
  ]);
  expect(imageEmbeds(model)).toBe(images);
  expect(imageAt(model, images[1].from)).toBe(images[1]);
  expect(imageAt(model, images[1].from + 1)).toBeUndefined();
  expect(imageCaption(images[0])).toBe('图1-1 别名');
  expect(imageCaption(images[3])).toBe('图2-1 four.png');
});

it('preserves figure link alias semantics and uses the original filename for an empty alias', () => {
  const image = imageEmbeds(analyzeMarkdown('![[assets/image.png|图像别名#dark]]'))[0];
  expect(imageReferenceText(image, null)).toBe('图1-1');
  expect(imageReferenceText(image, '')).toBe('image.png');
  expect(imageReferenceText(image, '自定义')).toBe('自定义');
  expect(imageReferenceText(image, null, image.target, '其他笔记')).toBe('其他笔记 图1-1');
  expect(imageReferenceText(undefined, null)).toBeUndefined();
});

it('edits only one wiki embed, orders known properties and preserves unknown property bytes', () => {
  const text = 'before ![[a.png|名称#align=center#height=200#special=a\\#b#width=old#unknown]] after\n![[a.png|另一张#dark]]';
  const model = analyzeMarkdown(text), first = imageEmbeds(model)[0];
  const change = rewriteImageAttribute(model, first.from, 'width', 480), source = new SourceDocument(text);
  source.apply([change]);
  expect(source.text).toBe('before ![[a.png|名称#width=480#height=200#align=center#special=a\\#b#unknown]] after\n![[a.png|另一张#dark]]');
  const changed = analyzeMarkdown(source.text), next = imageEmbeds(changed)[0];
  source.apply([rewriteImageAttribute(changed, next.from, 'dark', true)]);
  expect(source.text).toContain('名称#dark#width=480#height=200#align=center#special=a\\#b#unknown');
  const last = analyzeMarkdown(source.text);
  source.apply([rewriteImageAttribute(last, imageEmbeds(last)[0].from, 'dark', undefined)]);
  expect(imageEmbeds(analyzeMarkdown(source.text))[0].parameters.dark).toBe(false);
});

it('patches Markdown alt bytes while retaining balanced data payloads and titles', () => {
  const text = '![caption](<data:image/svg+xml,%3Csvg%20fill="rgb(1,2,3)"%3E> "title")';
  const model = analyzeMarkdown(text), image = imageEmbeds(model)[0];
  expect(image).toBeDefined();
  const change = rewriteImageAttribute(model, image.from, 'dark', true), source = new SourceDocument(text);
  source.apply([change]);
  expect(source.text).toBe(text.replace('caption', 'caption#dark'));
});

it('shares legacy spaced image targets with metadata and preserves their original destination bytes', () => {
  const text = '![旧图#dark](folder/my image.png "title")\n\n`![code](no image.png)`\n\n\\![escaped](no image.png)\n\n<!-- ![comment](no image.png) -->';
  const model = analyzeMarkdown(text), images = imageEmbeds(model);
  expect(images).toHaveLength(1);
  expect(images[0]).toMatchObject({ target: 'folder/my image.png', alias: '旧图', number: '1-1', parameters: { dark: true } });
  expect(extractMetadata(model).links).toEqual(['folder/my image.png']);
  const source = new SourceDocument(text);
  source.apply([rewriteImageAttribute(model, images[0].from, 'width', 320)]);
  expect(source.text).toBe(text.replace('旧图#dark', '旧图#dark#width=320'));
});

it('parses table-escaped wiki aliases and keeps property edits inside their original cells', () => {
  const text = '# Chapter\n\n| Image | Reference |\n| --- | --- |\n'
    + '| ![[a.png\\|Alias\\|part#width=120#dark#mystery=a\\#b]] | [[a.png]] [[a.png\\|]] [[a.png\\|Named\\|alias]] |\n'
    + '| ![[b.png\\|Old#width=300#height=200#custom=x\\|y]] | other |\n\nend';
  const model = analyzeMarkdown(text), images = imageEmbeds(model);
  expect(images).toHaveLength(2);
  expect(images[0]).toMatchObject({ target: 'a.png', alias: 'Alias|part', number: '1-1', parameters: { width: 120, dark: true } });
  expect(images[1]).toMatchObject({ target: 'b.png', alias: 'Old', number: '1-2', parameters: { width: 300, height: 200 } });
  expect(extractMetadata(model).linkOccurrences.map(link => [link.target, link.label])).toEqual([
    ['a.png', 'Alias|part#width=120#dark#mystery=a\\#b'], ['a.png', 'a.png'], ['a.png', ''],
    ['a.png', 'Named|alias'], ['b.png', 'Old#width=300#height=200#custom=x|y'],
  ]);
  const source = new SourceDocument(text);
  source.apply([rewriteImageAttribute(model, images[0].from, 'dark', false)]);
  expect(source.text).toBe(text.replace('#width=120#dark#mystery', '#width=120#mystery'));
  const changed = analyzeMarkdown(source.text), second = imageEmbeds(changed)[1];
  source.apply([rewriteImageAttribute(changed, second.from, 'width', 480)]);
  expect(source.text).toContain('![[b.png\\|Old#width=480#height=200#custom=x\\|y]]');
  const table = tableModels(analyzeMarkdown(source.text))[0];
  expect(table.editable).toBe(true);
  expect(table.rows.map(row => row.cells.length)).toEqual([2, 2, 2]);
  expect(imageEmbeds(analyzeMarkdown(source.text)).map(image => image.number)).toEqual(['1-1', '1-2']);
});

it('keeps escaped pipes as literal target bytes outside genuine table cells', () => {
  const text = '![[a\\|b.png]]\n\n![[a.png|Alias\\|part#dark]]\n\n'
    + '| not a table ![[a\\|b.png]] |';
  const model = analyzeMarkdown(text), images = imageEmbeds(model);
  expect(extractMetadata(model).linkOccurrences.map(link => link.target)).toEqual(['a|b.png', 'a.png', 'a|b.png']);
  expect(images.map(image => image.alias)).toEqual([null, 'Alias|part', null]);
  const source = new SourceDocument(text);
  source.apply([rewriteImageAttribute(model, images[1].from, 'width', 120)]);
  expect(source.text).toContain('![[a.png|Alias\\|part#dark#width=120]]');
});
