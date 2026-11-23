# Native Vim and bundled input-method acceptance — 2026-11-22

## Delivered behavior

Settings > Editor exposes Vim (off by default), automatic input-method switching
(on when Vim is enabled) and an English source picker. The helper is bundled;
no global installation or input-method configuration changes are required.
Normal/Visual uses English; Insert restores the last source. Text input outside
the editor releases the English lease. Native Vim Ex input retains English.
Vim u/Ctrl-r, ciw insertion groups, dot repeat, snippets and :w share native
source/history/save ownership. Reading views do not run Vim.

## Checks completed

- core/server/web/desktop TypeScript and production builds passed.
- 112 unit files / 640 tests passed. This includes input-method serialization,
  Chinese/English snapshot restore, stale split releases, app foreground gates,
  retry after failure, close restore, local-main-frame IPC rejection and the
  existing lifecycle/persistence tests.
- 14 Chromium regressions passed: 5 Vim tests, 8 personal LaTeX snippet tests and
  the portable hotkey settings test. Covers hot enable/disable, Normal motions,
  Visual/Insert, shared undo/redo, ciw+insert one-step undo, dot repeat, snippet
  gating, blur release and rapid mode requests.
- Mac packaged 0.1.85: real native source IDs switched between
  `com.meta.keylayout.ABCNoOption` and `im.rime.inputmethod.Squirrel.Hans`.
  Normal->Insert restored Chinese; English used in Insert stayed English;
  rapid transitions, u/Ctrl-r, :w disk save and disable restore passed.
  The original ABC No Option source was restored after each run.
- Mac packaged settings controls enable Vim and retain default automatic switching.
  Optional OS CGEvent injection passed through Squirrel and committed `你好`,
  proving actual composition after restore in addition to source-ID inspection.
  These are system-injected events; physical keyboard testing remains user acceptance.
- Mac full packaged WebViewer regression passed after final native-host changes:
  launcher/sidebar tabs, stable expansion, guest isolation/navigation, userscript
  import/update/permission review, layout restoration and normal quit.
- Mac app and helper signatures pass deep/strict; both use the fixed
  `Local Development Code Signing` certificate, `certificate leaf` requirements,
  app ID `com.xnohat.webobsidian` and helper ID
  `com.xnohat.webobsidian.input-method`.
- OMEN Windows x64 NSIS 0.1.85 built with existing MSVC 2026 and Electron 33.4.11;
  executable versions checked as 0.1.85 / 0.1.85.0.
- OMEN Session1 packaged test passed: English `4090409`, Microsoft Pinyin
  `8040804`; Pinyin open=true / conversion=1 restored after Insert. Normal,
  remembered English, rapid transitions, u/Ctrl-r, :w, settings UI and disable
  restore passed. Optional Windows SendInput events went through Microsoft Pinyin
  and committed `你好`. Initial Pinyin state restored after test.

## Boundaries

The tests used disposable Vaults/profiles, with no reads/writes to the user's
live Vault. No daily installation has been replaced. Android/Linux retain the
shared Vim implementation but do not advertise system input-method automation.
The Windows fallback for systems with no English layout closes the existing
IME; that configuration is not the OMEN layout tested here. Third-party IMEs and
physical-keyboard candidate/Esc behavior still need device-specific acceptance.
macOS CJK activation adapts macism's runtime-resolved TSM path; unsupported OS
symbols or native switching failure is reported to the user, with no temporary
focus window or synthetic-key fallback.
