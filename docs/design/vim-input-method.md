# Native Vim and input methods

## Requirement (2026-11-22, PRD 1.55)

The owner requested native Vim with a bundled im-select equivalent: Normal mode
uses English; Insert mode restores the input method used before leaving Insert.
This supersedes the earlier exclusion of Vim/automatic input-method switching in
native-writing.md. Vim defaults off; input-method automation defaults on when
Vim is enabled. Settings > Editor owns both options and an optional English source.

## Ownership

Use @replit/codemirror-vim, not a second editor. MarkdownView owns the extension,
mode events and its lifetime. DocumentSession still owns undo, redo, source edits
and persistence; Vim u, Ctrl-r and :w use existing document history/save actions.
Native snippets and editing shortcuts run in Insert only. Reading views are not
Vim editors. Application commands/search textboxes and WebViewer guests are separate contexts.
Vim’s own command-line panel retains English so :w and other Ex commands work.

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
