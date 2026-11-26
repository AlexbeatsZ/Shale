import { promises as fs } from 'node:fs';
import path from 'node:path';
import { virtualManifestSchema, virtualSourcePath, compileVirtualPattern, VIRTUAL_DOCUMENT_FILE, type VirtualManifest } from '../contracts/virtualDocument.js';
import type { TreeNode } from '../contracts.js';
import { catalog } from './catalog.js';
import { parseConfiguration } from './vaultConfiguration.js';
import { readFileSnapshot, resolveInVault } from './vaultFile.js';
import { writeFileText, trash } from './vault.js';
import { parseLinkTarget, isGlobalContentTarget } from '@shale/markdown-core';
import { applyEdits, modify } from 'jsonc-parser';

const failure = (message: string, status = 400) => Object.assign(new Error(message), { status });
const compare = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
export async function resolveVirtualDocument(target: string, source = '') {
  if (isGlobalContentTarget(target)) return undefined;
  const parsed = parseLinkTarget(target);
  if (!parsed.path || /^[a-z][a-z\d+.-]*:/i.test(parsed.path)) return undefined;
  const normalize = (value: string) => path.posix.normalize(value).normalize('NFC').toLowerCase();
  const requested = normalize(parsed.path), local = normalize(path.posix.join(path.posix.dirname(source), parsed.path));
  const folders = [...catalog.entries.values()].filter(entry => entry.kind === 'folder');
  for (const candidates of [folders.filter(entry => normalize(entry.path) === requested),
    folders.filter(entry => normalize(entry.path) === local), folders.filter(entry => normalize(entry.path).endsWith('/' + requested))]) {
    const valid: string[] = [];
    for (const candidate of candidates) try { if (await readVirtualManifest(candidate.path)) valid.push(candidate.path); } catch { /* invalid descriptors retain normal folder behavior */ }
    if (valid.length) return { status: valid.length === 1 ? 'resolved' as const : 'ambiguous' as const,
      path: valid.length === 1 ? valid[0] : undefined, candidates: valid, fragment: parsed.fragment };
  }
  return undefined;
}
function configPath(folder: string) {
  if (!folder || folder.startsWith('/') || folder.includes('\\') || folder.split('/').some(part => !part || part.startsWith('.')))
    throw failure('请选择可见资料文件夹');
  return folder + '/' + VIRTUAL_DOCUMENT_FILE;
}
export async function readVirtualManifest(folder: string) {
  const relative = configPath(folder), absolute = await resolveInVault(relative);
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw failure('连续文档配置最多 1 MiB');
    const snapshot = await readFileSnapshot(relative);
    return { ...snapshot, manifest: virtualManifestSchema.parse(parseConfiguration(snapshot.content)) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Folder-relative member candidates from the physical tree: visible Markdown/PDF only. */
function folderSources(folder: TreeNode) {
  const files: string[] = [];
  const visit = (node: TreeNode) => {
    if (node.type === 'file') {
      const relative = node.path.slice(folder.path.length + 1);
      if (virtualSourcePath.safeParse(relative).success) files.push(relative);
    } else node.children?.forEach(visit);
  };
  folder.children?.forEach(visit);
  return files.sort(compare.compare);
}
const matches = (pattern: string, relative: string) => compileVirtualPattern(pattern).test(relative.normalize('NFC'));
/** Automatic streams are computed from current files on every projection; manual lists are used as written. */
export function resolveVirtualStreams(manifest: VirtualManifest, sources: readonly string[]) {
  return manifest.streams.map(stream => ({ id: stream.title, title: stream.title,
    files: stream.pattern !== undefined ? sources.filter(file => matches(stream.pattern!, file)) : stream.files! }));
}

/** A projection of the existing physical tree/catalog, never a second file index. */
export async function describeVirtualDocuments(tree: TreeNode): Promise<TreeNode> {
  const files = new Map<string, TreeNode>(), folders: TreeNode[] = [];
  const visit = (node: TreeNode) => {
    if (node.type === 'file') files.set(node.path, node);
    else { if (node.path) folders.push(node); node.children?.forEach(visit); }
  };
  visit(tree);
  for (let at = 0; at < folders.length; at += 8) await Promise.all(folders.slice(at, at + 8).map(async node => {
    try {
      const source = await readVirtualManifest(node.path);
      if (!source) return;
      const streams = resolveVirtualStreams(source.manifest, folderSources(node)).filter(stream => stream.files.length);
      if (!streams.length) throw failure('没有符合任何分组的 Markdown 或 PDF 来源');
      node.virtualDocument = { path: node.path, title: source.manifest.title, revision: source.revision,
        streams: streams.map(stream => ({ ...stream, files: stream.files.map(relative => {
          const filePath = node.path + '/' + relative, file = files.get(filePath), note = catalog.notes.get(filePath);
          return { path: filePath, title: relative.split('/').pop()!.replace(/\.(md|markdown|pdf)$/i, ''),
            kind: /\.pdf$/i.test(relative) ? 'pdf' as const : 'markdown' as const, size: file?.size ?? 0,
            headings: note?.outline ?? note?.headings.map(text => ({ text, level: 1 })) ?? [], missing: !file };
        }) })) };
    } catch (error) { node.virtualDocumentError = '连续文档配置无效：' + (error as Error).message; }
  }));
  return tree;
}

/** Enabling a folder writes automatic streams, so later files join without editing the descriptor. */
export function defaultVirtualManifest(folder: TreeNode): VirtualManifest {
  const sources = folderSources(folder), index = /(?:^|[ /])索引\.md$/i;
  const markdown = sources.some(file => index.test(file)) ? '(?<!(?:^|[ /])索引)\\.(?:md|markdown)$' : '\\.(?:md|markdown)$';
  const streams = [{ title: 'MD', pattern: markdown }, { title: 'PDF', pattern: '\\.pdf$' }]
    .filter(stream => sources.some(file => matches(stream.pattern, file)));
  if (!streams.length) throw failure('此文件夹没有 Markdown 或 PDF 来源');
  return { title: folder.name, streams };
}

const manualSources = (manifest: VirtualManifest) => manifest.streams.flatMap(stream => stream.files ?? []);
export async function saveVirtualManifest(folder: string, raw: unknown, revision?: string) {
  const manifest = virtualManifestSchema.parse(raw), relative = configPath(folder);
  const stat = await fs.stat(await resolveInVault(folder));
  if (!stat.isDirectory()) throw failure('请选择资料文件夹');
  const current = await readVirtualManifest(folder);
  if (current && revision !== current.revision) throw failure('连续文档配置已变化，请重新打开', 409);
  if (!current && revision) throw failure('连续文档配置已移除，请重新打开', 409);
  for (const source of manualSources(manifest)) {
    const sourceStat = await fs.stat(await resolveInVault(folder + '/' + source));
    if (!sourceStat.isFile()) throw failure('来源不是文件：' + source);
  }
  return writeFileText(relative, JSON.stringify(manifest, null, 2) + '\n', revision, { createOnly: !current });
}

/** Validate an editor draft before writing; preserve its original JSON text. */
export async function validateVirtualManifestText(folder: string, content: string) {
  configPath(folder);
  if (Buffer.byteLength(content, 'utf8') > 1024 * 1024) throw failure('连续文档配置最多 1 MiB');
  const manifest = virtualManifestSchema.parse(parseConfiguration(content));
  for (const source of manualSources(manifest)) {
    const stat = await fs.stat(await resolveInVault(folder + '/' + source));
    if (!stat.isFile()) throw failure('来源不是文件：' + source);
  }
  return manifest;
}

export async function disableVirtualDocument(folder: string, revision: string) {
  const current = await readVirtualManifest(folder);
  if (!current || current.revision !== revision) throw failure('连续文档配置已变化，请重新打开', 409);
  // Only its descriptor is trashed; all member files remain untouched.
  return trash(configPath(folder));
}

/** Prepare before moving; the revision-checked write runs inside the source path locks. */
export async function prepareVirtualSourceRename(folder: string, revision: string, from: string, to: string) {
  const current = await readVirtualManifest(folder);
  if (!current || current.revision !== revision) throw failure('连续文档配置已变化，请重新打开', 409);
  if (!from.startsWith(folder + '/') || path.posix.dirname(from) !== path.posix.dirname(to))
    throw failure('请在原文件夹内修改来源标题');
  if (path.posix.extname(from).toLowerCase() !== path.posix.extname(to).toLowerCase())
    throw failure('修改来源标题时不能更改文件类型');
  const before = from.slice(folder.length + 1), after = to.slice(folder.length + 1);
  const bom = current.content.startsWith('\uFEFF') ? '\uFEFF' : '';
  let content = current.content.slice(bom.length), listed = false;
  current.manifest.streams.forEach((stream, streamIndex) => stream.files?.forEach((file, fileIndex) => {
    if (file !== before) return;
    listed = true;
    content = applyEdits(content, modify(content, ['streams', streamIndex, 'files', fileIndex], after, {}));
  }));
  const automatic = current.manifest.streams.filter(stream => stream.pattern !== undefined);
  const matched = virtualSourcePath.safeParse(before).success && automatic.some(stream => matches(stream.pattern!, before));
  if (!listed && !matched) throw failure('此来源不属于当前连续文档');
  // Automatic membership follows the name; refuse a title that would silently drop the file from the document.
  if (!listed && !automatic.some(stream => matches(stream.pattern!, after)))
    throw failure('新文件名不符合任何分组的匹配规则，改名后会离开此连续文档');
  if (!listed) return async () => {};
  virtualManifestSchema.parse(parseConfiguration(content));
  return async () => { await writeFileText(configPath(folder), bom + content, revision); };
}
