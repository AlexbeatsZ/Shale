import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installTypingPointerGuard } from './typingPointerGuard';

let target: EventTarget, seen: string[], dispose: () => void;
const types = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'contextmenu'];

function fire(type: string, timeStamp: number, fields: Record<string, unknown> = {}) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  Object.assign(event, { pointerType: 'mouse', pointerId: 1, key: 'a', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...fields });
  target.dispatchEvent(event);
  return event;
}
function press(timeStamp: number, fields: Record<string, unknown> = {}) {
  const down = fire('pointerdown', timeStamp, fields), mouse = fire('mousedown', timeStamp, fields);
  fire('pointerup', timeStamp + 60, fields); fire('mouseup', timeStamp + 60, fields); fire('click', timeStamp + 60, fields);
  return { down, mouse };
}

beforeEach(() => {
  vi.useFakeTimers();
  target = new EventTarget(); seen = [];
  dispose = installTypingPointerGuard(target as unknown as Window, 1000);
  for (const type of types) target.addEventListener(type, () => seen.push(type));
});
afterEach(() => { dispose(); vi.useRealTimers(); });

it('swallows a whole trackpad press inside the delay and prevents its focus default', () => {
  fire('keydown', 1000);
  const { down, mouse } = press(1500);
  expect(seen).toEqual([]);
  expect(mouse.defaultPrevented).toBe(true);
  expect(down.defaultPrevented).toBe(false);
});

it('lets presses through after the delay and for touch, pen or modifier clicks', () => {
  fire('keydown', 1000);
  press(2000); vi.runAllTimers();
  expect(seen).toEqual(['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
  seen = []; fire('keydown', 3000);
  press(3100, { pointerType: 'touch' }); press(3200, { pointerType: 'pen' }); press(3300, { metaKey: true }); press(3400, { shiftKey: true });
  expect(seen.filter(type => type === 'click')).toHaveLength(4);
});

it('ignores shortcuts and bare modifiers as typing', () => {
  fire('keydown', 1000, { key: 'Shift' }); fire('keydown', 1000, { key: 's', metaKey: true }); fire('keydown', 1000, { key: 'c', ctrlKey: true });
  press(1100);
  expect(seen).toContain('click');
});

it('ends the suppressed gesture after its trailing events and stops after disposal', () => {
  fire('keydown', 1000); press(1100);
  vi.runAllTimers();
  fire('click', 5000);
  expect(seen).toEqual(['click']);
  dispose(); seen = [];
  fire('keydown', 6000); press(6100);
  expect(seen).toContain('click');
});
