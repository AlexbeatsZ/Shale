import { expect, it } from 'vitest';
import { bindingFromString, eventHotkey, hotkeyCommandId, hotkeyLabel, hotkeySignature, emptyHotkeys,
  normalizeHotkeyPreferences, resolveHotkeys } from './hotkeys';

it('maps portable Ctrl to Command on Mac and keeps explicit physical Control distinct', () => {
  const primary = bindingFromString('Ctrl+Option+Z')!, control = bindingFromString('Control+Option+Z')!;
  expect(primary).toEqual({ modifiers: ['Ctrl', 'Alt'], key: 'Z' });
  expect(control).toEqual({ modifiers: ['PhysicalCtrl', 'Alt'], key: 'Z' });
  expect(hotkeyLabel(primary, true)).toBe('⌘ + Option + Z');
  expect(hotkeyLabel(control, true)).toBe('Control + Option + Z');
  expect(hotkeyLabel(control, false)).toBe('Ctrl + Alt + Z');
  const recorded = eventHotkey({ key: 'Ω', code: 'KeyZ', ctrlKey: true, altKey: true, metaKey: false, shiftKey: false })!;
  expect(hotkeySignature(recorded, true)).toBe(hotkeySignature(control, true));
  expect(hotkeySignature(primary, true)).not.toBe(hotkeySignature(control, true));
  expect(eventHotkey({ key: 'Dead', code: 'KeyE', ctrlKey: false, altKey: true, metaKey: false, shiftKey: false }))
    .toEqual({ modifiers: ['Alt'], key: 'E' });
});

it('keeps one serialized file portable across platform reads and honors independent overrides and disable', () => {
  const shared = normalizeHotkeyPreferences({ version: 1, bindings: { save: [bindingFromString('Ctrl+S')] },
    platforms: { windows: { bold: [bindingFromString('Ctrl+K')] }, mac: { save: [bindingFromString('Control+S')], disabled: [] } } });
  const before = JSON.stringify(shared), defaults = [bindingFromString('Ctrl+B')!];
  expect(hotkeyLabel(resolveHotkeys(shared, 'bold', defaults, false)[0], false)).toBe('Ctrl + K');
  expect(hotkeyLabel(resolveHotkeys(shared, 'bold', defaults, true)[0], true)).toBe('⌘ + K');
  expect(hotkeyLabel(resolveHotkeys(shared, 'save', defaults, true)[0], true)).toBe('Control + S');
  expect(resolveHotkeys(shared, 'disabled', defaults, true)).toEqual([]);
  expect(JSON.stringify(shared)).toBe(before);
  const synced = normalizeHotkeyPreferences(JSON.parse(before));
  expect(resolveHotkeys(synced, 'save', defaults, true)).toEqual(resolveHotkeys(shared, 'save', defaults, true));
});

it('uses Control only for reserved inherited Mac combinations and preserves explicit platform choices', () => {
  const prefs = emptyHotkeys();
  for (const combination of ['Ctrl+H', 'Ctrl+M', 'Ctrl+Q', 'Ctrl+Tab', 'Ctrl+Space', 'Ctrl+Alt+H']) {
    const defaults = [bindingFromString(combination)!];
    expect(resolveHotkeys(prefs, 'test', defaults, true)[0].modifiers).toContain('PhysicalCtrl');
    expect(resolveHotkeys(prefs, 'test', defaults, false)).toEqual(defaults);
  }
  prefs.platforms = { mac: { test: [bindingFromString('Command+H')!] } };
  expect(hotkeyLabel(resolveHotkeys(prefs, 'test', [], true)[0], true)).toBe('⌘ + H');
});

it('migrates level 7 heading aliases and rejects malformed platform maps without silently resetting', () => {
  expect(hotkeyCommandId('obsidian-heading-shifter:apply-heading7')).toBe('editor:set-heading-7');
  for (const platforms of [[], { linux: {} }, { mac: [] }, { mac: { save: [{ modifiers: ['Unknown'], key: 'S' }] } }])
    expect(() => normalizeHotkeyPreferences({ version: 1, platforms })).toThrow();
});
