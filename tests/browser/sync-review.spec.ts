import { test, expect } from './test';

const local = '# 第三章 微扰理论\n\n一阶修正只需要求 ⟨n|H′|n⟩。\n\n## 例题\n\n谐振子加 x³ 微扰。\n\n## 小结\n\n只看一阶。\n';
const remote = '# 第三章 微扰理论\n\n一阶能量修正 E⁽¹⁾ = ⟨n|H′|n⟩，二阶要对 m ≠ n 求和。\n\n## 例题\n\n谐振子加 x³ 微扰。\n\n## 小结\n\n一阶看期望值，二阶看耦合。\n';

// A text sync conflict uses the MCP review presentation: red local lines, green server candidates, per-hunk accept/reject.
test('reviews a text sync conflict in the editor and resolves it with the reviewed text', async ({ page }) => {
  const resolved: unknown[] = [];
  await page.route('**/api/file-sync/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/resolve')) { resolved.push(route.request().postDataJSON()); return route.fulfill({ json: {} }); }
    const files = resolved.length ? [] : [{ path: 'a.md', conflictId: 'c1', localText: local, remoteText: remote, action: 'modify', hasBase: true,
      localChanged: true, remoteChanged: true, localSize: 1, remoteSize: 1, image: false, text: true, diff: [], truncated: false }];
    return route.fulfill({ json: { conflict: files.length ? { id: 'c1', files } : null } });
  });
  await page.goto('/__render-test');
  await page.waitForFunction(() => Boolean(window.renderHarness));
  await page.evaluate(source => window.renderHarness.reset(source), local);
  await page.evaluate(async () => {
    const { EditorView } = await import('/node_modules/.vite/deps/@codemirror_view.js');
    const { StateEffect } = await import('/node_modules/.vite/deps/@codemirror_state.js');
    const { reviewExtension } = await import('/src/lib/review/view.ts');
    const { syncReviewSource } = await import('/src/lib/review/sync.ts');
    const { refreshSyncConflicts } = await import('/src/lib/syncConflicts.ts');
    await refreshSyncConflicts();
    const view = EditorView.findFromDOM(document.querySelector('[data-slot="0"] .cm-editor')!);
    view.dispatch({ effects: StateEffect.appendConfig.of(reviewExtension('a.md', syncReviewSource)) });
  });
  const slot = page.locator('[data-slot="0"]');
  await expect(slot.locator('.native-review-bar')).toContainText('剩余 2 块');
  await expect(slot.locator('.native-review-candidate')).toHaveCount(2);
  await expect(slot.locator('.native-review-removed').first()).toContainText('一阶修正只需要求');
  await page.screenshot({ path: test.info().outputPath('sync-review.png') });
  await slot.locator('.native-review-candidate').first().getByRole('button', { name: '接受' }).click();
  await expect(slot.locator('.native-review-bar')).toContainText('剩余 1 块');
  await slot.locator('.native-review-candidate').first().getByRole('button', { name: '拒绝' }).click();
  await expect.poll(() => resolved).toEqual([{ choice: 'files', files: { 'a.md': 'merged' } }]);
  expect(await page.evaluate(() => window.renderHarness.source(0))).toBe(remote.replace('一阶看期望值，二阶看耦合。', '只看一阶。'));
  await expect(slot.locator('.native-review-bar')).toHaveCount(0);
});
