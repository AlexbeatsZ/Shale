import { useEffect, useState, useSyncExternalStore } from 'react';
import { extractMetadata } from '@shale/markdown-core';
import { documents } from '../lib/documents';
import type { ReadingTarget, VirtualReadingSession } from '../lib/virtualReading';
import { usePdfSession } from '../lib/pdf/react';
import OutlineTree, { markdownOutline, pagedOutline, type OutlineNode } from './OutlineTree';

const noopSubscribe = () => () => {};

export default function VirtualOutlinePanel({ reader }: { reader: VirtualReadingSession }) {
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot);
  const stream = reader.document.streams.find(stream => stream.title === state.stream)!;
  const [, refresh] = useState(0);
  const pdf = usePdfSession(state.activeSource ?? null, 'virtual:' + reader.viewId);
  const page = useSyncExternalStore(pdf?.subscribe ?? noopSubscribe, () => pdf?.getSnapshot().currentPage);
  useEffect(() => documents.subscribe(snapshot => {
    if (stream.files.some(file => file.path === snapshot.id)) refresh(value => value + 1);
  }), [stream]);
  if (state.configuration) return null;
  const nodes: OutlineNode<ReadingTarget>[] = [{
    id: 'cover', title: '目录', cover: true, current: !state.activeSource, target: { path: reader.document.path }, children: [],
  }, ...stream.files.map(source => {
    const session = documents.get(source.path);
    const headings = session ? extractMetadata(session.analysis).headings : source.headings;
    const entries = state.pdfOutlines[source.path];
    const current = state.activeSource === source.path;
    return { id: 'source:' + source.path, title: source.title, source: source.path, current, target: { path: source.path },
      children: entries ? pagedOutline(entries, source.path, current ? page : undefined, page => ({ path: source.path, page }))
        : markdownOutline(headings, source.path, heading => ({ path: source.path, fragment: heading.text })) };
  })];
  return <OutlineTree key={reader.progressKey} owner={reader} label="连续文档大纲" nodes={nodes} onNavigate={reader.go} />;
}
