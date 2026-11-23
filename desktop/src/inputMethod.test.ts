import { describe, expect, it } from 'vitest';
import { InputMethodService, type InputMethodBackend } from './inputMethod';
import type { InputMethodState } from './inputMethodTypes';

function fixture(initial: InputMethodState = { source: 'pinyin', open: true, conversion: 1 }) {
  let current = initial, foreground = true, fail = '';
  const calls: InputMethodState[] = [];
  const backend: InputMethodBackend = {
    list: async () => [{ id: 'english', label: 'English', english: true }, { id: 'pinyin', label: 'Pinyin', english: false }],
    get: async () => ({ ...current }),
    select: async state => {
      if (state.source === fail) throw new Error('switch failed');
      current = { ...state }; calls.push(current);
    },
  };
  return { service: new InputMethodService(backend, () => foreground), calls, current: () => current,
    foreground: (value: boolean) => { foreground = value; }, fail: (value: string) => { fail = value; } };
}
describe('native Vim input-method lease', () => {
  it('restores the last input source and IME conversion/open state', async () => {
    const f = fixture();
    await f.service.update({ owner: 'one', mode: 'normal' });
    expect(f.current()).toEqual({ source: 'english', open: false });
    await f.service.update({ owner: 'one', mode: 'normal' });
    await f.service.update({ owner: 'one', mode: 'insert' });
    expect(f.current()).toEqual({ source: 'pinyin', open: true, conversion: 1 });
  });
  it('keeps English when English was used in Insert', async () => {
    const f = fixture({ source: 'english', open: false });
    await f.service.update({ owner: 'one', mode: 'normal' });
    await f.service.update({ owner: 'one', mode: 'insert' });
    expect(f.current()).toEqual({ source: 'english', open: false });
  });
  it('serializes rapid mode changes without overwriting the saved Chinese source', async () => {
    const f = fixture();
    await Promise.all(['normal', 'insert', 'normal', 'insert'].map(mode => f.service.update({ owner: 'one', mode })));
    expect(f.calls.map(state => state.source)).toEqual(['english', 'pinyin', 'english', 'pinyin']);
  });
  it('transfers a split lease and ignores a stale release', async () => {
    const f = fixture();
    await f.service.update({ owner: 'one', mode: 'normal' });
    await f.service.update({ owner: 'two', mode: 'normal' });
    await f.service.update({ owner: 'one', mode: 'release' });
    expect(f.current().source).toBe('english');
    await f.service.update({ owner: 'two', mode: 'release' });
    expect(f.current().source).toBe('pinyin');
  });
  it('never changes another foreground app and resumes restoration on focus', async () => {
    const f = fixture();
    await f.service.update({ owner: 'one', mode: 'normal' });
    f.foreground(false);
    await f.service.update({ owner: 'one', mode: 'release' });
    expect(f.calls).toHaveLength(1);
    f.foreground(true);
    await f.service.update({ owner: 'one', mode: 'insert' });
    expect(f.current().source).toBe('pinyin');
  });
  it('retains restoration state on failure and permits retry', async () => {
    const f = fixture();
    await f.service.update({ owner: 'one', mode: 'normal' });
    f.fail('pinyin');
    await expect(f.service.update({ owner: 'one', mode: 'release' })).rejects.toThrow('switch failed');
    f.fail('');
    await f.service.update({ owner: 'one', mode: 'release' });
    expect(f.current().source).toBe('pinyin');
  });
  it('restores the input source before normal application shutdown', async () => {
    const f = fixture();
    const switching = f.service.update({ owner: 'one', mode: 'normal' });
    const closing = f.service.releaseAll();
    await Promise.all([switching, closing]);
    expect(f.current().source).toBe('pinyin');
  });
  it('validates explicit English layouts before changing any state', async () => {
    const f = fixture();
    await expect(f.service.update({ owner: 'one', mode: 'normal', englishSource: 'pinyin' })).rejects.toThrow('英文');
    await expect(f.service.update({ owner: '../shell', mode: 'normal' })).rejects.toThrow('Invalid');
    expect(f.calls).toHaveLength(0);
  });
});
