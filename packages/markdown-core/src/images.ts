import { extractMetadata } from './metadata.js';
import { wikiLinkParts } from './links.js';
import { isTableCellRange } from './tables.js';
import type { SourceChange } from './source.js';
import type { MarkdownModel, SourceSpan } from './syntax.js';

export type ImageAlignment = 'left' | 'center' | 'right';
export type ImageFit = 'contain' | 'cover';
export interface ImageAttributes {
  dark?: boolean;
  full?: boolean;
  width?: number;
  height?: number;
  scale?: number;
  align?: ImageAlignment;
  fit?: ImageFit;
}
export interface ImagePropertyDefinition {
  name: keyof ImageAttributes;
  label: string;
  type: 'boolean' | 'number' | 'enum';
  choices?: readonly string[];
  min?: number;
  integer?: boolean;
}
export const imagePropertyDefinitions: readonly ImagePropertyDefinition[] = [
  { name: 'dark', label: '深色背景适配', type: 'boolean' },
  { name: 'width', label: '宽度', type: 'number', min: 1, integer: true },
  { name: 'height', label: '高度', type: 'number', min: 1, integer: true },
  { name: 'scale', label: '倍率', type: 'number', min: Number.MIN_VALUE },
  { name: 'align', label: '对齐', type: 'enum', choices: ['left', 'center', 'right'] },
  { name: 'full', label: '允许超出正文宽度', type: 'boolean' },
  { name: 'fit', label: '图片适应方式', type: 'enum', choices: ['contain', 'cover'] },
];

interface AttributeToken { name?: string; value?: string | true; raw: string }
export interface ImageParameters extends ImageAttributes {
  /** The loadable target, with recognized legacy presentation fragments removed. */
  target: string;
  /** Null means that the source has no alias. */
  alias: string | null;
  attributes: Readonly<Record<string, string | true>>;
  dark: boolean;
  full: boolean;
  scale: number;
  align: ImageAlignment;
  fit: ImageFit;
}
export interface ImageEmbed extends SourceSpan {
  kind: 'wiki' | 'markdown' | 'reference';
  target: string;
  alias: string | null;
  parameters: ImageParameters;
  number: string;
  heading: string;
  /** Zero-based source line, used by figure-reference navigation. */
  line: number;
  /** Original image payload, before presentation normalization. */
  rawTarget: string;
  rawAlias: string | null;
  tableCell: boolean;
  /** Editable alt/alias content. Reference images are display-only for property edits. */
  aliasRange?: SourceSpan;
}

export const isImageTarget = (target: string): boolean =>
  /^data:image\//i.test(target) || /\.(?:bmp|png|jpe?g|gif|svg|webp|avif|ico)(?:[?#]|$)/i.test(target);

