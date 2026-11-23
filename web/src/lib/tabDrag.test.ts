import { describe, expect, it } from 'vitest';
import { arrangeTabUnits } from './tabDrag';

const tabs = (...paths: string[]) => paths.map(path => ({ path, title: path }));
const order = (result: { path: string }[] | null) => result?.map(tab => tab.path) ?? null;

describe('arrangeTabUnits', () => {
  it('moves the last tab before the first and shifts the others', () => {
    expect(order(arrangeTabUnits(tabs('a', 'b', 'c', 'd'), null, ['d'], ['a'], 'before'))).toEqual(['d', 'a', 'b', 'c']);
  });

  it('swaps only the two tabs', () => {
    expect(order(arrangeTabUnits(tabs('a', 'b', 'c', 'd'), null, ['d'], ['a'], 'swap'))).toEqual(['d', 'b', 'c', 'a']);
  });

  it('moves forward before a later tab and to the end', () => {
    expect(order(arrangeTabUnits(tabs('a', 'b', 'c', 'd'), null, ['a'], ['d'], 'before'))).toEqual(['b', 'c', 'a', 'd']);
    expect(order(arrangeTabUnits(tabs('a', 'b', 'c', 'd'), null, ['a'], null, 'before'))).toEqual(['b', 'c', 'd', 'a']);
  });

  it('treats no-op moves as unchanged', () => {
    expect(arrangeTabUnits(tabs('a', 'b'), null, ['a'], ['b'], 'before')).toBeNull();
    expect(arrangeTabUnits(tabs('a', 'b'), null, ['b'], null, 'before')).toBeNull();
    expect(arrangeTabUnits(tabs('a', 'b'), null, ['a'], ['a'], 'swap')).toBeNull();
  });

  it('moves and swaps a split group as one unit, main page first', () => {
    const list = tabs('a', 'm', 's', 'c');
    expect(order(arrangeTabUnits(list, ['m', 's'], ['m', 's'], ['a'], 'before'))).toEqual(['m', 's', 'a', 'c']);
    expect(order(arrangeTabUnits(list, ['m', 's'], ['s'], ['c'], 'swap'))).toEqual(['a', 'c', 'm', 's']);
    expect(order(arrangeTabUnits(list, ['m', 's'], ['c'], ['m', 's'], 'before'))).toEqual(['a', 'c', 'm', 's']);
  });

  it('places a group at its main page even when the side tab comes first', () => {
    expect(order(arrangeTabUnits(tabs('s', 'a', 'm'), ['m', 's'], ['a'], null, 'before'))).toEqual(['m', 's', 'a']);
  });
});
