# Typing pointer guard

## Requirement (2026-11-21)

The owner types and uses the trackpad heavily on the same laptop. A resting palm
often taps the trackpad while typing, which moves the caret or steals focus.
Toggling the trackpad by hand is too tedious. Settings › Interface therefore offers
"打字时忽略触控板点击" (default off) and an ignore duration of 100–3000 ms
(default 1000 ms), persisted as `ui.typingPointerGuard` / `ui.typingPointerGuardMs`
in the existing UI settings contract.

## Behaviour

- `web/src/lib/typingPointerGuard.ts` is installed on `window` by `App` only while the
  option is on; off means no listeners at all.
- Any keydown without Ctrl/⌘ that is not a bare modifier starts the window. IME
  composition keys count as typing; shortcuts and modifier-only presses do not.
- A `pointerdown` with `pointerType === 'mouse'` inside the window starts a suppressed
  gesture. pointerdown/up are stopped in capture; mousedown is cancelled so Chromium
  does not move focus, caret or start selection/drag; mouseup, click, dblclick,
  auxclick, contextmenu, dragstart and selectstart of that gesture are cancelled and
  stopped. The gesture ends one macrotask after pointerup/pointercancel.
- pointerdown itself is not cancelled: cancelling it would drop compatibility mouse
  events while leaving focus/selection defaults in place.
- Clicks holding Shift/Ctrl/Option/⌘, touch and pen input, hover/pointer movement and
  wheel/two-finger scrolling are never blocked. A real mouse cannot be told apart from a
  trackpad in the DOM, so mouse clicks inside the window are ignored too.

## Limits

Only events reaching the application document are seen. Typing or clicking inside the
WebViewer's guest page or isolated iframes (JavaScript widgets) neither starts nor
consumes the window. For system-wide behaviour on Windows use Settings › Touchpad ›
Taps › Touchpad sensitivity; macOS has no equivalent system toggle.

## Verification

`web/src/lib/typingPointerGuard.test.ts` covers the event contract;
`tests/browser/typing-pointer-guard.spec.ts` checks the real Chromium caret/focus and
modifier-click behaviour; `tests/browser/appearance.spec.ts` covers the Interface
controls, validation and persistence.