const propertyName = /^[a-z][a-z0-9-]*$/;
const unescape = (text: string) => text.replace(/\\([#|\\])/g, '$1');
const escapeValue = (text: string) => text.replace(/[\\#|]/g, '\\$&');
const keyOf = (raw: string) => raw.match(/^([a-z][a-z0-9-]*)(?:=|$)/)?.[1];

function tokens(raw: string): AttributeToken[] {
  return raw.split(/(?<!\\)#/).slice(1).map(value => {
    const name = keyOf(value), equal = value.indexOf('=');
    return { raw: '#' + value, name, value: name ? equal < 0 ? true : unescape(value.slice(equal + 1)) : undefined };
  });
}
function aliasParts(raw: string | null, tableCell = false) {
  if (raw === null) return { alias: null, prefix: '', tokens: [] as AttributeToken[], width: undefined as number | undefined, height: undefined as number | undefined };
  const prefix = raw.split(/(?<!\\)#/, 1)[0];
  const size = prefix.match(tableCell ? /(?:^|\\?\|)\s*(\d+)\s*(?:x\s*(\d+)\s*)?$/ : /(?:^|(?<!\\)\|)\s*(\d+)\s*(?:x\s*(\d+)\s*)?$/);
  const value = size ? prefix.slice(0, size.index) : prefix;
  return { alias: unescape(value).trim(), prefix: value, tokens: tokens(raw),
    width: size ? Number(size[1]) : undefined, height: size?.[2] ? Number(size[2]) : undefined };
}

function legacyTarget(raw: string) {
  if (/^data:/i.test(raw)) return { target: raw, attributes: {} as Record<string, string | true> };
  const parts = raw.split('#'), retained = [parts[0]], attributes: Record<string, string | true> = {};
  for (const part of parts.slice(1)) {
    if (part === 'dark' || part === 'full') attributes[part] = true;
    else if (part === 'center') attributes.align = 'center';
    else if (/^x(?:\d+(?:\.\d*)?|\.\d+)$/.test(part)) attributes.scale = part.slice(1);
    else retained.push(part);
  }
  return { target: retained.join('#'), attributes };
}

/** Reject invalid edits while retaining unsupported existing source parameters verbatim. */
export function validateImageAttribute(name: string, value: string | number | boolean | undefined): boolean {
  if (!propertyName.test(name)) return false;
  if (value === undefined) return true;
  const definition = imagePropertyDefinitions.find(item => item.name === name);
  if (!definition) return typeof value === 'boolean' || typeof value === 'string' && !/[\r\n\]]/.test(value);
  if (definition.type === 'boolean') return typeof value === 'boolean';
  if (definition.type === 'enum') return typeof value === 'string' && !!definition.choices?.includes(value);
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 && (!definition.integer || Number.isSafeInteger(number));
}

/** Wiki aliases and Markdown alt text share `alias#name=value#flag` presentation. */
export function parseImageParameters(target: string, alias: string | null = null, tableCell = false): ImageParameters {
  const source = legacyTarget(target), parts = aliasParts(alias, tableCell);
  const attributes: Record<string, string | true> = { ...source.attributes };
  if (parts.width !== undefined) attributes.width = String(parts.width);
  if (parts.height !== undefined) attributes.height = String(parts.height);
  for (const token of parts.tokens) if (token.name && token.value !== undefined) attributes[token.name] = token.value;
  const number = (key: 'width' | 'height' | 'scale') => {
    const value = attributes[key];
    return typeof value === 'string' && validateImageAttribute(key, value) ? Number(value) : undefined;
  };
  const align = attributes.align;
  const fit = attributes.fit;
  return { target: source.target, alias: parts.alias, attributes,
    dark: attributes.dark === true, full: attributes.full === true,
    width: number('width'), height: number('height'), scale: number('scale') ?? 1,
    align: align === 'center' || align === 'right' ? align : 'left', fit: fit === 'cover' ? fit : 'contain' };
}

const cache = new WeakMap<MarkdownModel, ImageEmbed[]>();
/** Full-note image instances, cached independently of selection and visible editor windows. */
export function imageEmbeds(model: MarkdownModel): ImageEmbed[] {
  const hit = cache.get(model);
  if (hit) return hit;
  const metadata = extractMetadata(model), headings = metadata.headings.filter(heading => heading.level === 1);
  const result: ImageEmbed[] = [];
  let section = -1, chapter = 0, counter = 0, line = 0, lineFrom = 0;
  for (const link of metadata.linkOccurrences) {
    if (!link.embed || !isImageTarget(link.target)) continue;
    const tableCell = isTableCellRange(model, link.from, link.to);
    let rawTarget = link.target, rawAlias: string | null = link.kind === 'wiki' ? null : link.label;
    let aliasRange: SourceSpan | undefined;
    if (link.kind === 'wiki') {
      const inner = model.text.slice(link.from + 3, link.to - 2), parts = wikiLinkParts(inner, tableCell);
      rawTarget = parts.destination;
      rawAlias = parts.alias;
      aliasRange = { from: link.from + 3 + (parts.dividerTo < 0 ? inner.length : parts.dividerTo), to: link.to - 2 };
    } else {
      const node = model.tree.resolveInner(link.from + 1, 1);
      let image = node;
      while (image.name !== 'Image' && image.parent) image = image.parent;
      const close = image.name === 'Image' ? image.getChildren('LinkMark')[1] : undefined;
      if (close) aliasRange = { from: link.from + 2, to: close.from };
      else {
        const alt = model.text.slice(link.from, link.to).match(/^!\[([^\]]*)\]\(/);
        if (alt) aliasRange = { from: link.from + 2, to: link.from + 2 + alt[1].length };
      }
    }
    const parameters = parseImageParameters(rawTarget, rawAlias, tableCell);
    for (let next = model.text.indexOf('\n', lineFrom); next >= 0 && next < link.from; next = model.text.indexOf('\n', lineFrom)) {
      line++; lineFrom = next + 1;
    }
    while (section + 1 < headings.length && headings[section + 1].from < link.from) { section++; counter = 0; }
    if (!counter) chapter++;
    counter++;
    result.push({ from: link.from, to: link.to, kind: link.kind === 'wiki' ? 'wiki' : link.kind === 'reference' ? 'reference' : 'markdown',
      target: parameters.target, alias: parameters.alias, parameters, rawTarget, rawAlias, aliasRange, tableCell,
      number: `${chapter}-${counter}`, heading: headings[section]?.text ?? '', line });
  }
  cache.set(model, result);
  return result;
}

export function imageAt(model: MarkdownModel, from: number): ImageEmbed | undefined {
  const images = imageEmbeds(model);
  let low = 0, high = images.length;
  while (low < high) { const middle = (low + high) >>> 1; if (images[middle].from < from) low = middle + 1; else high = middle; }
  return images[low]?.from === from ? images[low] : undefined;
}

export function imageName(target: string): string {
  if (/^data:/i.test(target)) return '图片';
  const filename = target.split(/[?#]/, 1)[0].split('/').at(-1) ?? target;
  try { return decodeURIComponent(filename); } catch { return filename; }
}
export function imageCaption(image: ImageEmbed): string {
  return `图${image.number} ${image.alias?.trim() || imageName(image.target)}`;
}
/** An omitted alias uses the number, an empty one uses the original filename. */
export function imageReferenceText(image: ImageEmbed | undefined, alias: string | null, target?: string, sourceName?: string): string | undefined {
  if (alias !== null) return alias.trim() || imageName(target ?? image?.target ?? '');
  if (!image) return;
  const number = `图${image.number}`;
  return sourceName ? `${sourceName} ${number}` : number;
}

/** Only this image's source is patched. The editor owns transaction/history and stale-state checks. */
export function rewriteImageAttribute(model: MarkdownModel, from: number, name: string, value: string | number | boolean | undefined): SourceChange {
  if (!validateImageAttribute(name, value)) throw new Error(`图片属性 ${name} 的值无效`);
  const image = imageAt(model, from);
  if (!image || !image.aliasRange) throw new Error('图片已改变，请重新打开菜单');
  const parts = aliasParts(image.rawAlias, image.tableCell), recognized = new Set(imagePropertyDefinitions.map(item => item.name));
  const attributes = { ...image.parameters.attributes };
  if (value === undefined || value === false) delete attributes[name];
  else attributes[name] = value === true ? true : String(value);
  const preserved = parts.tokens.filter(token => token.name !== name &&
    (!token.name || !recognized.has(token.name as keyof ImageAttributes) || !validateImageAttribute(token.name, token.value === true ? true : token.value))).map(token => token.raw);
  const normalized = imagePropertyDefinitions.flatMap(definition => {
    const current = attributes[definition.name];
    return current !== undefined && validateImageAttribute(definition.name, current === true ? true : current)
      ? ['#' + definition.name + (current === true ? '' : '=' + escapeValue(current))] : [];
  });
  if (!recognized.has(name as keyof ImageAttributes) && value !== undefined && value !== false)
    preserved.push('#' + name + (value === true ? '' : '=' + escapeValue(String(value))));
  const alias = parts.prefix + normalized.join('') + preserved.join('');
  if (image.kind === 'wiki') return { from: image.from + 3, to: image.to - 2,
    insert: image.parameters.target + (image.tableCell ? '\\|' : '|') + alias };
  return { ...image.aliasRange, insert: alias };
}
