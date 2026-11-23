import { vaultPathKey } from './vaultFile.js';
import { bindingFromString, emptyHotkeys, hotkeyCommandId, hotkeySignature, normalizeHotkeyMap,
  normalizeHotkeyPreferences, type HotkeyPreferences, type VaultHotkeys, type HotkeyPlatform } from '@shale/search-core';
import { getSettings } from './settings.js';
import { parseConfiguration, readShaleConfiguration, readVaultConfiguration, writeVaultConfiguration,
  type VaultConfigurationSource } from './vaultConfiguration.js';

export const HOTKEY_CONFIGURATION = 'hotkeys.jsonc';
export const HOTKEY_CONFIGURATION_PATH = `.shale/${HOTKEY_CONFIGURATION}`;
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
let writes: Promise<unknown> = Promise.resolve();
const view = (preferences: HotkeyPreferences, source: VaultConfigurationSource): VaultHotkeys =>
  ({ ...preferences, vault: source.vault, revision: source.revision });

/** The synchronized file always wins. Legacy state can only seed an absent file. */
export async function readHotkeys(): Promise<VaultHotkeys> {
  const source = await readVaultConfiguration(HOTKEY_CONFIGURATION);
  if (source.exists) return view(normalizeHotkeyPreferences(parseConfiguration(source.content)), source);
  const next = await legacyHotkeys(source.vault);
  try {
    const saved = await writeVaultConfiguration({ ...source, content: JSON.stringify(next, null, 2) + '\n' });
    return view(next, saved);
  } catch (error) {
    // Another reader or incoming sync may have created the authority meanwhile.
    if ((error as { status?: number }).status !== 409) throw error;
    const winner = await readVaultConfiguration(HOTKEY_CONFIGURATION, source.vault);
    if (!winner.exists) throw error;
    return view(normalizeHotkeyPreferences(parseConfiguration(winner.content)), winner);
  }
}
async function legacyHotkeys(vault: string): Promise<HotkeyPreferences> {
  const settings = await getSettings(), root = vaultPathKey(settings.vault.path);
  const variants = Object.entries(settings.hotkeys).filter(([key]) => vaultPathKey(key) === root);
  if (variants.length) {
    const next = emptyHotkeys();
    for (const [, value] of variants) {
      for (const [id, bindings] of Object.entries(normalizeHotkeyMap(value.bindings))) {
        if (Object.hasOwn(next.bindings, id) && JSON.stringify(next.bindings[id]) !== JSON.stringify(bindings))
          throw fail('同一仓库的旧快捷键配置存在冲突，请先处理路径大小写变体', 409);
        next.bindings[id] = bindings;
      }
      next.imported = [...new Set([...next.imported, ...value.imported])];
    }
    next.migration = '已迁移本机快捷键；通用 Ctrl 在 Mac 使用 Command，平台覆盖保存在同一同步文件';
    return next;
  }
  const source = await readShaleConfiguration('hotkeys.json');
  if (source.vault !== vault) throw fail('Vault 已切换，请重新打开快捷键设置', 409);
  const next = emptyHotkeys();
  if (source.exists) next.bindings = normalizeHotkeyMap(parseConfiguration(source.content));
  next.imported = Object.keys(next.bindings);
  // Earlier versions stored only the first Fuzzy binding. Preserve a deliberate
  // changed/disabled value, but recover all original alternatives when it matches.
  for (const [old, value] of Object.entries(settings.search.chinese.shortcuts)) {
    const id = hotkeyCommandId(old), binding = value ? bindingFromString(value) : null;
    if (value && !binding) continue;
    if (binding && next.bindings[id]?.some(key => hotkeySignature(key) === hotkeySignature(binding))) continue;
    next.bindings[id] = binding ? [binding] : [];
  }
  const legacyBindings: HotkeyPreferences['bindings'] = {};
  for (const [key, value] of Object.entries(settings.writing)) {
    if (vaultPathKey(key) !== root) continue;
    for (const [id, keys] of Object.entries(normalizeHotkeyMap(value.hotkeys))) {
      if (Object.hasOwn(legacyBindings, id) && JSON.stringify(legacyBindings[id]) !== JSON.stringify(keys))
        throw fail('同一仓库的旧写作快捷键存在路径大小写冲突，请先处理后重试', 409);
      legacyBindings[id] = keys;
    }
  }
  for (const [old, keys] of Object.entries(legacyBindings)) {
    const id = hotkeyCommandId(old);
    if (!Object.hasOwn(next.bindings, id)) Object.assign(next.bindings, normalizeHotkeyMap({ [old]: keys }));
  }
  next.migration = source.exists ? '已只读导入 Shale 快捷键；通用 Ctrl 在 Mac 使用 Command' : '使用跨平台默认快捷键';
  return next;
}
export function patchHotkeys(input: unknown): Promise<VaultHotkeys> {
  const operation = writes.catch(() => {}).then(() => patch(input));
  writes = operation;
  return operation;
}
async function patch(input: unknown): Promise<VaultHotkeys> {
  if (!input || typeof input !== 'object') throw fail('快捷键请求无效');
  const { vault, command, bindings, platform, revision } = input as Record<string, unknown>;
  if (typeof vault !== 'string' || typeof command !== 'string' || !command || command.length > 512 ||
    (bindings !== null && !Array.isArray(bindings)) || (platform !== undefined && platform !== 'windows' && platform !== 'mac') ||
    (revision !== undefined && typeof revision !== 'string')) throw fail('快捷键请求无效');
  const current = await readHotkeys();
  if (current.vault !== vault) throw fail('Vault 已切换，请重新打开快捷键设置', 409);
  const source = await readVaultConfiguration(HOTKEY_CONFIGURATION, vault);
  if (revision !== undefined && source.revision !== revision) throw fail('快捷键已被其他设备或窗口修改，请刷新后重试', 409);
  const preferences = normalizeHotkeyPreferences(parseConfiguration(source.content));
  const id = hotkeyCommandId(command), normalized = bindings === null ? null : normalizeHotkeyMap({ [id]: bindings })[id];
  const target = platform === undefined ? preferences.bindings
    : ((preferences.platforms ??= {})[platform as HotkeyPlatform] ??= {});
  if (normalized === null) delete target[id];
  else target[id] = normalized;
  const saved = await writeVaultConfiguration({ ...source, content: JSON.stringify(preferences, null, 2) + '\n' });
  return view(preferences, saved);
}
