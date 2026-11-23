import { isMacOS } from '../lib/platform';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { bindingFromString, eventHotkey, hotkeyLabel, hotkeySignature, hasHotkeyOverride, isReservedMacHotkey,
  type Hotkey, type HotkeyPlatform } from '@webobsidian/search-core';
import { sharedApp, pluginRevision, subscribePlugins } from '../lib/plugins';
import { consumeHotkeySettingsRequest, peekHotkeySettingsRequest, matchName, updateHotkeys, useSearch, refreshHotkeys } from '../lib/search';
import { SettingGroup, SettingRow } from './SettingRow';
import Icon from './Icon';
import '../styles/hotkeys.css';

type Filter = 'all' | 'assigned' | 'unassigned' | 'custom' | 'conflicts' | 'unavailable';
const platforms = ['windows', 'mac'] as const;
const platformName = (platform: HotkeyPlatform) => platform === 'mac' ? 'Mac' : 'Windows';

/** Both platform columns edit the same synchronized authority and command catalog. */
export default function HotkeySettings() {
  const { hotkeys, hotkeyError } = useSearch();
  const revision = useSyncExternalStore(subscribePlugins, pluginRevision);
  const [query, setQuery] = useState(peekHotkeySettingsRequest);
  const [filter, setFilter] = useState<Filter>('all');
  const [recording, setRecording] = useState<{ id: string; platform: HotkeyPlatform } | null>(null);
  const [combination, setCombination] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const recorder = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    consumeHotkeySettingsRequest();
    const focus = (event: Event) => {
      const id = (event as CustomEvent<string>).detail || consumeHotkeySettingsRequest();
      consumeHotkeySettingsRequest(); setQuery(id || ''); setFilter('all'); search.current?.focus();
    };
    window.addEventListener('hotkeys-settings-open', focus);
    window.addEventListener('search-settings-open', focus);
    return () => { window.removeEventListener('hotkeys-settings-open', focus); window.removeEventListener('search-settings-open', focus); };
  }, []);
  useEffect(() => { if (recording) recorder.current?.focus(); }, [recording]);
  const catalog = useMemo(() => sharedApp.commands.hotkeyCatalog().map(command => ({ ...command,
    windows: sharedApp.commands.getHotkeys(command.id, false), mac: sharedApp.commands.getHotkeys(command.id, true),
    custom: platforms.some(platform => hasHotkeyOverride(hotkeys, command.id, platform === 'mac')),
  })), [hotkeys, revision]);
  const collisions = useMemo(() => {
    const result = { windows: new Map<string, typeof catalog>(), mac: new Map<string, typeof catalog>() };
    for (const platform of platforms) for (const command of catalog) if (command.installed) for (const binding of command[platform]) {
      const signature = hotkeySignature(binding, platform === 'mac'), list = result[platform].get(signature) ?? [];
      if (!list.some(other => other.id === command.id)) result[platform].set(signature, [...list, command]);
    }
    return result;
  }, [catalog]);
  const conflictNames = (id: string, binding: Hotkey, platform: HotkeyPlatform) => {
    const group = collisions[platform].get(hotkeySignature(binding, platform === 'mac')) ?? [];
    const effective = group.some(command => hasHotkeyOverride(hotkeys, command.id, platform === 'mac'))
      ? group.filter(command => hasHotkeyOverride(hotkeys, command.id, platform === 'mac')) : group;
    return effective.some(command => command.id === id) && effective.length > 1 ? effective.filter(command => command.id !== id).map(command => command.name) : [];
  };
  const conflicted = (command: typeof catalog[number]) => platforms.some(platform => command[platform].some(binding =>
    conflictNames(command.id, binding, platform).length || platform === 'mac' && isReservedMacHotkey(binding)));
  const filtered = catalog.filter(command => {
    const assigned = command.windows.length || command.mac.length;
    if (filter === 'assigned' && !assigned || filter === 'unassigned' && assigned || filter === 'custom' && !command.custom || filter === 'unavailable' && command.installed || filter === 'conflicts' && !conflicted(command)) return false;
    const haystack = `${command.name} ${command.id} ${platforms.flatMap(platform => command[platform].map(binding => hotkeyLabel(binding, platform === 'mac'))).join(' ')}`;
    return query.trim().split(/\s+/).filter(Boolean).every(term => !!matchName(term, haystack));
  });
  const save = async (id: string, bindings: Hotkey[] | null, platform: HotkeyPlatform) => {
    setBusy(id); setError('');
    try { await updateHotkeys(id, bindings, platform); setRecording(null); }
    catch (failure) { setError(String(failure)); await refreshHotkeys(); }
    finally { setBusy(''); }
  };
  const append = (command: typeof catalog[number], platform: HotkeyPlatform, binding: Hotkey | null) => {
    if (!binding) { setError('组合键格式无效，例如 Ctrl+K、Command+K 或 Control+K。'); return; }
    if (!binding.modifiers.length && !/^F\d{1,2}$/.test(binding.key)) { setError('请使用带修饰键的组合键，或功能键。'); return; }
    if (command[platform].some(existing => hotkeySignature(existing, platform === 'mac') === hotkeySignature(binding, platform === 'mac'))) { setRecording(null); return; }
    void save(command.id, [...command[platform], binding], platform);
  };
  return <div className="hotkey-settings">
    <h2>快捷键</h2>
    <p className="setting-description">Windows 和 Mac 共用一份随仓库同步的快捷键。Mac 默认跟随 Windows：Ctrl → Command，Alt → Option；系统保留组合自动改用 Control。Mac 单独设置后保持独立。</p>
    <p className="setting-description">文字录入：Ctrl+K 表示通用主修饰键，Command+K 明确使用 Command，Control+K 明确使用实体 Control。支持多组按键；空列表禁用。Windows 列也用于 Linux / Android 外接键盘。</p>
    <div className="hotkey-toolbar">
      <div className="hotkey-search"><Icon name="search" size={16} /><input ref={search} type="search" value={query} placeholder="搜索命令、ID 或快捷键…" aria-label="搜索快捷键" onChange={event => setQuery(event.target.value)} /></div>
      <select aria-label="快捷键筛选" value={filter} onChange={event => setFilter(event.target.value as Filter)}>
        <option value="all">全部</option><option value="assigned">已分配</option><option value="unassigned">未分配</option><option value="custom">自定义 / 已迁移</option><option value="conflicts">冲突</option><option value="unavailable">不可用</option>
      </select>
    </div>
    <p className="hotkey-summary" role="status">显示 {filtered.length} / {catalog.length} 项 · {catalog.filter(command => command.installed).length} 个可用命令 · {catalog.filter(conflicted).length} 项冲突</p>
    {error && <p className="hotkey-error" role="alert">{error}</p>}
    {hotkeyError && <p className="hotkey-error" role="alert">{hotkeyError}</p>}
    {hotkeys.migration && <p className="hotkey-migration">{hotkeys.migration}</p>}
    <SettingGroup className="hotkey-list">
      {filtered.map(command => <SettingRow key={command.id} className={command.installed ? '' : 'hotkey-unavailable'} name={<><span>{command.name}</span>{!command.installed && <span className="hotkey-status">不可用</span>}</>} desc={<code>{command.id}</code>}>
        <div className="hotkey-platforms">
          {platforms.map(platform => {
            const bindings = command[platform], mac = platform === 'mac', own = Object.hasOwn(hotkeys.platforms?.[platform] ?? {}, command.id);
            const label = `${platformName(platform)} ${command.name}`;
            return <div className="hotkey-platform" key={platform} data-hotkey-platform={platform}>
              <div className="hotkey-platform-title">{platformName(platform)}<span className="hotkey-status">{own ? bindings.length ? '单独设置' : '已禁用' : mac ? '跟随 Windows' : Object.hasOwn(hotkeys.bindings, command.id) ? '通用设置' : '默认'}</span></div>
              <div className="hotkey-bindings">{bindings.map((binding, index) => {
                const conflicts = conflictNames(command.id, binding, platform), reserved = mac && isReservedMacHotkey(binding);
                return <span className={`hotkey-binding${conflicts.length || reserved ? ' hotkey-conflict' : ''}`} key={index} title={reserved ? '此组合由 macOS 系统保留，建议改用 Control' : conflicts.length ? `与 ${conflicts.join('、')} 冲突；调整后才能执行` : undefined}>
                  <kbd>{hotkeyLabel(binding, mac)}</kbd><button type="button" aria-label={`移除 ${label} 的 ${hotkeyLabel(binding, mac)}`} disabled={!!busy} onClick={() => void save(command.id, bindings.filter((_, at) => at !== index), platform)}>×</button>
                </span>;
              })}{!bindings.length && <span className="hotkey-empty">未分配</span>}</div>
              <div className="hotkey-actions">
                <button type="button" className="hotkey-icon-button" title="添加快捷键" aria-label={`为 ${label} 添加快捷键`} disabled={!!busy || !hotkeys.vault || bindings.length >= 32} onClick={() => { setCombination(''); setRecording({ id: command.id, platform }); }}><Icon name="plus" size={15} /></button>
                {bindings.length > 0 && <button type="button" title="禁用此平台快捷键" aria-label={`禁用 ${label} 的快捷键`} disabled={!!busy} onClick={() => void save(command.id, [], platform)}>禁用</button>}
                {own && <button type="button" title="恢复继承" aria-label={`恢复 ${label} 的继承`} disabled={!!busy} onClick={() => void save(command.id, null, platform)}>恢复继承</button>}
              </div>
              {recording?.id === command.id && recording.platform === platform && <div className="hotkey-recording">
                <input ref={recorder} data-hotkey-recorder readOnly className="hotkey-recorder" placeholder="按下组合键；Esc 取消" aria-label={`录入 ${label} 的快捷键`} onKeyDown={event => {
                  event.preventDefault(); event.stopPropagation();
                  if (event.nativeEvent.isComposing || event.nativeEvent.getModifierState('AltGraph')) return;
                  if (event.key === 'Escape') { setRecording(null); return; }
                  const binding = eventHotkey(event.nativeEvent);
                  // Recording another platform uses this host's primary key. Physical Mac Control stays explicit.
                  if (binding && !mac) binding.modifiers = binding.modifiers.map(mod => mod === 'PhysicalCtrl' || isMacOS() && mod === 'Meta' ? 'Ctrl' : mod);
                  if (binding && mac && !isMacOS()) binding.modifiers = binding.modifiers.map(mod => mod === 'PhysicalCtrl' ? 'Ctrl' : mod);
                  if (binding) append(command, platform, binding);
                }} />
                <form onSubmit={event => { event.preventDefault(); append(command, platform, bindingFromString(combination)); }}>
                  <input data-hotkey-recorder aria-label={`输入 ${label} 的组合键`} placeholder="例如 Control+K" value={combination} onChange={event => setCombination(event.target.value)} />
                  <button type="submit" disabled={!!busy}>添加</button>
                  <button type="button" onClick={() => setRecording(null)}>取消</button>
                </form>
              </div>}
            </div>;
          })}
        </div>
      </SettingRow>)}
    </SettingGroup>
    {!filtered.length && <p className="hotkey-empty">没有匹配的命令。</p>}
  </div>;
}
