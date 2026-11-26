import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), getUiState: vi.fn(), putUiState: vi.fn(), mutations: 0, navigation: 'main' }));
vi.mock('./api', () => ({ api: { read: host.read, write: host.write, getUiState: host.getUiState, putUiState: host.putUiState }, pendingMutations: () => host.mutations }));
vi.mock('./tags/folderSession', async () => ({ WorkspaceDocumentSession: (await import('@shale/markdown-core')).DocumentSession }));
vi.mock('./writing/format', () => ({ manualSave: vi.fn() }));
vi.mock('./fragmentNavigation', () => ({ navigateTo: vi.fn(), captureLocation: vi.fn(), cancelNavigation: vi.fn() }));
vi.mock('./activeEditor', () => ({ getActiveEditor: () => null, getActiveNavigationId: () => host.navigation, activateNavigation: (id: string) => { host.navigation = id; } }));
vi.mock('./renderContext', () => ({ contextOf: vi.fn() }));

let workspace: typeof import('./store');
let documents: typeof import('./documents')['documents'];

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('document', { querySelectorAll: () => [] });
  host.read.mockReset().mockResolvedValue({ content: 'original', revision: 'base', vault: 'fixture' });
  host.write.mockReset().mockResolvedValue({ revision: 'saved' });
  host.getUiState.mockReset().mockResolvedValue({});
  host.putUiState.mockReset().mockResolvedValue({ ok: true });
  host.mutations = 0;
  host.navigation = 'main';
  workspace = await import('./store');
  documents = (await import('./documents')).documents;
});

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('workspace persistence acknowledgements', () => {
  it('restores duplicate identities and group order, persists them and drops transient selection', async () => {
    const tabs = [{ path: 'A.md', title: 'A', groupColor: 'blue', groupOrder: 1 },
      { id: 'tab:copy', path: 'A.md', title: 'A', groupColor: 'blue', groupOrder: 0 }];
    host.getUiState.mockResolvedValue({ tabs, activePath: 'A.md', activeTabId: 'tab:copy', selectedTabs: ['A.md'] });
    await workspace.useStore.getState().loadUiState();
    expect(workspace.useStore.getState().activeTabId).toBe('tab:copy');
    expect(workspace.useStore.getState().tabs).toEqual(tabs);
    expect(workspace.useStore.getState().selectedTabs).toEqual([]);
    workspace.useStore.getState().setSelectedTabs(['tab:copy']);
    workspace.useStore.getState().setTabGroup(['tab:copy'], 'red');
    await workspace.flushWorkspaceState();
    expect(host.putUiState.mock.calls.at(-1)?.[0]).toMatchObject({ activeTabId: 'tab:copy', tabs: [tabs[0], { ...tabs[1], groupColor: 'red', groupOrder: 0 }] });
    expect(host.putUiState.mock.calls.at(-1)?.[0]).not.toHaveProperty('selectedTabs');
  });

  it('duplicates a note without copying its content, closes only that view and shares the document session', async () => {
    const s = workspace.useStore.getState();
    await s.openFile('A.md');
    const session = documents.get('A.md');
    await s.duplicateTab('A.md');
    const copy = workspace.useStore.getState().tabs[1];
    expect(copy.path).toBe('A.md'); expect(copy.id).toMatch(/^tab:/);
    expect(workspace.useStore.getState().activeTabId).toBe(copy.id);
    expect(documents.get('A.md')).toBe(session);
    expect(host.write).not.toHaveBeenCalled();
    await s.closeTab(copy.id!);
    expect(workspace.useStore.getState().tabs.map(tab => tab.path)).toEqual(['A.md']);
    expect(documents.get('A.md')).toBe(session);
  });

  it('exchanges two same-file split views by tab identity and closes only the requested pane', async () => {
    const s = workspace.useStore.getState();
    await s.openFile('A.md'); await s.duplicateTab('A.md');
    const copy = workspace.useStore.getState().tabs[1].id!;
    await s.showTab('A.md'); await s.openToSide(copy);
    await s.swapTabs('A.md', copy);
    expect(workspace.useStore.getState()).toMatchObject({ activePath: 'A.md', splitPath: 'A.md', activeTabId: copy, splitTabId: 'A.md' });
    await s.closePane('split');
    expect(workspace.useStore.getState().tabs.map(tab => tab.id ?? tab.path)).toEqual([copy]);
    expect(workspace.useStore.getState().activeTabId).toBe(copy);
  });

  it('displays the next single page and cycles from that page without changing join order', async () => {
    const s = workspace.useStore.getState();
    for (const path of ['A.md', 'B.md', 'C.md']) await s.openFile(path);
    s.setTabGroup(['C.md', 'A.md', 'B.md'], 'blue');
    await s.showTab('A.md');
    for (const [direction, path] of [[1,'B.md'],[1,'C.md'],[1,'A.md'],[-1,'C.md'],[-1,'B.md'],[-1,'A.md']] as const) {
      await s.swapGroupedTab(direction);
      expect(workspace.useStore.getState()).toMatchObject({ activePath: path, activeTabId: path, splitPath: null });
    }
    expect(workspace.useStore.getState().tabs.map(tab => tab.path)).toEqual(['A.md','B.md','C.md']);
  });

  it('replaces the focused pane when the next member is in the other split pane, then keeps cycling in the same pane', async () => {
    const s = workspace.useStore.getState();
    for (const path of ['A.md', 'B.md', 'C.md']) await s.openFile(path);
    s.setTabGroup(['A.md', 'B.md', 'C.md'], 'blue');
    await s.showTab('A.md'); await s.openToSide('B.md');
    host.navigation = 'split';
    await s.swapGroupedTab(-1);
    expect(workspace.useStore.getState()).toMatchObject({ activePath: 'B.md', splitPath: 'A.md' });
    expect(host.navigation).toBe('split');
    await s.swapGroupedTab(-1);
    expect(workspace.useStore.getState()).toMatchObject({ activePath: 'B.md', splitPath: 'C.md' });
    expect(host.navigation).toBe('split');
  });

  it('uses fixed join order and wraps both ways while replacing only the targeted split member', async () => {
    const s = workspace.useStore.getState();
    for (const path of ['A.md', 'B.md', 'C.md', 'D.md']) await s.openFile(path);
    s.setTabGroup(['C.md', 'A.md', 'D.md'], 'blue');
    await s.showTab('A.md'); await s.openToSide('B.md');
    s.arrangeTabs(['D.md'], ['A.md'], 'before');
    await s.swapGroupedTab(1);
    expect(workspace.useStore.getState()).toMatchObject({ activePath: 'D.md', splitPath: 'B.md' });
    await s.swapGroupedTab(1);
    expect(workspace.useStore.getState().activePath).toBe('C.md');
    await s.swapGroupedTab(-1);
    expect(workspace.useStore.getState().activePath).toBe('D.md');
    expect(workspace.useStore.getState().tabs.filter(tab => tab.groupColor).sort((a,b) => a.groupOrder! - b.groupOrder!).map(tab => tab.path)).toEqual(['C.md', 'A.md', 'D.md']);
  });

  it('restores PDF dark properties and persists subsequent changes through the shared workspace state', async () => {
    host.getUiState.mockResolvedValue({ pdfDarkOverrides: { 'paper.pdf': true, broken: 42 } });
    await workspace.useStore.getState().loadUiState();
    expect(workspace.useStore.getState().pdfDarkOverrides).toEqual({ 'paper.pdf': true });
    workspace.useStore.getState().setPdfDark('other.pdf', true);
    workspace.useStore.getState().setPdfDark('paper.pdf', false);
    await workspace.flushWorkspaceState();
    expect(host.putUiState.mock.calls.at(-1)?.[0].pdfDarkOverrides).toEqual({ 'paper.pdf': false, 'other.pdf': true });
  });

  it('retries an unchanged desired snapshot after failure instead of acknowledging the attempt', async () => {
    await workspace.useStore.getState().loadUiState();
    host.putUiState.mockRejectedValueOnce(new Error('HTTP 500'));
    workspace.useStore.getState().toggleBookmark('A.md');
    await expect(workspace.flushWorkspaceState()).rejects.toThrow('HTTP 500');
    expect(workspace.workspaceHasUnsavedChanges()).toBe(true);
    expect(workspace.useStore.getState().toast).toContain('保存失败');
    await vi.advanceTimersByTimeAsync(1000);
    expect(host.putUiState).toHaveBeenCalledTimes(2);
    expect(host.putUiState.mock.calls[1][0]).toEqual(host.putUiState.mock.calls[0][0]);
    expect(workspace.workspaceHasUnsavedChanges()).toBe(false);
  });

  it('keeps at most one PUT active and follows its acknowledgement with the latest layout', async () => {
    await workspace.useStore.getState().loadUiState();
    const gate = deferred<{ ok: true }>();
    host.putUiState.mockReturnValueOnce(gate.promise);
    workspace.useStore.getState().toggleBookmark('A.md');
    const saving = workspace.flushWorkspaceState();
    workspace.useStore.getState().toggleBookmark('B.md');
    expect(host.putUiState).toHaveBeenCalledTimes(1);
    expect(workspace.workspaceHasUnsavedChanges()).toBe(true);
    gate.resolve({ ok: true });
    await saving;
    expect(host.putUiState).toHaveBeenCalledTimes(2);
    expect(host.putUiState.mock.calls[1][0].bookmarks).toEqual(['A.md', 'B.md']);
    expect(workspace.workspaceHasUnsavedChanges()).toBe(false);
  });

  it('bounds automatic retries and allows an explicit same-state retry after exhaustion', async () => {
    await workspace.useStore.getState().loadUiState();
    host.putUiState.mockRejectedValue(new Error('offline'));
    workspace.useStore.getState().toggleBookmark('A.md');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(host.putUiState).toHaveBeenCalledTimes(4);
    expect(workspace.workspaceHasUnsavedChanges()).toBe(true);
    host.putUiState.mockResolvedValue({ ok: true });
    await workspace.flushWorkspaceState();
    expect(workspace.workspaceHasUnsavedChanges()).toBe(false);
  });

  it('does not PUT defaults after an initial GET failure', async () => {
    host.getUiState.mockRejectedValue(new Error('corrupt state'));
    await expect(workspace.useStore.getState().loadUiState()).rejects.toThrow('corrupt state');
    workspace.useStore.getState().toggleBookmark('unsaved.md');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(workspace.flushWorkspaceState()).rejects.toThrow('尚未成功读取');
    expect(host.putUiState).not.toHaveBeenCalled();
    expect(workspace.useStore.getState().bookmarks).toEqual(['unsaved.md']);
  });

  it('does not overwrite a locally pending layout with another client broadcast', async () => {
    await workspace.useStore.getState().loadUiState();
    workspace.useStore.getState().toggleBookmark('local.md');
    await workspace.useStore.getState().applyRemoteState({ bookmarks: ['remote.md'] }, 'another-client');
    expect(workspace.useStore.getState().bookmarks).toEqual(['local.md']);
    await workspace.flushWorkspaceState();
    await workspace.useStore.getState().applyRemoteState({ bookmarks: ['accepted.md'] }, 'another-client');
    expect(workspace.useStore.getState().bookmarks).toEqual(['accepted.md']);
    expect(workspace.workspaceHasUnsavedChanges()).toBe(false);
  });

  it('ignores an older initial GET completing after a newer restore', async () => {
    const older = deferred<Record<string, unknown>>();
    const newer = deferred<Record<string, unknown>>();
    host.getUiState.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const oldLoad = workspace.useStore.getState().loadUiState();
    const newLoad = workspace.useStore.getState().loadUiState();
    newer.resolve({ bookmarks: ['new.md'] });
    await newLoad;
    workspace.useStore.getState().toggleBookmark('local.md');
    older.resolve({ bookmarks: ['old.md'] });
    await oldLoad;
    expect(workspace.useStore.getState().bookmarks).toEqual(['new.md', 'local.md']);
    await workspace.flushWorkspaceState();
    expect(host.putUiState.mock.calls[0][0].bookmarks).toEqual(['new.md', 'local.md']);
  });

  it('keeps the newest remote snapshot when document saves delay earlier broadcasts', async () => {
    await workspace.useStore.getState().loadUiState();
    const session = await documents.open('active.md');
    workspace.useStore.setState({ activePath: 'active.md' });
    await workspace.flushWorkspaceState();
    session.setText('draft');
    const writer = deferred<{ revision: string }>();
    host.write.mockReturnValueOnce(writer.promise);
    const earlier = workspace.useStore.getState().applyRemoteState({ bookmarks: ['earlier.md'] }, 'client-a');
    const later = workspace.useStore.getState().applyRemoteState({ bookmarks: ['later.md'] }, 'client-b');
    writer.resolve({ revision: 'saved' });
    await Promise.all([earlier, later]);
    expect(workspace.useStore.getState().bookmarks).toEqual(['later.md']);
    expect(host.write).toHaveBeenCalledOnce();
  });
});

