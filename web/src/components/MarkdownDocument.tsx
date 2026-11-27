import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useStore, viewModeFor, type ViewMode } from '../lib/store';
import type { Extension } from '@codemirror/state';
import { useDocumentSession } from '../lib/useDocumentSession';
import { createVaultRenderContext } from '../lib/vaultRenderContext';
import { getActiveNavigationId, registerEditor } from '../lib/activeEditor';
import { bindPluginEditor } from '../lib/plugins';
import { manualSave, bindTimestampUpdates } from '../lib/writing/format';
import MarkdownView from './MarkdownView';
import { analyzeMarkdown, fragmentRange, equationContext } from '@shale/markdown-core';
import { nativeReviewExtension, reviewExtension } from '../lib/review/view';
import { syncReviewSource } from '../lib/review/sync';
import { propertyTypesSnapshot, subscribePropertyTypes } from '../lib/propertyTypes';
import type { LinkIntent } from '../lib/fragmentNavigation';
import { BacklinksPanel, OutgoingPanel } from './NoteLinks';
import type { EditorProps } from './Editor';

interface MarkdownDocumentProps extends Omit<EditorProps, 'path' | 'navigationId'> {
  path: string;
  navigationId: string;
  transient?: boolean;
  mode?: ViewMode;
  changeMode?: (mode: ViewMode) => void;
  renameTitle?: (value: string) => Promise<void>;
  extensions?: Extension[];
  configuration?: boolean;
}

