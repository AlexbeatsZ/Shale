# Vim cursor colors — 2026-11-22

## Behavior

PRD 1.56, desktop 0.1.86, runtime source
`3c1bf700aab6a40cc7b474c9c63aec7906c297b4`.

The fixed pink engine cursor is replaced with the ordinary editor text color.
Light themes use gray/black; dark themes follow their light text color. Normal
and Visual blocks have a translucent fill and a clear outline; text under the
block stays legible. Insert uses the same color for the ordinary thin cursor.
Unfocused blocks keep the outline without a fill.

Settings > Editor > Vim provides light/dark color pickers with independent reset
buttons. Empty values follow the theme. Color updates preserve the engine,
current mode, selection, source history and input-method lease. Preferences use
the existing UI settings API and persistence; no extra configuration service.

## Completed checks

- core/server/web/desktop TypeScript and production build passed.
- 112 unit files / 640 tests passed.
- Seven Chromium Vim regressions passed from a clean service after core build.
  Includes both themes, default/custom/reset colors, Insert/Visual, unchanged
  selection and input-method request count on color updates, undo and blur.
- Mac arm64 final 0.1.86 package passed actual settings picker writes, API
  persistence/readback, theme switching in Insert, both reset buttons, default
  block/caret colors, Normal/Insert/Visual behavior, remembered English,
  Chinese/English source restoration, rapid transitions, u/Ctrl-r, :w and disable.
  The initial macOS input source was restored. This run inspected native source
  states and synthetic text insertion, without OS-injected composition keys.
- Full packaged desktop WebViewer regression passed: launcher, side tabs,
  stable sidebar expansion, isolation/navigation, userscript import/update,
  permission review, layout persistence and normal quit.
- Windows x64 NSIS built on OMEN with existing MSVC 2026 and Electron 33.4.11.
  FileVersion=0.1.86, ProductVersion=0.1.86.0. Session1 final-package test passed
  the same color picker/persistence/reset and existing Vim/input-method checks;
  initial Microsoft Pinyin open/conversion state was restored. No Windows daily
  installation was changed.
- Mac app/helper fixed certificate `Local Development Code Signing`, identifiers
  `com.xnohat.webobsidian` / `com.xnohat.webobsidian.input-method`, requirements
  containing `certificate leaf`, and deep/strict verification passed.
- With explicit user authorization, `/Applications/Shale.app` was upgraded from
  0.1.85 to 0.1.86 and launched. Installed signature and healthz passed; the
  temporary old application backup was removed. Read-only live UI settings:
  obsidian-dark, Vim enabled, both cursor overrides empty (following theme).

## Test harness corrections

Color rows expose both a named group and a named input; select the textbox role
instead of ambiguous getByLabel. Wait for the async file result before pressing
Enter in quick open. Native acceptance explicitly activates the disposable app;
a run interrupted by another foreground application was discarded and a clean
standalone run passed. CodeMirror draws its caret and deliberately hides the
browser caret: verify the drawn .cm-cursor border, not native caret-color.

## Delivery

Mac arm64 DMG/ZIP/blockmap/latest-mac and Windows x64 NSIS/blockmap/latest built.
Published as latest v0.1.86, Release ID `455080351`, target source
`3c1bf700aab6a40cc7b474c9c63aec7906c297b4`. Exactly seven uploaded assets were
checked against the build output by name, size and uploaded state before publication.
Windows assets are retained at OMEN
`C:\Users\Meta\Project\Workspaces\meta-obsidian\desktop\release\0.1.86`;
the temporary source/archive and previous local release were cleaned after upload.
Screenshots on Mac: `/tmp/.agents/shale-vim-cursor/screenshots/`.
Android was not rebuilt or installed in this desktop Vim follow-up.
