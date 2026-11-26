import { useEffect, useState } from 'react';
import { request } from '../lib/api';
import { useStore } from '../lib/store';
import { runFileSync } from '../lib/syncConflicts';
import type { FileSyncStatus } from '../../../server/src/contracts/fileSync';
import Icon from './Icon';

function syncLabel(status: FileSyncStatus, busy: boolean) {
  if (busy) return '同步中';
  if (status.phase === 'conflict') return `${status.conflictCount} 个冲突`;
  if (status.phase === 'error') return status.pendingOutgoing ? `待发送 ${status.pendingOutgoing}` : '同步失败';
  if (status.pendingIncoming) return `待接收 ${status.pendingIncoming}`;
  if (status.pendingOutgoing) return `待发送 ${status.pendingOutgoing}`;
  if (status.phase === 'recovery') return '等待恢复';
  if ((status.queuedThrough ?? 0) < (status.seen ?? 0)) return '待继续同步';
  return status.lastSuccess ? '已同步' : '等待首次同步';
}

/** One-click native sync in the status bar, like VS Code's synchronize button. */
export default function NativeSyncButton() {
  const [status, setStatus] = useState<FileSyncStatus | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    let active = true;
    void request<{ status: FileSyncStatus }>('/api/file-sync').then(value => { if (active) setStatus(value.status); }).catch(() => {});
    const update = (event: Event) => {
      active = false; // A live transition supersedes the initial request.
      setStatus((event as CustomEvent<FileSyncStatus>).detail);
    };
    window.addEventListener('file-sync-status', update);
    return () => { active = false; window.removeEventListener('file-sync-status', update); };
  }, []);
  if (!status?.enabled) return null;
  const busy = running || status.phase === 'syncing';
  const label = syncLabel(status, busy);
  const icon = status.phase === 'conflict' ? 'triangle-alert' : status.phase === 'error' ? 'cloud-off' : 'refresh-cw';
  const sync = async () => {
    setRunning(true);
    try { const next = await runFileSync(); setStatus(next as FileSyncStatus); await useStore.getState().loadTree(); }
    catch (error) { useStore.getState().notify((error as Error).message, 6000); }
    finally { setRunning(false); }
  };
  return <button type="button" className={`clickable native-sync-button is-${status.phase}`} disabled={busy} onClick={() => void sync()}
    title={[status.message, status.lastProgress && `最近进展 ${new Date(status.lastProgress).toLocaleString()}`,
      status.lastSuccess && `上次完整同步 ${new Date(status.lastSuccess).toLocaleString()}`].filter(Boolean).join('\n') || '立即同步'}>
    <Icon name={icon} size={13} className={busy ? 'icon-spin' : undefined} />{label}
  </button>;
}
