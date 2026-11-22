import { useState } from 'react';
import { useStore } from '../lib/store';
import { resolveAllSyncConflicts, useSyncConflicts } from '../lib/syncConflicts';
import Icon from './Icon';

const letters = { add: 'A', delete: 'D', modify: 'M' } as const;

/** VS Code style "merge changes" group at the top of the file list. */
export default function SyncChanges() {
  const files = [...useSyncConflicts().values()];
  const activePath = useStore(state => state.activePath);
  const [busy, setBusy] = useState(false);
  if (!files.length) return null;
  const all = async (choice: 'local' | 'remote') => {
    setBusy(true);
    try { await resolveAllSyncConflicts(choice); await useStore.getState().loadTree(); }
    catch (error) { useStore.getState().notify((error as Error).message, 6000); }
    finally { setBusy(false); }
  };
  return <div className="sync-changes" role="group" aria-label="同步冲突">
    <div className="sync-changes-header">
      <span>同步冲突</span><span className="sync-changes-count">{files.length}</span>
      <button type="button" className="clickable-icon" title="全部保留本机" disabled={busy} onClick={() => void all('local')}><Icon name="monitor" size={14} /></button>
      <button type="button" className="clickable-icon" title="全部采用服务器" disabled={busy} onClick={() => void all('remote')}><Icon name="cloud-download" size={14} /></button>
    </div>
    {files.map(file => {
      const slash = file.path.lastIndexOf('/');
      return <div key={file.path} className={`tree-row sync-conflict is-${file.action}${activePath === file.path ? ' active' : ''}`}
        title={file.path} data-sync-path={file.path} onClick={() => void useStore.getState().openFile(file.path)}>
        <span className="twisty leaf" />
        <span className="name">{file.path.slice(slash + 1)}</span>
        {slash > 0 && <span className="sync-changes-folder">{file.path.slice(0, slash)}</span>}
        <span className="sync-conflict-letter">{letters[file.action]}</span>
      </div>;
    })}
  </div>;
}