describe('dirty exit save barrier', () => {
  it('awaits real session writers for every dirty document and then the workspace PUT', async () => {
    await workspace.useStore.getState().loadUiState();
    const first = await documents.open('first.md');
    const second = await documents.open('second.md');
    first.setText('first changed');
    second.setText('second changed');
    const write = deferred<{ revision: string }>();
    const layout = deferred<{ ok: true }>();
    host.write.mockReturnValueOnce(write.promise);
    host.putUiState.mockReturnValueOnce(layout.promise);
    workspace.useStore.getState().toggleBookmark('first.md');
    let completed = false;
    const closing = workspace.saveWorkspaceBeforeExit().then(() => { completed = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(completed).toBe(false);
    expect(host.putUiState).not.toHaveBeenCalled();
    write.resolve({ revision: 'first saved' });
    await vi.advanceTimersByTimeAsync(0);
    expect(host.write).toHaveBeenCalledTimes(2);
    expect(completed).toBe(false);
    layout.resolve({ ok: true });
    await closing;
    expect(completed).toBe(true);
    expect(documents.snapshots().every(snapshot => !snapshot.dirty && !snapshot.saving)).toBe(true);
  });

  it('retains a dirty session on writer failure and can succeed on a later close attempt', async () => {
    await workspace.useStore.getState().loadUiState();
    const session = await documents.open('first.md');
    session.setText('changed');
    host.write.mockRejectedValueOnce(new Error('disk full'));
    await expect(workspace.saveWorkspaceBeforeExit()).rejects.toThrow('disk full');
    expect(session.snapshot.dirty).toBe(true);
    await workspace.saveWorkspaceBeforeExit();
    expect(session.snapshot.dirty).toBe(false);
  });

  it('rejects a conflict and preserves the draft without invoking its writer', async () => {
    await workspace.useStore.getState().loadUiState();
    const session = await documents.open('first.md');
    session.setText('local');
    session.acceptExternal('external', 'external revision');
    await expect(workspace.saveWorkspaceBeforeExit()).rejects.toThrow('冲突');
    expect(session.snapshot.raw).toBe('local');
    expect(host.write).not.toHaveBeenCalled();
  });

  it('cancels closing when an already-saved document changes while another writer is pending', async () => {
    await workspace.useStore.getState().loadUiState();
    const first = await documents.open('first.md');
    const second = await documents.open('second.md');
    first.setText('first change');
    second.setText('second change');
    const gate = deferred<{ revision: string }>();
    host.write.mockResolvedValueOnce({ revision: 'first saved' }).mockReturnValueOnce(gate.promise);
    const closing = workspace.saveWorkspaceBeforeExit();
    await vi.advanceTimersByTimeAsync(0);
    first.setText('edited during close');
    gate.resolve({ revision: 'second saved' });
    await expect(closing).rejects.toThrow('未保存');
    expect(first.snapshot.dirty).toBe(true);
  });

  it('retains the window when writes remain pending', async () => {
    await workspace.useStore.getState().loadUiState();
    host.mutations = 1;
    await expect(workspace.saveWorkspaceBeforeExit()).rejects.toThrow('写入请求');
  });

  it('allows a clean stale window to close but retains its unsaved old-Vault drafts', async () => {
    await workspace.useStore.getState().loadUiState();
    const session = await documents.open('first.md');
    workspace.useStore.setState({ vaultSessionStale: true });
    await workspace.saveWorkspaceBeforeExit();
    session.setText('old Vault draft');
    await expect(workspace.saveWorkspaceBeforeExit()).rejects.toThrow('旧会话');
    expect(host.write).not.toHaveBeenCalled();
    expect(session.snapshot.raw).toBe('old Vault draft');
  });
});
