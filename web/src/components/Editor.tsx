import { useStore } from '../lib/store';
import type { LinkIntent } from '../lib/fragmentNavigation';
import { MarkdownDocument } from './MarkdownDocument';
import { workspaceContent } from '../lib/workspaceContent';
import AttachmentView from './AttachmentView';
import PdfViewer from './PdfViewer';
import { findNode } from '../lib/tree';
import VirtualDocumentView from './VirtualDocumentView';

type Ready = (view: import('@codemirror/view').EditorView | null) => void;
export interface EditorProps {
  path?: string;
  reading?: boolean;
  embedded?: boolean;
  fragment?: string;
  navigationId?: string;
  tabId?: string;
  active?: boolean;
  onOpenLink?: (target: string, sourcePath?: string, intent?: LinkIntent) => Promise<void>;
  onReady?: Ready;
}

export default function Editor({ path: suppliedPath, navigationId = 'main', ...props }: EditorProps) {
  const activePath = useStore(s => suppliedPath ? null : s.panes.main.path);
  const path = suppliedPath ?? activePath;
  const kind = useStore(state => path ? workspaceContent(state.tree, path) : null);
  const collection = useStore(state => kind === 'virtual' && path ? findNode(state.tree, path)?.virtualDocument : undefined);
  if (!path) return null;
  if (collection) return <VirtualDocumentView document={collection} viewId={navigationId} tabId={props.tabId} />;
  if (kind === 'paged') return <PdfViewer key={path} path={path} viewId={navigationId} tabId={props.tabId} />;
  if (kind !== 'text') return <AttachmentView key={path} path={path} />;
  return <MarkdownDocument key={path} {...props} path={path} navigationId={navigationId} />;
}
