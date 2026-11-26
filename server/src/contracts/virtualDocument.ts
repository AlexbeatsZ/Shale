import { z } from 'zod';

export const VIRTUAL_DOCUMENT_FILE = '.virtual-document.json';
export const virtualSourcePath = z.string().min(1).max(1000).refine(value =>
  !value.startsWith('/') && !value.includes('\\') && !/[\x00-\x1f:*?"<>|#]/.test(value) &&
  value.split('/').every(part => !!part && !part.startsWith('.') && part !== '..') && /\.(md|markdown|pdf)$/i.test(value),
  '来源必须是此文件夹内的 Markdown 或 PDF 相对路径');
/** Automatic streams match folder-relative paths (a top-level file is just its name). */
export const compileVirtualPattern = (pattern: string) => new RegExp(pattern, 'u');
const virtualPattern = z.string().min(1).max(500).superRefine((pattern, context) => {
  try { compileVirtualPattern(pattern); } catch (error) { context.addIssue({ code: 'custom', message: '正则表达式无效：' + (error as Error).message }); }
});
const virtualStream = z.object({
  title: z.string().trim().min(1).max(100),
  pattern: virtualPattern.optional(),
  files: z.array(virtualSourcePath).min(1).max(2000).optional(),
  /** Legacy (≤1.67) field; accepted for old descriptors, never written. Stream identity is its title. */
  id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/).optional(),
}).strict().superRefine((stream, context) => {
  if ((stream.pattern === undefined) === (stream.files === undefined))
    context.addIssue({ code: 'custom', message: `分组「${stream.title}」需要且只能使用 pattern 或 files 之一` });
});
export const virtualManifestSchema = z.object({
  /** Legacy (≤1.67) field; accepted, never written. */
  version: z.literal(1).optional(),
  title: z.string().trim().min(1).max(200),
  streams: z.array(virtualStream).min(1).max(16),
}).strict().superRefine((manifest, context) => {
  if (new Set(manifest.streams.map(stream => stream.title)).size !== manifest.streams.length)
    context.addIssue({ code: 'custom', message: '阅读分组标题必须唯一' });
  for (const stream of manifest.streams) if (stream.files && new Set(stream.files.map(file => file.normalize('NFC').toLowerCase())).size !== stream.files.length)
    context.addIssue({ code: 'custom', message: '同一阅读分组不能重复包含来源' });
});
export type VirtualManifest = z.infer<typeof virtualManifestSchema>;

export interface VirtualSource {
  path: string; title: string; kind: 'markdown' | 'pdf'; size: number;
  headings: { text: string; level: number }[];
  missing?: boolean;
}
/** Runtime projection: automatic streams are resolved against the current folder contents. */
export interface VirtualDocument {
  path: string; title: string; revision: string;
  streams: { id: string; title: string; files: VirtualSource[] }[];
}
