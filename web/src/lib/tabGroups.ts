export const TAB_GROUP_COLORS = [
  { id: 'red', label: '红色', color: '#e45b65' },
  { id: 'orange', label: '橙色', color: '#e58b43' },
  { id: 'yellow', label: '黄色', color: '#c9a62f' },
  { id: 'green', label: '绿色', color: '#4fa876' },
  { id: 'blue', label: '蓝色', color: '#548edc' },
  { id: 'purple', label: '紫色', color: '#a078d2' },
  { id: 'pink', label: '粉色', color: '#d778b0' },
] as const;
export type TabGroupColor = typeof TAB_GROUP_COLORS[number]['id'];
export interface TabGrouping { groupColor?: TabGroupColor; groupOrder?: number }

export function restoreTabGrouping(value: TabGrouping): TabGrouping {
  return TAB_GROUP_COLORS.some(color => color.id === value.groupColor) && Number.isSafeInteger(value.groupOrder) && value.groupOrder! >= 0
    ? { groupColor: value.groupColor, groupOrder: value.groupOrder } : {};
}

/** Selection order is addition order. Reapplying the same color keeps existing positions. */
export function groupTabs<T extends TabGrouping>(tabs: T[], keys: string[], key: (tab: T) => string, color: TabGroupColor | null): T[] {
  let order = Math.max(-1, ...tabs.filter(tab => tab.groupColor === color).map(tab => tab.groupOrder ?? -1));
  const additions = new Map(keys.map(id => [id, ++order]));
  return tabs.map(tab => {
    if (!additions.has(key(tab)) || tab.groupColor === color) return tab;
    const { groupColor: _, groupOrder: __, ...rest } = tab;
    return (color ? { ...rest, groupColor: color, groupOrder: additions.get(key(tab)) } : rest) as T;
  });
}

export function groupNeighbor<T extends TabGrouping>(tabs: T[], current: T | undefined, direction: -1 | 1): T | undefined {
  if (!current?.groupColor) return;
  const members = tabs.filter(tab => tab.groupColor === current.groupColor).sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));
  if (members.length < 2) return;
  return members[(members.indexOf(current) + direction + members.length) % members.length];
}

export const groupColorValue = (tab: TabGrouping) => TAB_GROUP_COLORS.find(color => color.id === tab.groupColor)?.color;
export function groupDescription<T extends TabGrouping>(tabs: T[], tab: T): string {
  const color = TAB_GROUP_COLORS.find(color => color.id === tab.groupColor);
  const members = tabs.filter(item => item.groupColor === tab.groupColor).sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));
  return color ? `${color.label}分组，第 ${members.indexOf(tab) + 1}/${members.length} 个` : '';
}
