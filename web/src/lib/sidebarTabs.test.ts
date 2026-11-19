import { describe, expect, it } from 'vitest';
import { restoreSidebarTabs, sidebarTab } from './sidebarTabs';

describe('sidebar view state persistence', () => {
  it('keeps independent identities for two views of the same note without serializing note text', () => {
    const tabs = [sidebarTab('markdown', { file: 'note.md' }, 'first'), sidebarTab('markdown', { file: 'note.md' }, 'second')];
    const restored = restoreSidebarTabs(JSON.parse(JSON.stringify(tabs)));
    expect(restored.map(tab => tab.id)).toEqual(['first', 'second']);
    expect(restored.map(tab => tab.state)).toEqual([{ file: 'note.md' }, { file: 'note.md' }]);
  });
  it('only restores webpage views on desktop and keeps valid workspace identities', () => {
    const safe = sidebarTab('webviewer', { url: 'https://example.com/' }, 'old-page');
    const blank = sidebarTab('webviewer', { url: '' }, 'new-page');
    const plugin = sidebarTab('plugin-view', { custom: { value: 1 } }, 'plugin');
    const tabs = [
      sidebarTab('webviewer', { url: 'javascript:alert(1)' }, 'unsafe'),
      sidebarTab('webviewer', { url: 'https://user:password@example.com/' }, 'credentials'),
      safe,
      blank,
      sidebarTab('markdown', { file: null }, 'invalid'),
      plugin,
      sidebarTab('empty', {}, 'plugin'),
    ];
    expect(restoreSidebarTabs(tabs)).toEqual([plugin]);
    expect(restoreSidebarTabs(tabs, true)).toEqual([safe, blank, plugin]);
  });
});
