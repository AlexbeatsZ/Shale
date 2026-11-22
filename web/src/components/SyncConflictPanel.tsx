import { useState } from 'react';
import type { SyncConflictFile } from '../../../server/src/contracts/fileSync';
import { useStore } from '../lib/store';
import { resolveSyncConflict, syncConflictUrl } from '../lib/syncConflicts';

const actionLabels: Record<SyncConflictFile['action'], string> = { add: '将新增', delete: '将删除', modify: '将修改' };

function Preview({ file }: { file: SyncConflictFile }) {
  return <div className="sync-diff-images">
    {(['local', 'remote'] as const).map(side => <figure key={side} className={side === 'local' ? 'is-removed' : 'is-added'}>
      {(side === 'local' ? file.localSize : file.remoteSize) === null ? <div className="sync-diff-empty">—</div>
        : <img src={syncConflictUrl(file.path, side)} alt={side === 'local' ? '本机' : '服务器'} />}
      <figcaption>{side === 'local' ? '本机' : '服务器'}</figcaption>
    </figure>)}
  </div>;
}

function Diff({ file }: { file: SyncConflictFile }) {
  if (!file.diff) return null;
  return <pre className="sync-diff" aria-label={`${file.path} 的差异`}>
    {file.diff.map((block, index) => block.type === 'skip'
      ? <div key={index} className="sync-diff-skip">⋯ {block.skipped} 行未变化 ⋯</div>
      : block.lines.map((line, row) => <div key={`${index}-${row}`} className={`sync-diff-line is-${block.type}`}>
        <span className="sync-diff-sign">{block.type === 'add' ? '+' : block.type === 'del' ? '−' : ' '}</span>{line || ' '}
      </div>))}
    {file.truncated && <div className="sync-diff-skip">⋯</div>}
  </pre>;
}

/** Shown above an open file that has a sync conflict: red leaves this device, green arrives from the server. */
export default function SyncConflictPanel({ file }: { file: SyncConflictFile }) {
  const [busy, setBusy] = useState(false);
  const choose = async (choice: 'local' | 'remote') => {
    setBusy(true);
    try {
      await resolveSyncConflict(file.path, choice);
      await useStore.getState().loadTree();
    } catch (error) { useStore.getState().notify((error as Error).message, 6000); }
    finally { setBusy(false); }
  };
  return <section className="sync-conflict-panel" aria-label="同步冲突">
    <header className="sync-conflict-title">
      <span className={`sync-conflict-badge is-${file.action}`}>{actionLabels[file.action]}</span>
      <span className="sync-conflict-toggle">同步冲突</span>
      <button className="btn secondary" disabled={busy} onClick={() => void choose('local')}>保留本机</button>
      <button className="btn" disabled={busy} onClick={() => void choose('remote')}>采用服务器</button>
    </header>
    {file.image && <Preview file={file} />}
    {file.text && <Diff file={file} />}
  </section>;
}
