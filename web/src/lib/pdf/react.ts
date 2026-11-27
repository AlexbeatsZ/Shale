import { useEffect, useState, useSyncExternalStore } from 'react';
import { PdfSession } from './session';
import { getVirtualReading, useVirtualReading } from '../virtualReading';
import { useStore } from '../store';
import { pdfDarkPreference } from './preferences';

const sessions: PdfSession[] = [];
const listeners = new Set<() => void>();
let active: PdfSession | null = null;
const notify = () => { for (const listener of listeners) listener(); };
export function activatePdfSession(session: PdfSession) {
  if (!sessions.includes(session) || session.getSnapshot().status === 'destroyed' || active === session) return;
  active = session; notify();
}
export function registerPdfSession(session: PdfSession) {
  let applyingPreference = false;
  const readDark = () => {
    applyingPreference = true;
    try { session.setDark(pdfDarkPreference(session.path, useStore.getState().pdfDarkOverrides)); }
    finally { applyingPreference = false; }
  };
  readDark();
  let dark = session.getSnapshot().dark;
  const stopStore = useStore.subscribe(readDark);
  const stopSession = session.subscribe(() => {
    const snapshot = session.getSnapshot();
    if (snapshot.status === 'destroyed' || snapshot.dark === dark) return;
    dark = snapshot.dark;
    if (!applyingPreference) useStore.getState().setPdfDark(session.path, dark);
  });
  sessions.push(session); active = session; notify();
  return () => {
    const index = sessions.indexOf(session);
    if (index === -1) return;
    stopStore(); stopSession();
    sessions.splice(index, 1);
    if (active === session) active = sessions.findLast(candidate => candidate.getSnapshot().status !== 'destroyed') ?? null;
    notify();
  };
}
export const getActivePdfSession = () => active;
export const getPdfSession = (path: string | null, viewId: string) => sessions.find(session =>
  session.viewId === viewId && session.path === path && session.getSnapshot().status !== 'destroyed') ?? null;
export const getMainPdfSession = (path: string | null) => getPdfSession(path, 'main');
export function subscribeActivePdfSession(listener: () => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function useActivePdfSession() { return useSyncExternalStore(subscribeActivePdfSession, getActivePdfSession); }
export function useMainPdfSession(path: string | null) {
  return useSyncExternalStore(subscribeActivePdfSession, () => getMainPdfSession(path));
}
export function usePdfSession(path: string | null, viewId: string) {
  return useSyncExternalStore(subscribeActivePdfSession, () => getPdfSession(path, viewId));
}
export function usePdfSnapshot(session: PdfSession) { return useSyncExternalStore(session.subscribe, session.getSnapshot); }

/** One lifetime for readers and virtual chapters, including vault invalidation. */
export function usePagedSession(path: string, viewId: string) {
  const stale = useStore(state => state.vaultSessionStale);
  const [session, setSession] = useState<PdfSession>();
  useEffect(() => {
    if (stale) return;
    const current = new PdfSession(path, viewId);
    setSession(current);
    const unregister = registerPdfSession(current);
    const invalidate = () => { unregister(); current.destroy(); };
    window.addEventListener('vault-identity-invalidated', invalidate);
    return () => { window.removeEventListener('vault-identity-invalidated', invalidate); invalidate(); };
  }, [path, viewId, stale]);
  return !stale && session?.path === path && session.viewId === viewId ? session : undefined;
}

export function currentPdfFor(path: string | null, viewId: string) {
  const direct = getPdfSession(path, viewId);
  if (direct) return direct;
  const reading = getVirtualReading(path, viewId)?.getSnapshot();
  return reading ? getPdfSession(reading.activeSource ?? null, 'virtual:' + viewId) : null;
}

export function useCurrentPdf(path: string | null, viewId: string) {
  const reader = useVirtualReading(path, viewId);
  const reading = useSyncExternalStore(reader?.subscribe ?? noopSubscribe, reader?.getSnapshot ?? emptyReading);
  return usePdfSession(reader ? reading?.activeSource ?? null : path, reader ? 'virtual:' + viewId : viewId);
}

const noopSubscribe = () => () => {};
const emptyReading = () => undefined;
