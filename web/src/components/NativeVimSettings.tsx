import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ensureVimSettings, useVimSettings, type VimSettings } from '../lib/vimSettings';
import { SettingGroup, SettingRow } from './SettingRow';
import type { InputSource } from '../../../desktop/src/inputMethodTypes';

export default function NativeVimSettings() {
  const settings = useVimSettings();
  const [sources, setSources] = useState<InputSource[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const bridge = window.webobsidianDesktop?.inputMethod;
  useEffect(() => {
    void ensureVimSettings();
    let alive = true;
    if (bridge?.supported) void bridge.list().then(value => { if (alive) setSources(value.filter(source => source.english)); })
      .catch(cause => { if (alive) setError(String(cause)); });
    return () => { alive = false; };
  }, [bridge]);
  const save = async (patch: Partial<VimSettings>) => {
    setError(''); setBusy(true);
    try { await api.putSettings({ ui: patch }); } catch (cause) { setError(`保存失败：${String(cause)}`); }
    finally { setBusy(false); }
  };
  return <SettingGroup title="Vim">
    <SettingRow name="启用 Vim" desc="普通模式使用 Vim 命令；i、a、o 等进入插入模式，Esc 返回普通模式。">
      <input aria-label="启用 Vim" type="checkbox" checked={settings.vimEnabled} disabled={busy}
        onChange={event => void save({ vimEnabled: event.target.checked })} />
    </SettingRow>
    {(['light', 'dark'] as const).map(theme => {
      const key = theme === 'light' ? 'vimCursorLight' : 'vimCursorDark';
      const label = `${theme === 'light' ? '浅色' : '深色'}主题光标颜色`;
      return <SettingRow key={theme} name={label} desc="默认跟随正文颜色；同时用于块光标和插入光标，修改后立即生效。">
        <div className="vim-cursor-setting">
          <input aria-label={label} type="color" value={settings[key] || (theme === 'light' ? '#222222' : '#dadada')}
            disabled={busy} onChange={event => void save({ [key]: event.target.value })} />
          <span>{settings[key] || '跟随主题'}</span>
          <button type="button" aria-label={`恢复${label}默认值`} disabled={busy || !settings[key]}
            onClick={() => void save({ [key]: '' })}>恢复默认</button>
        </div>
      </SettingRow>;
    })}
    <SettingRow name="自动切换输入法" desc={bridge?.supported
      ? '普通模式使用英文，插入模式恢复上次输入法；离开编辑器恢复输入。'
      : '当前平台支持 Vim；系统输入法自动切换仅适用于 macOS 和 Windows 桌面端。'}>
      <input aria-label="自动切换输入法" type="checkbox" checked={settings.vimInputMethod} disabled={busy || !bridge?.supported}
        onChange={event => void save({ vimInputMethod: event.target.checked })} />
    </SettingRow>
    {bridge?.supported && <SettingRow name="普通模式英文输入源" desc="自动检测已启用的英文布局，也可指定自定义英文布局。">
      <select aria-label="普通模式英文输入源" value={settings.vimEnglishSource} disabled={busy}
        onChange={event => void save({ vimEnglishSource: event.target.value })}>
        <option value="">自动检测</option>
        {settings.vimEnglishSource && !sources.some(source => source.id === settings.vimEnglishSource) &&
          <option value={settings.vimEnglishSource}>不可用：{settings.vimEnglishSource}</option>}
        {sources.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}
      </select>
    </SettingRow>}
    {error && <p role="alert">{error}</p>}
  </SettingGroup>;
}
