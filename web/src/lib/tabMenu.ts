import { useStore, type ContextMenuItem } from './store';
import { TAB_GROUP_COLORS, type TabGrouping } from './tabGroups';

/** Shared actions for all three strips. A context click outside the selection targets only that tab. */
export function tabMenuItems(key: string, members: { key: string; tab: TabGrouping }[]): ContextMenuItem[] {
  const s = useStore.getState();
  const keys = s.selectedTabs.includes(key) ? s.selectedTabs.filter(id => members.some(member => member.key === id)) : [key];
  if (!s.selectedTabs.includes(key)) s.setSelectedTabs([]);
  const selected = members.filter(member => keys.includes(member.key));
  return [
    { id: 'tab:duplicate', label: '复制标签页', icon: 'copy', onClick: () => void useStore.getState().duplicateTab(key).catch(error => s.notify(String(error))) },
    { id: 'tab:group', label: keys.length > 1 ? `设置分组（${keys.length} 个标签页）` : '设置分组', icon: 'palette', submenu: [
      ...TAB_GROUP_COLORS.map(color => ({ id: `tab:group:${color.id}`, label: color.label,
        checked: selected.length > 0 && selected.every(member => member.tab.groupColor === color.id),
        onClick: () => useStore.getState().setTabGroup(keys, color.id) })),
      { label: '', separator: true },
      { id: 'tab:group:none', label: '移出分组', checked: selected.every(member => !member.tab.groupColor), onClick: () => useStore.getState().setTabGroup(keys, null) },
    ] },
  ];
}

export function toggleTabSelection(key: string): void {
  const s = useStore.getState();
  s.setSelectedTabs(s.selectedTabs.includes(key) ? s.selectedTabs.filter(id => id !== key) : [...s.selectedTabs, key]);
}
