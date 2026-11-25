import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { subscribeWriting, writingCMSettings, ensureWriting } from './config';
import { latexSuiteConfig } from './latex/snippets/codemirror/config';
import { mathBoundsPlugin } from './latex/editor_context/mathbounds';
import { contextPlugin } from './latex/editor_context/context';
import {
  keyboardEventPlugin,
  onInput,
  snippetStateField,
  handleKeydown,
} from './latex/latex_suite';
import { snippetExtensions } from './latex/snippets/codemirror/extensions';
import { notice } from './latex/editor_extensions/shale_utils';
import {
  colorPairedBracketsPluginLowestPrec,
  highlightCursorBracketsExtension,
} from './latex/editor_extensions/highlight_brackets';
import { highlight_dollar_extension } from './latex/editor_extensions/highlight_dollar';
import { mkConcealPlugin } from './latex/editor_extensions/conceal';
import { contextOf } from '../renderContext';

export function nativeWritingExtensions() {
  const config = new Compartment(),
    visuals = new Compartment();
  const display = () => {
    const c = writingCMSettings();
    return [
      c.colorPairedBracketsEnabled ? colorPairedBracketsPluginLowestPrec : [],
      c.highlightCursorBracketsEnabled ? highlightCursorBracketsExtension : [],
      c.highlightDollarEnabled ? highlight_dollar_extension : [],
      c.concealEnabled ? mkConcealPlugin() : [],
    ];
  };
  const lifecycle = ViewPlugin.fromClass(
    class {
      private alive = true;
      private stop: () => void;
      constructor(readonly view: EditorView) {
        this.stop = subscribeWriting(() =>
          queueMicrotask(() => {
            if (this.alive)
              view.dispatch({
                effects: [
                  config.reconfigure(latexSuiteConfig.of(writingCMSettings())),
                  visuals.reconfigure(display()),
                ],
              });
          }),
        );
        void ensureWriting().catch((error) => contextOf(view).reportError?.(String(error)));
      }
      destroy() {
        this.alive = false;
        this.stop();
      }
    },
  );
  return [
    config.of(latexSuiteConfig.of(writingCMSettings())),
    mathBoundsPlugin,
    contextPlugin,
    notice,
    EditorState.allowMultipleSelections.of(true),
    Prec.high(keyboardEventPlugin),
    Prec.high(EditorView.inputHandler.of(onInput)),
    Prec.high(snippetStateField),
    snippetExtensions,
    visuals.of(display()),
    lifecycle,
    EditorView.domEventHandlers({
      compositionend(_event, view) {
        const config = writingCMSettings();
        if (config.suppressSnippetTriggerOnIME && !config.snippetIMEVersion) return false;
        setTimeout(() => {
          if (view.dom.isConnected && !view.composing && !view.state.readOnly)
            handleKeydown('', false, false, view);
        }, 0);
        return false;
      },

    }),
  ];
}
