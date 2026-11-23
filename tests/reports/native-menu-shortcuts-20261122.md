# Native menu shortcuts — 2026-11-22

PRD 1.54, desktop 0.1.84. All app-owned menu accelerators are explicitly empty;
role-based selectors for commands are removed and clicks go through the shared
command catalog. 23 desktop maintenance/window/clipboard/speech actions start
unassigned and are available in the same synchronized shortcut settings.

- TypeScript core/server/web/desktop and production build passed.
- 110 files / 628 full unit tests passed; additional 3 native-action tests passed,
  covering save-before-reload, failure preservation and no assigned defaults.
- 11 keyboard/platform Chromium cases passed.
- Fixed Mac certificate and identifier confirmed certificate leaf; deep/strict passed.
- Personal STEM via existing hotkey API: move retains only Ctrl+M; Mac settings
  PhysicalCtrl+backtick. No global/system keyboard preferences changed.
- Packaged native-shortcut test passed: menu has zero accelerators; Command R/M/Q
  run user actions; undo, sidebar and redo preserve the intended history; physical
  Control-backtick opens settings. Reload starts unassigned, then a binding entered
  through settings saves documents/layout and actually reloads. Unknown IPC actions reject.
- Existing packaged hotkeys and complete WebViewer regressions passed sequentially.
- Shared reload/exit persistence tests: 31 passed.
- Windows build, publication and Mac daily replacement pending.
