import { useSyncExternalStore } from 'react';
import type { PdfSession } from './session';
import { useStore } from '../store';

const sessions: PdfSession[] = [];
const listeners = new Set<() => void>();
let active: PdfSession | null = null;
const notify = () => { for (const listener of listeners) listener(); };
export function activatePdfSession(session: PdfSession) {
  if (!sessions.includes(session) || session.getSnapshot().status === 'destroyed' || active === session) return;
  active = session; notify();
}
export function registerPdfSession(session: PdfSession) {
  const readDark = () => session.setDark(useStore.getState().pdfDarkPaths.includes(session.path));
  readDark();
  const stopStore = useStore.subscribe(readDark);
  const stopSession = session.subscribe(() => {
    if (session.getSnapshot().status !== 'destroyed') useStore.getState().setPdfDark(session.path, session.getSnapshot().dark);
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
