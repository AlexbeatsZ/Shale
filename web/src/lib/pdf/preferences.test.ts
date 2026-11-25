import { expect, it } from 'vitest';
import { pdfDarkPreference, restorePdfDarkPreferences } from './preferences';

it('defaults PDFs on and honors remembered off without changing presentation defaults', () => {
  expect(pdfDarkPreference('中文/A.PDF', {})).toBe(true);
  expect(pdfDarkPreference('A.pptx', {})).toBe(false);
  expect(pdfDarkPreference('A.pdf', { 'A.pdf': false })).toBe(false);
});

it('migrates old enabled paths, with explicit booleans taking priority', () => {
  expect(restorePdfDarkPreferences({ pdfDarkPaths: ['a.pdf', 4, 'slides.pptx'],
    pdfDarkOverrides: { 'a.pdf': false, 'b.pdf': true, invalid: 'yes' } })).toEqual({ 'a.pdf': false, 'b.pdf': true, 'slides.pptx': true });
});
