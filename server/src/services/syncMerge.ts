import { diffLines } from 'diff';

/** Text formats that are safe to merge line by line. Everything else is treated as binary. */
const textExtensions = new Set(['md', 'markdown', 'txt', 'canvas', 'json', 'jsonc', 'js', 'mjs', 'cjs', 'ts', 'css', 'scss',
  'html', 'htm', 'svg', 'xml', 'yaml', 'yml', 'csv', 'tsv', 'tex', 'bib', 'base', 'excalidraw']);
export const maxMergeBytes = 8 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });

export function textExtension(name: string): boolean {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return name.includes('.') && textExtensions.has(extension);
}

/** Decodes bytes as UTF-8 text, or returns null for binary, oversized or invalid content. */
export function decodeText(bytes: Buffer | null): string | null {
  if (!bytes) return '';
  if (bytes.length > maxMergeBytes || bytes.includes(0)) return null;
  try { return decoder.decode(bytes); } catch { return null; }
}

/** Splits text into lines that keep their own terminators, so joining restores the exact bytes. */
export function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

export type DiffBlock = { type: 'same' | 'add' | 'del' | 'skip'; lines: string[]; skipped?: number };

/**
 * Describes what replacing `local` with `remote` would change, from the local device's point of view:
 * `del` lines disappear from this device, `add` lines arrive from the server. Long unchanged runs are
 * collapsed to `context` lines around each change.
 */
export function describeChange(local: string, remote: string, context = 3, maxLines = 4000): { blocks: DiffBlock[]; truncated: boolean } {
  const blocks: DiffBlock[] = []; let total = 0; let truncated = false;
  const parts = diffLines(local, remote);
  parts.forEach((part, index) => {
    if (truncated) return;
    const lines = splitLines(part.value).map(line => line.replace(/\r?\n$/, ''));
    if (part.added || part.removed) {
      blocks.push({ type: part.added ? 'add' : 'del', lines }); total += lines.length;
    } else {
      const head = index === 0 ? 0 : context; const tail = index === parts.length - 1 ? 0 : context;
      if (lines.length > head + tail + 1) {
        if (head) blocks.push({ type: 'same', lines: lines.slice(0, head) });
        blocks.push({ type: 'skip', lines: [], skipped: lines.length - head - tail });
        if (tail) blocks.push({ type: 'same', lines: lines.slice(-tail) });
        total += head + tail;
      } else { blocks.push({ type: 'same', lines }); total += lines.length; }
    }
    if (total > maxLines) truncated = true;
  });
  return { blocks, truncated };
}
