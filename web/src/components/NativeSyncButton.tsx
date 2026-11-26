import { useEffect, useState } from 'react';
import { request } from '../lib/api';
import { useStore } from '../lib/store';
import { runFileSync } from '../lib/syncConflicts';
import type { FileSyncStatus } from '../../../server/src/contracts/fileSync';
import Icon from './Icon';

/** One-click native sync in the status bar, like VS Code's synchronize button. */
export default function NativeSyncButton() {
  const [status, setStatus] = useState<FileSyncStatus | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    let active = true;
    void request<{ status: FileSyncStatus }>('/api/file-sync').then(value => { if (active) setStatus(value.status); }).catch(() => {});
    const update = (event: Event) => setStatus((event as CustomEvent<FileSyncStatus>).detail);
    window.addEventListener('file-sync-status', update);
    return () => { active = false; window.removeEventListener('file-sync-status', update); };
  }, []);
  if (!status?.enabled) return null;
  const busy = running || status.phase === 'syncing';
  const label = busy ? '同步中' : status.phase === 'conflict' ? `${status.conflictCount} 个冲突`
    : status.phase === 'recovery' ? `待接收 ${status.pendingIncoming ?? 0}`
      : status.phase === 'error' ? status.pendingOutgoing ? `待发送 ${status.pendingOutgoing}` : '同步失败' : '已同步';
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
