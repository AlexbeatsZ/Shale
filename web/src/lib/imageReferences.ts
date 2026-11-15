import { analyzeMarkdown, imageEmbeds, imageName, imageReferenceText, isTableCellRange, parseImageParameters, parseLinkTarget, SourceDocument, TargetIndex, wikiLinkParts,
  type ImageEmbed, type MarkdownModel } from '@webobsidian/markdown-core';
import { api, vaultRequestIdentity } from './api';
import { documents } from './documents';
import { searchEntries, subscribeSearch } from './search';

export interface ResolvedImageReference {
  label?: string;
  image?: ImageEmbed;
  sourcePath?: string;
  from?: number;
  line?: number;
  targetPath?: string;
  status: 'resolved' | 'missing' | 'ambiguous';
}
const indexes = new WeakMap<readonly string[], TargetIndex>();
let catalog: ReturnType<typeof searchEntries> | undefined, catalogFiles: string[] = [];
function fileIndex(files?: readonly string[]) {
  const entries = searchEntries();
  if (!files) {
    if (catalog !== entries) { catalog = entries; catalogFiles = entries.filter(entry => entry.kind === 'file').map(entry => entry.path); }
    files = catalogFiles;
  }
  let index = indexes.get(files);
  if (!index) { index = new TargetIndex(files); indexes.set(files, index); }
  return index;
}
const signatures = new WeakMap<MarkdownModel, string>();
function imageSignature(model: MarkdownModel): string {
  let signature = signatures.get(model);
  if (signature === undefined) {
    signature = imageEmbeds(model).map(image => `${image.from}:${image.to}:${image.number}:${image.target}:${image.alias ?? ''}`).join('\n');
    signatures.set(model, signature);
  }
  return signature;
}
function openedImages(): string {
  return documents.snapshots().flatMap(snapshot => {
    const model = documents.get(snapshot.id)?.analysis;
    const signature = model && imageSignature(model);
    return signature ? [snapshot.id + '\0' + signature] : [];
  }).join('\n');
}
function matchingImages(model: MarkdownModel, path: string, target: string, index: TargetIndex): ImageEmbed[] {
  return imageEmbeds(model).filter(image => {
    const resolved = index.resolve(image.target, path);
    return resolved.status === 'resolved' && resolved.path === target;
  });
}

interface OriginalResult { image?: ImageEmbed; path?: string; status: ResolvedImageReference['status'] }
interface OriginalEntry {
  catalog: ReturnType<typeof searchEntries>;
  opened: string;
  pathVersion: number;
  index: TargetIndex;
  promise: Promise<OriginalResult>;
}
const originals = new Map<string, OriginalEntry>();
const maximumCandidates = 64;

async function originalImage(target: string, index: TargetIndex): Promise<OriginalResult> {
  const vault = await vaultRequestIdentity(), key = vault + '\0' + target;
  const entries = searchEntries(), opened = openedImages(), pathVersion = documents.pathVersion;
  let cached = originals.get(key);
  if (cached?.catalog !== entries || cached.opened !== opened || cached.pathVersion !== pathVersion || cached.index !== index) {
    const promise = (async (): Promise<OriginalResult> => {
      const backlinks = await api.backlinks(target);
      const paths = new Set(backlinks.backlinks);
      // The server's saved graph must not hide new unsaved explicit images.
      for (const snapshot of documents.snapshots()) if (snapshot.dirty) paths.add(snapshot.id);
      const candidates = [...paths].sort();
      if (candidates.length > maximumCandidates) return { status: 'ambiguous' };
      let match: { image: ImageEmbed; path: string } | undefined;
      for (const path of candidates) {
        if (!/\.(?:md|markdown)$/i.test(path)) continue;
        const session = documents.get(path);
        let model = session?.analysis;
        if (!model) {
          try { model = analyzeMarkdown(new SourceDocument((await api.read(path, vault)).content).text, path); }
          catch (error) { if ((error as { status?: number }).status === 404) continue; throw error; }
        }
        const image = matchingImages(model, path, target, index)[0];
        if (!image) continue;
        if (match) return { status: 'ambiguous' };
        match = { image, path };
      }
      return match ? { ...match, status: 'resolved' } : { status: 'missing' };
    })();
    cached = { catalog: entries, opened, pathVersion, index, promise };
    originals.delete(key); originals.set(key, cached);
    while (originals.size > 64) originals.delete(originals.keys().next().value!);
    void promise.catch(() => { if (originals.get(key)?.promise === promise) originals.delete(key); });
  }
  return cached.promise;
}

/**
 * The nearest preceding explicit image owns a same-note reference. References
 * before all instances use the first local instance, then a unique source note.
 */
export async function resolveImageReference(target: string, sourcePath: string, model: MarkdownModel, at: number,
  signal: AbortSignal, files?: readonly string[]): Promise<ResolvedImageReference> {
  signal.throwIfAborted();
  const tableCell = isTableCellRange(model, at), parts = wikiLinkParts(target, tableCell), raw = parts.destination;
  const alias = parseLinkTarget(target, tableCell).alias?.trim() ?? null;
  const clean = parseImageParameters(raw).target, index = fileIndex(files), resolved = index.resolve(clean, sourcePath);
  const targetPath = resolved.status === 'resolved' ? resolved.path : undefined;
  const fallback = imageReferenceText(undefined, alias, clean);
  if (!targetPath) {
    // Remote/data images have no Vault identity, but explicit local instances
    // can still be referenced by their exact target.
    const local = resolved.status === 'external' || /^data:/i.test(clean)
      ? imageEmbeds(model).filter(image => image.target === clean) : [];
    const image = local.findLast(image => image.from < at) ?? local[0];
    return { label: imageReferenceText(image, alias, clean) ?? fallback, image, from: image?.from, line: image?.line,
      sourcePath: image ? sourcePath : undefined, status: image ? 'resolved' : resolved.status === 'ambiguous' ? 'ambiguous' : 'missing' };
  }
  const local = matchingImages(model, sourcePath, targetPath, index);
  const image = local.findLast(image => image.from < at) ?? local[0];
  if (image) return { image, sourcePath, from: image.from, line: image.line, targetPath, status: 'resolved', label: imageReferenceText(image, alias, targetPath) };
  if (alias !== null) return { label: fallback ?? imageName(targetPath), targetPath, status: 'resolved' };
  const original = await originalImage(targetPath, index);
  signal.throwIfAborted();
  const sourceName = original.path && original.path !== sourcePath ? original.path.split('/').at(-1)!.replace(/\.(?:md|markdown)$/i, '') : undefined;
  return { image: original.image, sourcePath: original.path, from: original.image?.from, line: original.image?.line, targetPath, status: original.status,
    label: imageReferenceText(original.image, null, targetPath, sourceName) };
}

const listeners = new Set<() => void>();
let stopNotifications: (() => void) | undefined;
/** Existing document/catalog notifications refresh mounted references without a new watcher. */
export function subscribeImageReferences(listener: () => void): () => void {
  listeners.add(listener);
  if (!stopNotifications) {
    let catalog = searchEntries(), signature = openedImages();
    const notify = () => { for (const listener of listeners) listener(); };
    const stopDocuments = documents.subscribe(() => {
      const next = openedImages();
      if (next === signature) return;
      signature = next; notify();
    });
    const stopSearch = subscribeSearch(() => {
      const next = searchEntries();
      if (catalog === next) return;
      catalog = next; notify();
    });
    stopNotifications = () => { stopDocuments(); stopSearch(); };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { stopNotifications?.(); stopNotifications = undefined; }
  };
}
