import { expect, it } from 'vitest';
import { clampPdfZoom, wheelPixels } from './zoom';

it('bounds PDF page zoom and normalizes mouse and touchpad wheel units', () => {
  expect(clampPdfZoom(0.1)).toBe(0.5);
  expect(clampPdfZoom(5)).toBe(3);
  expect(clampPdfZoom(1.23456)).toBe(1.235);
  expect(wheelPixels({ deltaY: 4, deltaMode: 0 })).toBe(4);
  expect(wheelPixels({ deltaY: -3, deltaMode: 1 })).toBe(-48);
  expect(wheelPixels({ deltaY: 1, deltaMode: 2 })).toBe(800);
});
