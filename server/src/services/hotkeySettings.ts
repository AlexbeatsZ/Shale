import { emptyHotkeys, hotkeyCommandId, normalizeHotkeyMap, normalizeHotkeyPreferences,
  type HotkeyPreferences, type VaultHotkeys, type HotkeyPlatform } from '@shale/search-core';
import { parseConfiguration, readVaultConfiguration, writeVaultConfiguration,
  type VaultConfigurationSource } from './vaultConfiguration.js';

export const HOTKEY_CONFIGURATION = 'hotkeys.jsonc';
export const HOTKEY_CONFIGURATION_PATH = `.shale/${HOTKEY_CONFIGURATION}`;
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
let writes: Promise<unknown> = Promise.resolve();
const view = (preferences: HotkeyPreferences, source: VaultConfigurationSource): VaultHotkeys =>
  ({ ...preferences, vault: source.vault, revision: source.revision });

/** The synchronized file is the only source; an absent file means the built-in defaults. */
export async function readHotkeys(): Promise<VaultHotkeys> {
  const source = await readVaultConfiguration(HOTKEY_CONFIGURATION);
  return view(source.exists ? normalizeHotkeyPreferences(parseConfiguration(source.content)) : emptyHotkeys(), source);
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
  const preferences = source.exists ? normalizeHotkeyPreferences(parseConfiguration(source.content)) : emptyHotkeys();
  const id = hotkeyCommandId(command), normalized = bindings === null ? null : normalizeHotkeyMap({ [id]: bindings })[id];
  const target = platform === undefined ? preferences.bindings
    : ((preferences.platforms ??= {})[platform as HotkeyPlatform] ??= {});
  if (normalized === null) delete target[id];
  else target[id] = normalized;
  const saved = await writeVaultConfiguration({ ...source, content: JSON.stringify(preferences, null, 2) + '\n' });
  return view(preferences, saved);
}
