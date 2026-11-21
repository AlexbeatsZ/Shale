import { test, expect } from './test';

test.beforeEach(async ({ page }) => {
  await page.goto('/__render-test');
  await page.waitForFunction(() => !!window.renderHarness);
  await page.evaluate(() => window.renderHarness.reset('first line\n\nlast line'));
  await expect(page.locator('[data-slot="0"] .cm-content')).toContainText('last line');
});

test('a trackpad click right after typing keeps the caret and focus, later clicks work', async ({ page }) => {
  await page.evaluate(async () => {
    const { installTypingPointerGuard } = await import('/src/lib/typingPointerGuard.ts');
    (window as unknown as { stopGuard: () => void }).stopGuard = installTypingPointerGuard(window, 400);
    window.renderHarness.cursor(0, 'first line\n\nlast line'.length);
    window.renderHarness.focus(0);
  });
  const firstLine = page.locator('[data-slot="0"] .cm-line').first();
  await page.keyboard.type('!');
  await firstLine.click({ position: { x: 1, y: 4 } });
  expect(await page.evaluate(() => window.renderHarness.source(0))).toBe('first line\n\nlast line!');
  expect(await page.evaluate(() => window.renderHarness.location(0)?.anchor)).toBe('first line\n\nlast line!'.length);
  await expect(page.locator('[data-slot="0"] .cm-content')).toBeFocused();

  await page.waitForTimeout(450);
  await firstLine.click({ position: { x: 1, y: 4 } });
  await expect.poll(() => page.evaluate(() => window.renderHarness.location(0)?.anchor)).toBe(0);

  // Shortcuts are not typing, and a modifier click stays deliberate.
  await page.keyboard.press('End');
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(450);
  await page.keyboard.press('ArrowRight');
  await firstLine.click({ position: { x: 1, y: 4 }, modifiers: ['Shift'] });
  await expect.poll(() => page.evaluate(() => window.renderHarness.location(0)?.head)).toBe(0);
  await page.evaluate(() => (window as unknown as { stopGuard: () => void }).stopGuard());
});
