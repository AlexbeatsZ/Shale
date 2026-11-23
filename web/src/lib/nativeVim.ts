import { Compartment, Prec, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { CodeMirror, Vim, getCM, vim } from '@replit/codemirror-vim';
import { contextOf } from './renderContext';
import { ensureVimSettings, subscribeVimSettings, vimSettings } from './vimSettings';
import { nativeVimStates, vimAllowsInsert } from './vimState';

interface Actions { undo(): boolean; redo(): boolean; save(): void }
const actions = new WeakMap<CodeMirror, Actions>();
const originalUndo = CodeMirror.commands.undo, originalRedo = CodeMirror.commands.redo;
CodeMirror.commands.undo = cm => { const action = actions.get(cm); if (action) action.undo(); else originalUndo(cm); };
CodeMirror.commands.redo = cm => { const action = actions.get(cm); if (action) action.redo(); else originalRedo(cm); };
Vim.defineEx('write', 'w', cm => { actions.get(cm as CodeMirror)?.save(); });

/** The engine and native host share only mode/focus events; source history stays native. */
export function nativeVimExtensions(commands: Actions): Extension {
  const engine = new Compartment();
  const extension = (view?: EditorView) => vimSettings().vimEnabled && !view?.state.readOnly ? Prec.high(vim({ status: true })) : [];
  return [drawSelection(), engine.of([]), ViewPlugin.fromClass(class {
    private alive = true;
    private enabled = false;
    private key = '';
    private cm: CodeMirror | null = null;
    private stop: () => void;
    private owner = `vim:${crypto.randomUUID()}`;
    private lastError = '';
    private pending = 0;
    constructor(readonly view: EditorView) {
      this.stop = subscribeVimSettings(() => this.configure());
      view.dom.addEventListener('focusin', this.focus);
      view.dom.addEventListener('focusout', this.blur);
      view.contentDOM.addEventListener('keydown', this.keydown, true);
      window.addEventListener('focus', this.focus);
      window.addEventListener('blur', this.blur);
      this.configure(); void ensureVimSettings();
    }
    private configure() {
      queueMicrotask(() => {
        if (!this.alive) return;
        const settings = vimSettings(), enabled = settings.vimEnabled && !this.view.state.readOnly;
        // Appearance changes must preserve the engine, selection and IME lease.
        for (const [property, color] of [['--vim-cursor-light', settings.vimCursorLight], ['--vim-cursor-dark', settings.vimCursorDark]]) {
          if (enabled && color) this.view.dom.style.setProperty(property, color);
          else this.view.dom.style.removeProperty(property);
        }
        const key = JSON.stringify([enabled, settings.vimInputMethod, settings.vimEnglishSource]);
        if (this.key === key) return;
        this.key = key;
        if (enabled !== this.enabled) {
          this.detach(); this.enabled = enabled;
          this.view.dispatch({ effects: engine.reconfigure(enabled ? extension(this.view) : []) });
          if (enabled) this.attach();
        } else if (enabled) this.sync();
      });
    }
    private attach() {
      const cm = this.cm = getCM(this.view);
      if (!cm) return;
      actions.set(cm, commands);
      nativeVimStates.set(this.view, { owner: this.owner, mode: 'normal', group: 0 });
      cm.on('vim-mode-change', this.mode);
      cm.on('vim-command-done', this.done);
      this.renderMode('normal'); this.sync();
    }
    private detach() {
      if (this.cm) {
        this.cm.off('vim-mode-change', this.mode); this.cm.off('vim-command-done', this.done);
        actions.delete(this.cm); this.cm = null;
      }
      nativeVimStates.delete(this.view);
      delete this.view.dom.dataset.vimMode;
      this.send('release');
    }
    private renderMode(mode: string) { this.view.dom.dataset.vimMode = mode; }
    private mode = (event: { mode: string }) => {
      const state = nativeVimStates.get(this.view);
      if (!state) return;
      const wasInsert = vimAllowsInsert(this.view);
      state.mode = event.mode; this.renderMode(event.mode);
      if (wasInsert && !vimAllowsInsert(this.view)) state.group++;
      this.sync();
    };
    private done = () => {
      const state = nativeVimStates.get(this.view);
      if (state && !vimAllowsInsert(this.view)) state.group++;
    };
    private keydown = (event: KeyboardEvent) => {
      const state = nativeVimStates.get(this.view);
      if (state && !vimAllowsInsert(this.view) && !event.isComposing && !event.repeat && !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
        // Each Normal command starts its own native undo group. Insert keeps the
        // group begun by i/a/c/o for the whole insertion, including snippet edits.
        if (!this.cm?.state.vim?.inputState?.keyBuffer?.length) state.group++;
      }
    };
    private ownsFocus() {
      const active = document.activeElement;
      return document.hasFocus() && (this.view.hasFocus ||
        (active instanceof Element && this.view.dom.contains(active) && !!active.closest('.cm-vim-panel')));
    }
    private focus = () => { if (this.alive && this.enabled && this.ownsFocus()) this.sync(); };
    private blur = () => { queueMicrotask(() => { if (!this.ownsFocus()) this.send('release'); }); };
    private sync() {
      if (!this.alive || !this.enabled || !this.ownsFocus()) return;
      const mode = vimSettings().vimInputMethod ? (vimAllowsInsert(this.view) ? 'insert' : 'normal') : 'release';
      this.send(mode);
    }
    private send(mode: 'normal' | 'insert' | 'release') {
      const bridge = window.webobsidianDesktop?.inputMethod;
      if (!bridge?.supported) return;
      const request = bridge.update({ owner: this.owner, mode, englishSource: vimSettings().vimEnglishSource });
      this.pending++;
      this.view.dom.dataset.vimInputPending = 'true';
      void request.then(() => { this.lastError = ''; }, error => {
        const message = `Vim 输入法：${String(error)}`;
        if (this.alive && message !== this.lastError) contextOf(this.view).reportError?.(message);
        this.lastError = message;
      }).finally(() => { if (--this.pending === 0 && this.alive) delete this.view.dom.dataset.vimInputPending; });
    }
    update(update: ViewUpdate) { if (update.startState.readOnly !== update.state.readOnly) this.configure(); }
    destroy() {
      this.alive = false; this.stop(); this.detach();
      this.view.dom.removeEventListener('focusin', this.focus);
      this.view.dom.removeEventListener('focusout', this.blur);
      this.view.contentDOM.removeEventListener('keydown', this.keydown, true);
      window.removeEventListener('focus', this.focus); window.removeEventListener('blur', this.blur);
    }
  })];
}
