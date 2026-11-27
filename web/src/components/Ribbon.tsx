import { useStore } from '../lib/store';
import Icon from './Icon';
import SidebarTabRail from './SidebarTabRail';
export default function Ribbon() {
  const setLeftPanel = useStore(s => s.setLeftPanel);
  const leftPanel = useStore(s => s.leftPanel);
  const activeId = useStore(s => s.leftActiveId);
  return <nav className="ribbon ribbon-left" aria-label="左侧功能与标签页">
    <button className={!activeId && leftPanel === 'files' ? 'active' : ''} title="文件" aria-label="文件" aria-pressed={!activeId && leftPanel === 'files'} onClick={() => setLeftPanel('files')}><Icon name="folder" size={24} /><span className="ribbon-label">文件</span></button>
    <button className={!activeId && leftPanel === 'search' ? 'active' : ''} title="搜索 (Ctrl/⌘⇧F)" aria-label="搜索" aria-pressed={!activeId && leftPanel === 'search'} onClick={() => setLeftPanel('search')}><Icon name="search" size={24} /><span className="ribbon-label">搜索</span></button>
    <SidebarTabRail side="left" />
  </nav>;
}
