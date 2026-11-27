import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import Icon from './Icon';
import DocumentTabIndicator from './DocumentTabIndicator';
import { toggleTabSelection } from '../lib/tabMenu';
import { groupColorValue, groupDescription } from '../lib/tabGroups';
import { sidebarFilePath, sidebarTabKey, tabSide } from '../lib/workspaceTabs';
import { isTabMultiselect, openWorkspaceTabMenu } from '../lib/workspaceTabMenu';
import { SIDEBAR_TAB_DRAG_TYPE, TAB_INSERT_DWELL_MS, TAB_TOUCH_LIFT_MS } from '../lib/tabDrag';
import { useIsMobile } from '../lib/useIsMobile';

interface DropTarget { key: string | null; mode: 'swap' | 'before' }

export default function SidebarTabRail({ side }: { side: 'left' | 'right' }) {
  const allTabs = useStore(s => s.rightTabs);
  const activeId = useStore(s => side === 'left' ? s.leftActiveId : s.rightActiveId);
  const tabs = allTabs.filter(tab => tabSide(tab) === side);
  const label = side === 'left' ? '左侧' : '右侧';
  const show = useStore(s => s.showTab);
  const close = useStore(s => s.closeTab);
  const selected = useStore(s => s.selectedTabs);
  const mobile = useIsMobile();
  const rail = useRef<HTMLDivElement>(null);
  const dragged = useRef<string>(), target = useRef<DropTarget>(), dwell = useRef<number>();
  const touchCleanup = useRef<() => void>(), suppressClick = useRef(false);
  const [hint, setHint] = useState<DropTarget>();
  const update = (value?: DropTarget) => { target.current = value; setHint(value); };
  const finish = (apply: boolean) => {
    window.clearTimeout(dwell.current);
    const from = dragged.current, to = target.current;
    dragged.current = undefined;
    update();
    if (apply && from && to) useStore.getState().arrangeSidebarTabs(side, from, to.key, to.mode);
  };
  useEffect(() => () => { window.clearTimeout(dwell.current); touchCleanup.current?.(); }, []);
  const track = (element: Element | null) => {
    if (!dragged.current || !rail.current?.contains(element)) return;
    const key = element?.closest<HTMLElement>('[data-tab-id]')?.dataset.tabId ?? null;
    if (key === dragged.current) {
      window.clearTimeout(dwell.current); update(); return;
    }
    if (target.current?.key === key) return;
    window.clearTimeout(dwell.current);
    update({ key, mode: key === null ? 'before' : 'swap' });
    if (key !== null) dwell.current = window.setTimeout(() => update({ key, mode: 'before' }), TAB_INSERT_DWELL_MS);
  };
  const touchStart = (event: React.PointerEvent<HTMLButtonElement>, key: string) => {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    touchCleanup.current?.();
    const button = event.currentTarget, { pointerId, clientX, clientY } = event;
    let lifted = false, moved = false;
    const lift = window.setTimeout(() => { lifted = true; dragged.current = key; }, TAB_TOUCH_LIFT_MS);
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      if (!lifted) {
        if (Math.hypot(next.clientX - clientX, next.clientY - clientY) > 8) cleanup();
        return;
      }
      if (Math.hypot(next.clientX - clientX, next.clientY - clientY) > 6) moved = true;
      if (!moved) return;
      next.preventDefault();
      track(document.elementFromPoint(next.clientX, next.clientY));
    };
    const end = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      cleanup();
      if (!lifted) return;
      const released = next.type === 'pointerup';
      finish(released && moved && !!rail.current?.contains(document.elementFromPoint(next.clientX, next.clientY)));
      suppressClick.current = true;
      if (released && !moved) openWorkspaceTabMenu({ clientX, clientY, currentTarget: button, nativeEvent: next }, key, [], [], mobile);
      window.setTimeout(() => { suppressClick.current = false; }, 0);
    };
    const cleanup = () => {
      window.clearTimeout(lift);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      touchCleanup.current = undefined;
    };
    touchCleanup.current = cleanup;
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  return <>
    <div className="ribbon-divider" />
    <button title="主页" aria-label={`新建${label}标签页`} onClick={() => void useStore.getState().openSidebarTab(side, 'empty')}><Icon name="plus" size={18} /></button>
    <div ref={rail} className="ribbon-tabs" role="tablist" aria-label={`${label}标签页`} aria-orientation="vertical"
      onDragEnter={event => { if (dragged.current && event.dataTransfer.types.includes(SIDEBAR_TAB_DRAG_TYPE)) event.preventDefault(); }}
      onDragOver={event => {
        if (!dragged.current || !event.dataTransfer.types.includes(SIDEBAR_TAB_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        track(event.target as Element);
      }} onDrop={event => {
        if (!dragged.current || !event.dataTransfer.types.includes(SIDEBAR_TAB_DRAG_TYPE)) return;
        event.preventDefault(); event.stopPropagation(); finish(true);
      }}>
      {tabs.map((tab, index) => {
        const key = sidebarTabKey(tab);
        return <button key={key} data-tab-id={key} data-tab-group={tab.groupColor} role="tab" aria-selected={activeId === tab.id}
          title={[tab.title, groupDescription(tabs, tab)].filter(Boolean).join(' · ')}
          style={{ ['--tab-group-color' as string]: groupColorValue(tab) }}
          aria-label={tab.title} className={`${activeId === tab.id ? 'active' : ''}${selected.includes(key) ? ' is-multiselected' : ''}${hint?.key === key ? ' is-drop-' + hint.mode : ''}`}
          draggable onDragStart={event => {
            dragged.current = key; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(SIDEBAR_TAB_DRAG_TYPE, key);
          }} onDragEnd={() => finish(false)} onPointerDown={event => touchStart(event, key)}
          onClick={event => {
            if (suppressClick.current) { suppressClick.current = false; return; }
            if (isTabMultiselect(event)) toggleTabSelection(key);
            else { useStore.getState().setSelectedTabs([]); void show(key); }
          }}
          onAuxClick={event => { if (event.button === 1) { event.preventDefault(); void close(key); } }}
          onKeyDown={event => {
            if (event.key === 'Delete') { event.preventDefault(); void close(key); }
            if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : tabs.length - 1)) % tabs.length;
              const nextKey = sidebarTabKey(tabs[next]);
              void show(nextKey);
              rail.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(nextKey)}"]`)?.focus();
            }
          }}
          onContextMenu={event => {
            event.preventDefault(); event.stopPropagation(); openWorkspaceTabMenu(event, key, [], [], mobile);
          }}><Icon name={tab.icon} size={18} /><span className="ribbon-tab-number">{index + 1}</span><DocumentTabIndicator path={sidebarFilePath(tab)} /></button>;
      })}
      {tabs.length > 0 && <div aria-hidden="true" className={`ribbon-tab-drop-end${hint?.key === null ? ' is-drop-before' : ''}`} />}
    </div>
  </>;
}
