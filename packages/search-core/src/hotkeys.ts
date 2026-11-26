/** One binding format for native commands and plugin adapters. */
export interface Hotkey { modifiers: string[]; key: string }
export type HotkeyPlatform = 'windows' | 'mac';
export type HotkeyBindings = Record<string, Hotkey[]>;
export interface HotkeyPreferences {
  version: 1;
  bindings: Record<string, Hotkey[]>;
  platforms?: Partial<Record<HotkeyPlatform, HotkeyBindings>>;
}
export interface VaultHotkeys extends HotkeyPreferences { vault: string; revision?: string }
export const emptyHotkeys = (): HotkeyPreferences => ({ version: 1, bindings: {} });

/** Obsidian core command ids that third-party plugins call through the plugin API. */
const aliases: Record<string, string> = {
  'editor:save-file': 'save', 'command-palette:open': 'commands', 'switcher:open': 'files',
  'app:open-settings': 'settings', 'global-search:open': 'search', 'graph:open': 'graph',
  'file-explorer:open': 'file-explorer', 'bookmarks:open': 'bookmarks', 'outline:open': 'outline', 'tag-pane:open': 'tags',
  'workspace:new-tab': 'new-tab', 'workspace:split-vertical': 'split', 'workspace:split-horizontal': 'split-down',
  'markdown:toggle-preview': 'toggle-preview', 'editor:toggle-source': 'toggle-source',
};
export function hotkeyCommandId(id: string): string {
  return aliases[id] ?? id;
}
export function normalizeKey(key: string): string {
  const aliases: Record<string, string> = { ' ': 'Space', esc: 'Escape', return: 'Enter', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
  return aliases[key.toLowerCase()] ?? (key.length === 1 ? key.toUpperCase() : key);
}
export function normalizeHotkey(value: unknown): Hotkey | null {
  if (!value || typeof value !== 'object') return null;
  const binding = value as Partial<Hotkey>;
  if (typeof binding.key !== 'string' || !binding.key || binding.key.length > 40 || !Array.isArray(binding.modifiers)) return null;
  const names: Record<string, string> = { mod: 'Mod', ctrl: 'Ctrl', control: 'PhysicalCtrl', physicalctrl: 'PhysicalCtrl', meta: 'Meta', cmd: 'Meta', command: 'Meta', alt: 'Alt', option: 'Alt', shift: 'Shift' };
  const mods = binding.modifiers.map(mod => typeof mod === 'string' ? names[mod.toLowerCase()] : undefined);
  if (mods.some(mod => !mod)) return null;
  return { modifiers: ['Mod', 'Ctrl', 'PhysicalCtrl', 'Meta', 'Alt', 'Shift'].filter(mod => mods.includes(mod)), key: normalizeKey(binding.key) };
}
export function bindingFromString(value: string): Hotkey | null {
  // Split modifiers from the front so Ctrl++ remains a valid plus key.
  const modifiers: string[] = []; let key = value.trim();
  for (;;) {
    const match = /^(Mod|Ctrl|Control|PhysicalCtrl|Meta|Cmd|Command|Alt|Option|Shift)\+/i.exec(key);
    if (!match) break;
    modifiers.push(match[1]); key = key.slice(match[0].length);
  }
  return normalizeHotkey({ modifiers, key });
}
export function hotkeySignature(binding: Hotkey, mac = false): string {
  const mods = new Set(binding.modifiers.map(mod => mod === 'Mod' || mod === 'Ctrl' ? (mac ? 'Meta' : 'Ctrl') : mod === 'PhysicalCtrl' ? 'Ctrl' : mod));
  return ['Ctrl', 'Meta', 'Alt', 'Shift'].filter(mod => mods.has(mod)).concat(normalizeKey(binding.key).toLowerCase()).join('+');
}
/** Layout characters first; shifted number/punctuation keys retain their base key. */
export function eventHotkey(event: { key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): Hotkey | null {
  const punctuation: Record<string, string> = { Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' };
  // Option on Mac can report Ω, ÷ or Dead instead of the shortcut's base key.
  const key = event.altKey && /^Key[A-Z]$/.test(event.code) ? event.code.slice(3)
    : event.shiftKey || event.altKey ? (/^Digit[0-9]$/.test(event.code) ? event.code.slice(5) : punctuation[event.code] ?? event.key) : event.key;
  if (['Control', 'Meta', 'Alt', 'Shift', 'Dead', 'Process', 'Unidentified'].includes(key)) return null;
  return normalizeHotkey({ modifiers: [event.ctrlKey && 'PhysicalCtrl', event.metaKey && 'Meta', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean), key });
}
/** Resolve to physical modifiers before displaying or matching; never persist this view. */
export function physicalHotkey(binding: Hotkey, mac = false): Hotkey {
  return { ...binding, modifiers: [...new Set(binding.modifiers.map(mod => mod === 'Ctrl' || mod === 'Mod'
    ? mac ? 'Meta' : 'PhysicalCtrl' : mod))] };
}
export function hotkeyLabel(binding: Hotkey, mac = false): string {
  return [...physicalHotkey(binding, mac).modifiers.map(mod => mod === 'Meta' && mac ? '⌘'
    : mod === 'PhysicalCtrl' ? mac ? 'Control' : 'Ctrl' : mac && mod === 'Alt' ? 'Option' : mod), binding.key].join(' + ');
}
const macReserved = new Set(['Meta+Tab', 'Meta+Shift+Tab', 'Meta+Space', 'Meta+Alt+Space', 'Meta+`', 'Meta+Shift+`'].map(value => value.toLowerCase()));
export function isReservedMacHotkey(binding: Hotkey): boolean {
  return macReserved.has(hotkeySignature(binding, true).toLowerCase());
}
/** Only inherited primary-modifier bindings fall back; explicit Mac choices are preserved. */
export function portableHotkey(binding: Hotkey, mac: boolean): Hotkey {
  return mac && binding.modifiers.some(mod => mod === 'Ctrl' || mod === 'Mod') && isReservedMacHotkey(binding)
    ? { ...binding, modifiers: binding.modifiers.map(mod => mod === 'Ctrl' || mod === 'Mod' ? 'PhysicalCtrl' : mod) }
    : binding;
}
export function hasHotkeyOverride(preferences: HotkeyPreferences, command: string, mac: boolean): boolean {
  return Object.hasOwn(preferences.platforms?.[mac ? 'mac' : 'windows'] ?? {}, command) || (mac && Object.hasOwn(preferences.platforms?.windows ?? {}, command)) || Object.hasOwn(preferences.bindings, command);
}
export function resolveHotkeys(preferences: HotkeyPreferences, command: string, defaults: Hotkey[], mac = false): Hotkey[] {
  const override = preferences.platforms?.[mac ? 'mac' : 'windows']?.[command];
  return override ?? (preferences.platforms?.windows?.[command] ?? preferences.bindings[command] ?? defaults).map(binding => portableHotkey(binding, mac));
}
export function normalizeHotkeyPreferences(value: unknown): HotkeyPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('快捷键文件格式无效');
  const data = value as Record<string, unknown>;
  if (data.version !== 1) throw new Error('快捷键文件版本无效');
  const unknown = Object.keys(data).filter(key => !['version', 'bindings', 'platforms'].includes(key));
  if (unknown.length) throw new Error('快捷键文件包含不支持的字段：' + unknown.join(', '));
  const result: HotkeyPreferences = { version: 1, bindings: normalizeHotkeyMap(data.bindings ?? {}) };
  if (data.platforms !== undefined) {
    if (!data.platforms || typeof data.platforms !== 'object' || Array.isArray(data.platforms)) throw new Error('快捷键平台配置无效');
    result.platforms = {};
    for (const [platform, bindings] of Object.entries(data.platforms)) {
      if (platform !== 'mac' && platform !== 'windows') throw new Error('快捷键平台无效：' + platform);
      result.platforms[platform] = normalizeHotkeyMap(bindings);
    }
  }
  return result;
}
export function mergeHotkeys(target: Hotkey[], source: readonly Hotkey[]): Hotkey[] {
  const known = new Set(target.map(key => JSON.stringify(key)));
  return [...target, ...source.filter(key => { const id = JSON.stringify(key); if (known.has(id)) return false; known.add(id); return true; })];
}
export function normalizeHotkeyMap(value: unknown): Record<string, Hotkey[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('快捷键配置必须是命令与按键组的映射');
  const result: Record<string, Hotkey[]> = Object.create(null);
  for (const [id, list] of Object.entries(value)) {
    if (!id || id.length > 512 || !Array.isArray(list) || list.length > 32) throw new Error(`快捷键配置无效：${id}`);
    const bindings = list.map(normalizeHotkey);
    if (bindings.some(binding => !binding)) throw new Error(`快捷键组合无效：${id}`);
    const key = hotkeyCommandId(id);
    result[key] = mergeHotkeys(result[key] ?? [], bindings as Hotkey[]);
  }
  return result;
}
