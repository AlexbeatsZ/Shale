import { describe, it, expect } from 'vitest';
import { groupNeighbor, groupTabs, restoreTabGrouping, type TabGrouping } from './tabGroups';
import { arrangeTabUnits } from './tabDrag';
import { tabKey } from './tabIdentity';

describe('color tab groups', () => {
  it('appends in selection order and retains order on recoloring with the same color', () => {
    const tabs: ({ path: string; title: string } & TabGrouping)[] = ['A','B','C','D'].map(path => ({ path, title: path }));
    const grouped = groupTabs(tabs, ['C', 'A'], tabKey, 'red');
    const changed = groupTabs(grouped, ['D', 'C', 'B'], tabKey, 'red');
    expect(changed.filter(tab => tab.groupColor).sort((a,b) => a.groupOrder! - b.groupOrder!).map(tab => tab.path)).toEqual(['C', 'A', 'D', 'B']);
    const rejoined = groupTabs(groupTabs(changed, ['C'], tabKey, null), ['C'], tabKey, 'red');
    expect(groupNeighbor(rejoined, rejoined[2], 1)?.path).toBe('A');
    expect(groupNeighbor(rejoined, rejoined[1], -1)?.path).toBe('D');
  });
  it('rejects malformed saved colors and sequence values and ignores empty/single groups', () => {
    expect(restoreTabGrouping({ groupColor: 'blue', groupOrder: -1 })).toEqual({});
    expect(restoreTabGrouping({ groupColor: 'red', groupOrder: 0.5 })).toEqual({});
    expect(restoreTabGrouping({ groupColor: 'unknown' as 'blue', groupOrder: 0 })).toEqual({});
    const tab = { groupColor: 'blue' as const, groupOrder: 0 };
    expect(groupNeighbor([tab], tab, -1)).toBeUndefined();
  });
  it('moves only the named duplicate and keeps its membership attached to the view', () => {
    const first = { path: 'note.md', title: 'Note', groupColor: 'blue' as const, groupOrder: 0 };
    const copy = { path: 'note.md', id: 'tab:copy', title: 'Note', groupColor: 'red' as const, groupOrder: 0 };
    const other = { path: 'other.md', title: 'Other' };
    expect(arrangeTabUnits([first, copy, other], null, ['tab:copy'], ['other.md'], 'swap')).toEqual([first, other, copy]);
  });
});
