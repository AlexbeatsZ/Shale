import { useState, type KeyboardEvent } from 'react';
import type { PdfOutlineEntry } from '../lib/pdf/types';
import Icon from './Icon';
import '../styles/virtual-navigation.css';

export interface OutlineNode<T> {
  id: string;
  title: string;
  target?: T;
  children: OutlineNode<T>[];
  page?: number;
  current?: boolean;
  source?: string;
  cover?: boolean;
}

export function markdownOutline<H extends { text: string; level: number }, T>(headings: readonly H[], prefix: string,
  target: (heading: H) => T): OutlineNode<T>[] {
  const roots: OutlineNode<T>[] = [], stack: { node: OutlineNode<T>; level: number }[] = [];
  headings.forEach((heading, index) => {
    const node = { id: prefix + ':' + index, title: heading.text, target: target(heading), children: [] };
    while (stack.length && stack.at(-1)!.level >= heading.level) stack.pop();
    (stack.at(-1)?.node.children ?? roots).push(node);
    stack.push({ node, level: heading.level });
  });
  return roots;
}

export function pagedOutline<T>(entries: readonly PdfOutlineEntry[], prefix: string,
  current: number | undefined, target: (page: number) => T): OutlineNode<T>[] {
  return entries.map((entry, index) => {
    const id = prefix + ':' + index, page = entry.page ?? undefined;
    return { id, page, current: page !== undefined && page === current, title: entry.title || '无标题',
      target: page === undefined ? undefined : target(page), children: pagedOutline(entry.children, id, current, target) };
  });
}

const folds = new WeakMap<object, ReadonlySet<string>>();

export default function OutlineTree<T>({ nodes, label, onNavigate, owner, className = '', heading }: {
  nodes: OutlineNode<T>[]; label: string; onNavigate: (target: T) => void; owner?: object; className?: string; heading?: string;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => (owner && folds.get(owner)) ?? new Set());
  const [selected, setSelected] = useState<string>();
  const toggle = (id: string) => setCollapsed(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    if (owner) folds.set(owner, next);
    return next;
  });
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-outline-id]');
    if (!row) return;
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-outline-id]')];
    const index = rows.indexOf(row);
    const id = row.dataset.outlineId!;
    const canExpand = row.dataset.branch === 'true';
    const parent = row.parentElement?.parentElement?.closest<HTMLElement>('li')?.querySelector<HTMLElement>(':scope > [data-outline-id], :scope > section > [data-outline-id]');
    event.preventDefault();
    let next: HTMLElement | undefined | null;
    switch (event.key) {
      case 'Home': next = rows[0]; break;
      case 'End': next = rows.at(-1); break;
      case 'ArrowDown': next = rows[index + 1]; break;
      case 'ArrowUp': next = rows[index - 1]; break;
      case 'ArrowRight':
        if (canExpand && collapsed.has(id)) toggle(id);
        else if (canExpand) next = rows[index + 1];
        break;
      case 'ArrowLeft':
        if (canExpand && !collapsed.has(id)) toggle(id);
        else next = parent;
        break;
    }
    (next?.querySelector<HTMLElement>('button[data-outline-action]:not(:disabled)') ?? next?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
  };
  const renderNodes = (branches: OutlineNode<T>[]) => <ul>{branches.map(node => {
    const branch = node.children.length > 0, open = branch && !collapsed.has(node.id);
    const row = <div className="outline-tree-row" data-outline-id={node.id} data-branch={branch}>
      {branch ? <button type="button" className="outline-tree-toggle" aria-label={`${open ? '收起' : '展开'} ${node.title}`}
        aria-expanded={open} onClick={() => toggle(node.id)}><Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} /></button>
        : <span className="outline-tree-spacer" />}
      <button type="button" data-outline-action className={node.source || node.cover ? 'outline-item outline-source' : 'outline-item'}
        aria-label={node.title} disabled={node.target === undefined} aria-current={node.current || selected === node.id ? 'location' : undefined}
        title={node.page === undefined ? undefined : `第 ${node.page} 页`} onClick={() => {
          if (node.target !== undefined) { setSelected(node.id); onNavigate(node.target); }
        }}>{node.cover && <Icon name="list" size={14} />}<span>{node.title}</span>{node.page !== undefined && <small>{node.page}</small>}</button>
    </div>;
    const contents = <>{row}{open && renderNodes(node.children)}</>;
    return <li key={node.id}>{node.source ? <section data-outline-source={node.source}>{contents}</section> : contents}</li>;
  })}</ul>;
  return <nav className={`outline-tree sidebar-body ${className}`} aria-label={label} onKeyDown={keyDown}>
    {heading && <div className="nav-header"><span className="nav-title">{heading}</span></div>}
    {renderNodes(nodes)}
  </nav>;
}
