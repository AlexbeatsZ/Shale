import type { TreeNode } from './api';
import { findNode } from './tree';
import { TEXT_EXT_RE } from './media';
import { isPagedDocument } from './pdf/documentResource';
import { hasWebViewer } from './platform';

export const GRAPH_PATH = 'graph://view';
export const isHomepagePath = (path: string | null): boolean => /^home:\/\/[\w-]+$/.test(path ?? '');
export const isWebViewerPath = (path: string | null): boolean => /^webviewer:\/\/[\w-]+$/.test(path ?? '');

export function workspaceContent(tree: TreeNode | null, path: string) {
  if (isHomepagePath(path)) return 'home';
  if (path === GRAPH_PATH) return 'graph';
  if (isWebViewerPath(path)) return 'web';
  const node = findNode(tree, path);
  if (node?.virtualDocument) return 'virtual';
  if (node?.type === 'folder') return 'folder';
  if (isPagedDocument(path)) return 'paged';
  return TEXT_EXT_RE.test(path) ? 'text' : 'attachment';
}

export const canOpenWorkspaceContent = (path: string) => !!path && (!isWebViewerPath(path) || hasWebViewer());
