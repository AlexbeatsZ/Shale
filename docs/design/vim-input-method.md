# Native Vim and input methods

## Requirement (2026-11-22, PRD 1.55)

The owner requested native Vim with a bundled im-select equivalent: Normal mode
uses English; Insert mode restores the input method used before leaving Insert.
This supersedes the earlier exclusion of Vim/automatic input-method switching in
native-writing.md. Vim defaults off; input-method automation defaults on when
Vim is enabled. Settings > Editor owns both options and an optional English source.

## Ownership

PRD1.67: workspace-scoped group commands receive the configured physical Control+Shift+Z/X in Normal/Visual/Insert. The command manager checks scope after resolving user overrides; other Vim editing keys and editor-only scopes retain their previous behavior.

Use @replit/codemirror-vim, not a second editor. MarkdownView owns the extension,
mode events and its lifetime. DocumentSession still owns undo, redo, source edits
and persistence; Vim u, Ctrl-r and :w use existing document history/save actions.
Native snippets and editing shortcuts run in Insert only. Reading views are not
Vim editors. Application commands/search textboxes and WebViewer guests are separate contexts.
Vim’s own command-line panel retains English so :w and other Ex commands work.

Clipboard acceptance (2026-11-25): test both enabled and disabled Vim against
WebViewer input/textarea/contenteditable and the host address bar. Vim does not
own these fields. Native edit fallback must preserve Vim's Control combinations
in Normal/Visual on Windows and shared document undo/redo. Test macOS OS events
as well as CDP; successful CDP paste does not prove physical Command+V works.

## Cursor appearance (PRD 1.56)

The default Vim cursor uses the ordinary editor's `--text-normal` color: gray/black
in light themes and a light color in dark themes. Do not use the engine's fixed
cursor palette. Settings > Editor > Vim exposes independent light/dark color
pickers and reset buttons. Empty values follow the theme, and explicit values are
opaque six-digit hex colors stored in the existing UI settings. The same color
owns the Normal/Visual block and Insert caret. The block uses a translucent fill
with a visible outline so text underneath stays legible; the unfocused block
retains its outline. Color updates must not reconfigure the engine or acquire a
new input-method lease, reset modes, change selection, or edit document source.
Disabling Vim restores ordinary cursor styling. Theme changes apply immediately.

## Native selection restoration (PRD 1.59, 2026-11-24)

The pre-Vim baseline is 0.1.84 / 8651466. `editorSelection` owns the
browser-native primary caret/range and decorated secondary ranges. Do not install
`drawSelection` from the Vim host: it hides native selection even when Vim is off
and paints rectangles behind opaque callouts instead of selected text. Vim already
owns its Normal/Visual block cursor. Insert uses the native thin caret, with
optional Vim colors inherited through caret-color. Override the engine's native
selection suppression with the existing --text-selection background, including
nested syntax spans; selection must not paint an extra rectangle behind blocks.
File tree active/multiselected colors remain their pre-Vim theme variables.
Vim color changes preserve the engine/mode/history/IME lease. On deployment the
owner explicitly requested restoring defaults on every reachable daily device.

## Input-method contract

- Snapshot on leaving Insert, then force English for Normal/Visual/Replace-normal.
  Re-entering Insert restores the snapshot including English if that was used.
- Only a focused app editor owns the lease. Blur, unmount, disabling Vim or a
  settings dialog restores the lease before releasing it. Focus in Normal
  re-acquires English; background views cannot switch the active app's input.
- Serialize capture/switch/restore in the main process. Reject stale owners and
  invalid requests; guard the local main frame and native foreground window.
  Do not change another app after focus moves. Keep the snapshot until restoration
  succeeds, and report a failure instead of silently claiming a successful switch.
- Native source IDs stay local. An empty English source auto-detects an enabled
  English layout, including custom layouts. No keyboard/input method is installed
  or enabled, and no keyboard shortcut, registry or system configuration is changed.
- IME composition is respected: Esc can cancel candidates before Vim receives
  the actual exit key. Mode changes, rather than an Esc-only listener, drive switching.

## Native helpers

Helpers are compiled from source during desktop build and packaged as resources.
macOS uses Text Input Source Services and adapts the focused-app TSM switch from
laishulu/macism (MIT; pinned source and attribution in desktop/native). It avoids
activating temporary windows. Windows uses foreground/focused HWND validation,
keyboard-layout switching and IME open/conversion state, without simulated keys.
A switch is bounded and checked. Linux/Android retain Vim but do not claim native
input-method automation. macOS binaries use the fixed Local Development Code
Signing certificate and stable identifiers.

## Verification

Cover modes, Chinese/English restoration, rapid transitions, split/focus ownership,
blur, disable/unmount, IME composition, shared history, snippets, :w, default-off
settings and persistence. Native acceptance uses disposable Vaults/profiles,
restores the initial OS input source and serializes keyboard/focus tests. Preserve
and run desktop WebViewer regression after host changes.

## 撤销分组（PRD 1.63）

原先同一次 Insert 的修改不设时限合并，长时间写作会一次撤回过多。改为与普通键入一致的约 500ms 停顿分界，插入期间单独移动光标、失去焦点也开始新组；Esc 后的下一次编辑保持独立。Normal 编辑命令仍原子化，cw 的删除和紧接输入、原生片段展开继续在同一组，点号重复与共享 DocumentSession 历史保留。
