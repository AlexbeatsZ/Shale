/**
 * Ignores trackpad/mouse presses shortly after keyboard input so a resting palm
 * cannot move the caret or steal focus while typing. Touch and pen input,
 * modifier clicks, hover and scrolling are left alone.
 */

const modifierKeys = new Set([
  'Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'Super', 'Hyper',
  'CapsLock', 'Fn', 'FnLock', 'NumLock', 'ScrollLock', 'Symbol', 'SymbolLock',
]);

/** Events that belong to one suppressed press, from pointerdown until the trailing click. */
const gestureEvents = ['mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'dragstart', 'selectstart'] as const;

export function installTypingPointerGuard(target: Window, delay: number): () => void {
  let lastTyping = Number.NEGATIVE_INFINITY;
  let active: number | undefined;
  let release: ReturnType<typeof setTimeout> | undefined;

  const suppress = (event: Event) => {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  };
  const endGesture = () => { clearTimeout(release); release = undefined; active = undefined; };

  const keydown = (event: KeyboardEvent) => {
    // Shortcuts and bare modifiers are not typing; a held modifier marks the next click as deliberate.
    if (event.ctrlKey || event.metaKey || modifierKeys.has(event.key)) return;
    lastTyping = event.timeStamp;
  };
  const pointerdown = (event: PointerEvent) => {
    endGesture();
    if (event.pointerType !== 'mouse' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.timeStamp - lastTyping >= delay) return;
    active = event.pointerId;
    // pointerdown is not cancelled, so mousedown still fires and its default (focus, caret, selection) is prevented there.
    event.stopImmediatePropagation();
  };
  const pointerup = (event: PointerEvent) => {
    if (active === undefined || event.pointerId !== active) return;
    event.stopImmediatePropagation();
    // click, dblclick and the Windows contextmenu follow pointerup within the same input dispatch.
    clearTimeout(release); release = setTimeout(endGesture, 0);
  };
  const gesture = (event: Event) => { if (active !== undefined) suppress(event); };

  const options = { capture: true } as const;
  target.addEventListener('keydown', keydown, options);
  target.addEventListener('pointerdown', pointerdown, options);
  target.addEventListener('pointerup', pointerup, options);
  target.addEventListener('pointercancel', pointerup, options);
  for (const type of gestureEvents) target.addEventListener(type, gesture, options);
  return () => {
    endGesture();
    target.removeEventListener('keydown', keydown, options);
    target.removeEventListener('pointerdown', pointerdown, options);
    target.removeEventListener('pointerup', pointerup, options);
    target.removeEventListener('pointercancel', pointerup, options);
    for (const type of gestureEvents) target.removeEventListener(type, gesture, options);
  };
}
