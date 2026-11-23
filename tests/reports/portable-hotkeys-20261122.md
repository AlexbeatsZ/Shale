# Portable hotkeys and BodyHeading commands — 2026-11-22

Scope: PRD 1.53; desktop 0.1.83, temporary Vaults/profiles only.

- `npm run typecheck` and desktop TypeScript passed; final production build passed.
- Full Vitest: 110 files, 626 tests passed. Additional real file-sync round trip passed
  in the 16-case fileSyncEngine suite, exercising `.obsidian/webobsidian/hotkeys.jsonc`
  through the actual local synchronization server and two clients.
- Chromium: 11 keyboard/platform-settings cases passed, including Command selection,
  clipboard, shared history, native document navigation, independent Windows/Mac edits,
  disabled inheritance, refresh/reload and physical Control retention after incoming changes.
  Four command-palette cases passed with the actual Command label.
- Heading 7 exists in the native catalog and legacy alias map, inserts `####### `, and
  converts back to H2 or a plain paragraph. Code/formula/YAML exclusions remain owned
  by the existing editor operation; promotion/demotion remains limited to H1–H6.
- First Mac Electron 33 packaged run passed primary open/save/shared undo/redo,
  BodyHeading creation and Command+W closing only the tab. It exposed existing
  BodyHeading exclusion in the cancel/ordinary-heading operation, now fixed and
  covered in Chromium. Final packaged repeat pending.
- Complete desktop WebViewer packaged regression passed, including import/update,
  guest isolation, three launchers/side tabs, layout restore and normal quit.
- Mac fixed `Local Development Code Signing`/identifier com.xnohat.webobsidian verified
  with `codesign -d -r-` (`certificate leaf`) and deep/strict verification.
- Windows package build and release publication pending. No Android package or
  real Windows/Android keyboard interaction has been accepted by this task.
