import type { ComponentProps } from 'react';
import { useStore } from '../lib/store';
import { findNode, isFolderPath } from '../lib/tree';
import { api } from '../lib/api';
import { AUDIO_EXT_RE, TEXT_EXT_RE, VIDEO_EXT_RE } from '../lib/media';
import Editor from './Editor';
import FolderView from './FolderView';
import SyncConflictPanel from './SyncConflictPanel';
import { useSyncConflict } from '../lib/syncConflicts';

export default function WorkspaceFile({ path, navigationId, onReady }: {
  path: string;
  navigationId: string;
  onReady?: ComponentProps<typeof Editor>['onReady'];
}) {
  const folder = useStore(state => isFolderPath(state.tree, path) && !findNode(state.tree, path)?.virtualDocument);
  const conflict = useSyncConflict(path);
  if (folder) return <FolderView path={path} navigationId={navigationId} />;
  // Text conflicts are reviewed inside the editor like MCP candidates; the rest use the file-level panel.
  if (conflict && !(conflict.action === 'modify' && conflict.localText !== null && TEXT_EXT_RE.test(path))) return <div className="sync-conflict-view">
    <SyncConflictPanel file={conflict} />
    {conflict.action !== 'add' && <div className="sync-conflict-content"><FileContent path={path} navigationId={navigationId} onReady={onReady} /></div>}
  </div>;
  return <FileContent path={path} navigationId={navigationId} onReady={onReady} />;
}

function FileContent({ path, navigationId, onReady }: {
  path: string;
  navigationId: string;
  onReady?: ComponentProps<typeof Editor>['onReady'];
}) {

  const image = /\.(png|jpe?g|gif|svg|webp)$/i.test(path);
  const video = VIDEO_EXT_RE.test(path);
  const audio = AUDIO_EXT_RE.test(path);
  if (image || video || audio) {
    return <div className="markdown-preview">
      <div className="preview-inner">
        {image ? <img src={api.rawUrl(path)} alt={path} />
          : video ? <video className="media-embed media-fileview" src={api.rawUrl(path)} controls preload="metadata" />
          : <audio className="media-embed media-fileview" src={api.rawUrl(path)} controls preload="metadata" />}
      </div>
    </div>;
  }
  return <Editor path={path} navigationId={navigationId} onReady={onReady} sidebar={navigationId.startsWith('sidebar:')} />;
}
