import type { ComponentProps } from 'react';
import { useStore } from '../lib/store';
import { findNode, isFolderPath } from '../lib/tree';
import { api } from '../lib/api';
import { AUDIO_EXT_RE, VIDEO_EXT_RE } from '../lib/media';
import Editor from './Editor';
import FolderView from './FolderView';

export default function WorkspaceFile({ path, navigationId, onReady }: {
  path: string;
  navigationId: string;
  onReady?: ComponentProps<typeof Editor>['onReady'];
}) {
  const folder = useStore(state => isFolderPath(state.tree, path) && !findNode(state.tree, path)?.virtualDocument);
  if (folder) return <FolderView path={path} navigationId={navigationId} />;

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
