import { EditorSelection } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { isAndroid } from './platform';

/**
 * A touch long-press selects the word under the finger in the DOM before the
 * contextmenu event. If the editor was not focused, CodeMirror ignores that DOM
 * selection, so menu actions would act on the old caret (often off-screen).
 * Adopt the selection that is visibly highlighted; fall back to the press point.
 */
export function adoptTouchSelection(view: EditorView, x: number, y: number): void {
  const press = view.posAtCoords({ x, y });
  const main = view.state.selection.main;
  if (!main.empty && press != null && press >= main.from && press <= main.to) return;
  let range: ReturnType<typeof EditorSelection.range> | undefined;
  const selection = view.contentDOM.ownerDocument.getSelection();
  if (selection?.anchorNode && selection.focusNode && view.contentDOM.contains(selection.anchorNode) && view.contentDOM.contains(selection.focusNode)) {
    try {
      const anchor = view.posAtDOM(selection.anchorNode, selection.anchorOffset);
      const head = view.posAtDOM(selection.focusNode, selection.focusOffset);
      if (press == null || (press >= Math.min(anchor, head) && press <= Math.max(anchor, head))) range = EditorSelection.range(anchor, head);
    } catch { /* DOM outside a mapped line (widgets) */ }
  }
  if (!range && press != null) range = EditorSelection.cursor(press);
  if (range && !(range.anchor === main.anchor && range.head === main.head))
    view.dispatch({ selection: range, userEvent: 'select.pointer' });
}

/**
 * When the Android soft keyboard shrinks the WebView, Chromium scrolls the
 * focused editable into view. For a CodeMirror document that native scroll
 * can move the wrong way into unmeasured lines; CodeMirror then re-measures and
 * the visible text jumps while the caret ends up hidden behind the keyboard.
 * Undo that browser scroll before CodeMirror reacts (capture phase), then
 * reveal the caret with CodeMirror's own minimal scroll.
 */
const KEYBOARD_REVEAL_MARGIN = 32;
const USER_SCROLL_GRACE = 400;

class SoftKeyboardScroll {
  private width: number;
  private height: number;
  private top: number;
  private pending = false;
  private userAt = 0;
  private readonly win: Window;
  constructor(private readonly view: EditorView) {
    this.win = view.dom.ownerDocument.defaultView ?? window;
    this.width = this.win.innerWidth;
    this.height = this.win.innerHeight;
    this.top = view.scrollDOM.scrollTop;
    this.win.addEventListener('resize', this.resize);
    view.dom.ownerDocument.addEventListener('scroll', this.scroll, true);
    for (const type of ['touchmove', 'wheel', 'keydown'] as const) view.scrollDOM.addEventListener(type, this.user, { capture: true, passive: true });
  }
  private readonly user = () => { this.userAt = performance.now(); };
  private shrunk(): boolean {
    return this.win.innerWidth === this.width && this.win.innerHeight < this.height;
  }
  private readonly scroll = (event: Event) => {
    if (event.target !== this.view.scrollDOM) return;
    const scroller = this.view.scrollDOM;
    if (isAndroid() && this.view.hasFocus && performance.now() - this.userAt > USER_SCROLL_GRACE && (this.pending || this.shrunk())) {
      if (Math.abs(scroller.scrollTop - this.top) > 1) scroller.scrollTop = this.top;
      this.schedule();
      return;
    }
    if (!this.pending) this.top = scroller.scrollTop;
  };
  private readonly resize = () => {
    if (isAndroid() && this.view.hasFocus && this.shrunk()) this.schedule();
    else if (!this.pending) { this.width = this.win.innerWidth; this.height = this.win.innerHeight; }
  };
  private schedule() {
    if (this.pending) return;
    this.pending = true;
    // Two frames: the resized layout and Chromium's follow-up scroll have landed.
    this.win.requestAnimationFrame(() => this.win.requestAnimationFrame(() => {
      this.pending = false;
      this.width = this.win.innerWidth;
      this.height = this.win.innerHeight;
      if (!this.view.dom.isConnected || !this.view.hasFocus) return;
      this.view.dispatch({ effects: EditorView.scrollIntoView(this.view.state.selection.main.head, { y: 'nearest', yMargin: KEYBOARD_REVEAL_MARGIN }) });
    }));
  }
  destroy() {
    this.win.removeEventListener('resize', this.resize);
    this.view.dom.ownerDocument.removeEventListener('scroll', this.scroll, true);
    for (const type of ['touchmove', 'wheel', 'keydown'] as const) this.view.scrollDOM.removeEventListener(type, this.user, { capture: true });
  }
}

export const softKeyboardScroll = ViewPlugin.fromClass(SoftKeyboardScroll);
