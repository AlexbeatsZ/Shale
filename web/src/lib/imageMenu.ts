import { imageAt, imagePropertyDefinitions, rewriteImageAttribute, type ImageEmbed } from '@webobsidian/markdown-core';
import type { EditorView } from '@codemirror/view';
import { contextOf } from './renderContext';
import { sourceOf } from './syntaxModel';
import type { RenderMenuItem } from './renderContext';
import { customEmbedProperties } from './embedProperties';
import { promptInput } from './obsidian/ui';

const choiceLabels: Record<string, string> = { left: '左对齐', center: '居中', right: '右对齐', contain: '完整显示', cover: '填充裁切' };

/** Resolve the clicked instance through the owning editor, including projected source fragments. */
export function imageMenuItems(view: EditorView, wrap: HTMLElement, sourcePosition?: number): RenderMenuItem[] | undefined {
  let position = sourcePosition;
  if (position === undefined) {
    try { position = view.posAtDOM(wrap); } catch { return; }
  }
  const captured = view.state, source = sourceOf(captured), image = imageAt(source.model, source.from + position);
  if (!image?.aliasRange) return;
  const context = contextOf(view);
  const assertCurrent = () => {
    if (!view.dom.isConnected || view.state !== captured || view.state.readOnly) throw new Error('文档或选区已改变，请重新打开图片菜单');
  };
  const apply = (name: string, value: string | number | boolean | undefined) => {
    assertCurrent();
    const edit = rewriteImageAttribute(source.model, image.from, name, value);
    if (edit.from < source.from || edit.to > source.from + view.state.doc.length) throw new Error('图片超出当前编辑范围');
    view.dispatch({ changes: { ...edit, from: edit.from - source.from, to: edit.to - source.from }, userEvent: 'input.image-property' });
  };
  const perform = (action: () => void | Promise<void>) => () => {
    void Promise.resolve().then(action).catch(error => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) context.reportError?.(String(error));
    });
  };
  const items = imagePropertyDefinitions.map(definition => {
    const current = image.parameters.attributes[definition.name];
    const base: RenderMenuItem = { id: 'image:property:' + definition.name, label: `${definition.label} (${definition.name})`,
      disabled: view.state.readOnly, checked: current !== undefined };
    if (definition.type === 'boolean') return { ...base, onClick: perform(() => apply(definition.name, current === undefined ? true : undefined)) };
    if (definition.type === 'enum') return { ...base, submenu: [
      ...definition.choices!.map(choice => ({ id: `${base.id}:${choice}`, label: choiceLabels[choice] ?? choice,
        checked: current === choice, onClick: perform(() => apply(definition.name, choice)) })),
      { id: `${base.id}:remove`, label: '移除属性', disabled: current === undefined, onClick: perform(() => apply(definition.name, undefined)) },
    ] };
    return { ...base, onClick: perform(async () => {
      const value = await promptInput(undefined, `${definition.label} (${definition.name})，留空移除`, current === true || current === undefined ? '' : String(current));
      apply(definition.name, value.trim() || undefined);
    }) };
  });
  for (const name of customEmbedProperties()) {
    if (imagePropertyDefinitions.some(definition => definition.name === name)) continue;
    const current = image.parameters.attributes[name];
    items.push({ id: 'image:property:' + name, label: name, checked: current !== undefined,
      disabled: view.state.readOnly, onClick: perform(() => apply(name, current === undefined ? true : undefined)) });
  }
  return [{ id: 'image:properties', label: '添加属性', icon: 'plus', submenu: items },
    { id: 'image:copy-embed', label: '复制图片嵌入', icon: 'clipboard', onClick: perform(() => navigator.clipboard.writeText(source.model.text.slice(image.from, image.to))) },
    { id: 'image:copy-link', label: '复制图片引用', icon: 'link', onClick: perform(() => navigator.clipboard.writeText(`[[${image.target}]]`)) }];
}

export function imageSourceEdit(view: EditorView, wrap: HTMLElement, name: string, value: string | number | boolean | undefined): void {
  if (view.state.readOnly) return;
  let position: number;
  try { position = view.posAtDOM(wrap); } catch { return; }
  const source = sourceOf(view.state), image: ImageEmbed | undefined = imageAt(source.model, source.from + position);
  if (!image) return;
  const edit = rewriteImageAttribute(source.model, image.from, name, value);
  view.dispatch({ changes: { ...edit, from: edit.from - source.from, to: edit.to - source.from }, userEvent: 'input.image-property' });
}
