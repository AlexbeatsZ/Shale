# Isolated JavaScript charts and OpenAI controls

## Scope and cause

The supplied script assigns `host = container` and then uses an undeclared
`root`. In the original application realm, the browser resolves that name to
the application's `id="root"` element. Assigning its innerHTML destroys the
visible application. The owner explicitly replaced the old trusted-script
requirement with an embedded-visualization boundary.

Dedicated fence names also lacked a JavaScript language alias. Explicit source
expansion skipped both the fenced line styles and the code block wrapper.

## Implementation

- Reuse CodeMirror's JavaScript loader and existing fenced decorations.
- Execute note source inside opaque-origin `allow-scripts` frames with a private
  MessageChannel and an independently bundled IIFE. Parent DOM, Node, native
  bridges, storage and direct fetch/XHR/WebSocket calls are unavailable.
- Reuse the local access middleware for opaque API denial, with one fixed public
  runtime asset exception and a matching CORP header. Reject local documents
  requested as iframes. WebSocket origin checks keep their original boundary.
- Expose watch, non-executing Markdown rendering and five existing read-only
  widgets. Folder-tag configuration uses the existing data-only parser.
- Keep Android host messages source-bound and desktop preload main-frame-only.
- Bundle OpenAI Apps SDK UI 0.2.2 Slider, Button, Switch and SegmentedControl.
  Their CSS and Tailwind foundations remain inside the isolated frame. ECharts
  uses official tokens and setTheme, retaining explicitly supplied chart colors.
- Preserve Ctrl+O/P selector entry points while a chart owns focus, through two
  explicitly allowed read-only commands.

## Verification

- Full unit suite passed 560 tests in 99 files under project-local Node 22.23.4.
- Focused browser suite passed 28 tests across JavaScript widgets, processor
  transitions, source syntax, script lifetime and native host ports.
- Web, server and desktop TypeScript checks passed. Production renderer/server
  build, standalone bundle check and complete packaged-startup regression passed.
- Real Electron 33.4.11, using a disposable Vault/profile and trusted native
  plugins enabled, rejected the original script locally. The corrected full
  canvas example drew successfully and accepted l=4. The documented OpenAI
  effective-potential example responded to its slider and reset button.
- The same native run confirmed app/process/require/desktop/nativeRequire are
  undefined inside the frame, parent DOM access raises SecurityError, fetch is
  blocked and opaque API requests receive HTTP 403. Public runtime CORP is
  cross-origin. Frame-focused Ctrl+O still opens the native selector.

Native evidence is in
`/var/folders/td/w919x1754kb93qf72km7vffh0000gn/T/.agents/javascript-native-UO9olR/evidence`.
The final ad-hoc-signed Mac arm64 app reports version 0.1.69 and passed the same
native regression. Its evidence is in
`/var/folders/td/w919x1754kb93qf72km7vffh0000gn/T/.agents/javascript-native-0YZeOH/evidence`.
Build/test logs are in `/tmp/.agents/webobsidian-widgets-20261114`.

## Delivery

Version 0.1.69, Android code 69. Mac arm64 and both non-debuggable Android
variants have been built. Windows packaging and release publication are in
progress. Daily-device installation and Android foreground acceptance remain
pending.

Both Android variants report versionCode 69/versionName 0.1.69 and have no
application-debuggable flag. Their signing certificates match the previous
phone/tablet deliveries. Sizes are 135655611 and 135655619 bytes respectively.

## Boundaries

The official public UI source establishes the reused controls and tokens.
ChatGPT's internal curve renderer remains unconfirmed. Scripts which depend on
the old app object or application globals require migration. Infinite loops and
excessive allocation can still affect renderer responsiveness.
