import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ save: vi.fn(), action: vi.fn() }));
vi.mock('./store', () => ({ saveWorkspaceBeforeExit: state.save }));
vi.mock('./activeEditor', () => ({ getActiveEditor: () => null }));
import { desktopActionCommands, runDesktopAction } from './desktopActions';
beforeEach(() => {
  state.save.mockReset(); state.action.mockReset();
  vi.stubGlobal('window', { shaleDesktop: { platform: 'darwin', runAction: state.action } });
});
afterEach(() => vi.unstubAllGlobals());
it('waits for document and workspace persistence before reloading', async () => {
  let release!: () => void;
  state.save.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  const pending = runDesktopAction('app:reload');
  expect(state.action).not.toHaveBeenCalled(); release(); await pending;
  expect(state.action).toHaveBeenCalledWith('app:reload');
});
it('preserves the renderer when the shared persistence gate fails', async () => {
  state.save.mockRejectedValueOnce(new Error('disk failure'));
  await expect(runDesktopAction('app:force-reload')).rejects.toThrow('disk failure');
  expect(state.action).not.toHaveBeenCalled();
});
it('keeps every desktop menu action unassigned in the shortcut catalog', () => {
  expect(desktopActionCommands.length).toBeGreaterThan(15);
  for (const command of desktopActionCommands) expect(command.hotkeys).toEqual([]);
});