/** Bind one real document session to a Markdown view in any container. */
export function MarkdownDocument({ path, reading = false, embedded = false, fragment, navigationId, tabId,
  onOpenLink, onReady, active, transient = false, mode: modeOverride, changeMode, renameTitle, extensions,
  configuration = false }: MarkdownDocumentProps) {
  const mode = useStore(s => modeOverride ?? viewModeFor(s, navigationId, tabId));
  const setMode = changeMode ?? ((value: ViewMode) => useStore.getState().setViewMode(value, navigationId, tabId));
  const aggregate = transient || configuration;
  const workspaceOpenLink = useStore((s) => s.openWikilink);
  const openLink = onOpenLink ?? workspaceOpenLink;
  const openMenu = useStore((s) => s.openContextMenu);
  const setLeftPanel = useStore((s) => s.setLeftPanel);
  const notify = useStore((s) => s.notify);
  const files = useStore((s) => s.filePaths);
  const propertyTypes = useSyncExternalStore(subscribePropertyTypes, propertyTypesSnapshot);
  const { session, snapshot, error } = useDocumentSession(path, transient);
  const editorExtensions = useMemo(() => [
    ...(extensions ?? []),
    ...(!configuration && !embedded && !fragment ? [nativeReviewExtension(path), reviewExtension(path, syncReviewSource)] : []),
  ], [extensions, configuration, path, embedded, fragment]);
  useEffect(() => session && !configuration && !reading && mode !== 'reading' ? bindTimestampUpdates(session, notify) : undefined,
    [session, configuration, reading, mode, notify]);
  const [editorView, setEditorView] = useState<import('@codemirror/view').EditorView | null>(null);
  useLayoutEffect(() => {
    if (!active || !editorView) return;
    editorView.requestMeasure();
    if (!reading && navigationId === getActiveNavigationId()) editorView.focus();
  }, [active, editorView, navigationId, reading]);
  useEffect(() => {
    if (!editorView || !session) return;
    const stopEditor = registerEditor(editorView, { undo: () => session.undo(), redo: () => session.redo() });
    const stopPlugins = configuration ? undefined : bindPluginEditor(editorView, path);
    return () => { stopPlugins?.(); stopEditor(); };
  }, [editorView, session, path, configuration]);
  const context = useMemo(() => ({ ...createVaultRenderContext(path ?? '', {
    bindEditor: registerEditor, openLink: (target, sourcePath, intent) => { void openLink(target, sourcePath ?? path ?? undefined, intent); }, openMenu, reportError: notify,
    files: () => [...files],
  }), navigationId, recordNavigation: useStore.getState().recordNavigation,
    renameTitle: !configuration && !embedded && !fragment && session && !snapshot.locked && /\.(md|markdown)$/i.test(session.id)
      ? renameTitle ?? (async (value: string) => {
        const title = value.trim();
        if (!title || title === '.' || title === '..' || /[\/#<>:"\\|?*\u0000-\u001f]/.test(title) || /[. ]$/.test(title))
          throw new Error('请输入有效的笔记标题，不能包含 #、斜杠或文件名保留字符');
        const from = session.id, slash = from.lastIndexOf('/');
        const extension = from.slice(from.lastIndexOf('.'));
        await useStore.getState().renamePath(from, from.slice(0, slash + 1) + title + extension);
      }) : undefined,
  }), [path, openLink, openMenu, files, propertyTypes, notify, navigationId, configuration, embedded, fragment, session, snapshot.locked, renameTitle]);
  const numberedContext = useMemo(() => {
    const model = session?.analysis;
    if (!model) return context;
    const from = fragment ? fragmentRange(model, fragment)?.from ?? 0 : 0;
    return { ...context, sourceFragment: !!fragment, equations: equationContext(model, from), mathSource: { model, from } };
  }, [context, session, snapshot.version, fragment]);
  if (error) return <div className="editor-error" role="alert">{error.message}</div>;
  if (!session) return <div className="editor-loading" role="status" data-virtual-loading={aggregate || undefined}>加载中…</div>;
  const analysis = session.analysis;
  const range = fragment ? fragmentRange(analysis, fragment) : null;
  if (fragment && !range) return <div className="editor-error">未找到章节或块</div>;
  const displayed = range ? { ...snapshot, text: snapshot.text.slice(range.from, range.to), raw: snapshot.text.slice(range.from, range.to) } : snapshot;
  const view = <MarkdownView snapshot={displayed} documentSession={session} analysis={range ? fragmentAnalysis(analysis, range.from, range.to) : analysis} mode={reading ? 'reading' : mode} context={numberedContext}
    footer={!aggregate && !embedded && !fragment && /\.(md|markdown)$/i.test(session.id)
      ? <div className="note-footer-body"><BacklinksPanel path={session.id} /><OutgoingPanel path={session.id} /></div> : undefined}
    extensions={editorExtensions}
    autoFocus={!aggregate && active === undefined && !reading} showTitle={!embedded && !configuration} layout={embedded || transient ? 'embedded' : 'page'}
    onChange={(changes, version, origin, model, history) => { session.edit(version, changes, origin, history); session.acceptAnalysis(model); return session.snapshot; }}
    onUndo={() => { session.undo(); return session.snapshot; }}
    onRedo={() => { session.redo(); return session.snapshot; }}
    onSave={() => { if (!reading) void (configuration ? session.save() : manualSave(session.id)).catch((cause) => notify(cause.message)); }}
    onModeChange={reading || configuration ? undefined : setMode}
    onSearch={() => setLeftPanel('search')}
    onReady={(view) => {
      setEditorView(view);
      onReady?.(view);
    }} />;
  return aggregate ? <div className={configuration ? 'virtual-configuration-editor' : 'virtual-text-source'}
    data-virtual-loading={editorView ? undefined : true}>
    {snapshot.conflict && <p role="alert">此文件存在外部修改冲突，请处理后保存。</p>}
    {view}
  </div> : view;
}

const fragments = new WeakMap<ReturnType<typeof analyzeMarkdown>, Map<string, ReturnType<typeof analyzeMarkdown>>>();
function fragmentAnalysis(model: ReturnType<typeof analyzeMarkdown>, from: number, to: number) {
  let cache = fragments.get(model);
  if (!cache) { cache = new Map(); fragments.set(model, cache); }
  const key = `${from}:${to}`;
  let result = cache.get(key);
  if (!result) { result = analyzeMarkdown(model.text.slice(from, to), model.id, model.version); cache.set(key, result); }
  return result;
}
