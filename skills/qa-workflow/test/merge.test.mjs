import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeReviewChunks, mergeTaskParts } from '../lib/merge.mjs';
import * as fx from './fixtures.mjs';

const chunk = (id, scores, findings = [], extra = {}) => ({
  version: 1, chunk: id, checksHash: 'a'.repeat(64),
  breakdown: Object.fromEntries(['fidelity', 'reliability', 'style', 'productRisk', 'maintainability']
    .map((d, i) => [d, { score: scores[i], note: `chunk ${id} ${d}` }])),
  strengths: ['共用的優點'], findings, suggestions: [], ...extra
});

test('mergeReviewChunks：各維度取最低分、問題去重後依嚴重度重新編號、verdict 依規則推導', () => {
  const minor = { severity: 'minor', category: 'style', title: '命名', file: 'b.ts', line: 3 };
  const important = { severity: 'important', category: 'reliability', title: '依賴順序', file: 'a.ts', line: 9 };
  const merged = mergeReviewChunks({
    chunks: [chunk(1, [18, 18, 18, 18, 18], [minor]), chunk(2, [16, 19, 17, 18, 20], [important, minor])],
    checks: fx.reviewChecks(), checksHash: 'a'.repeat(64)
  });
  assert.deepEqual(Object.values(merged.breakdown).map((d) => d.score), [16, 18, 17, 18, 18]);
  assert.equal(merged.score, 87);
  assert.equal(merged.verdict, 'APPROVE');
  assert.deepEqual(merged.findings.map((f) => [f.id, f.severity]), [['F-1', 'important'], ['F-2', 'minor']]);
  assert.deepEqual(merged.strengths, ['共用的優點']);
});

test('mergeReviewChunks：確定性檢查失敗時 verdict 為 BLOCK', () => {
  const merged = mergeReviewChunks({ chunks: [chunk(1, [20, 20, 20, 20, 20])], checks: fx.reviewChecks(false), checksHash: 'a'.repeat(64) });
  assert.equal(merged.verdict, 'BLOCK');
  assert.match(merged.summary, /確定性檢查未通過/);
});

test('mergeTaskParts：依 feature 排序後重新編號，並彙整共用檔案需求', () => {
  const { tasks, sharedRequests } = mergeTaskParts({
    designHash: 'd'.repeat(64),
    parts: [
      { version: 1, feature: 'lock.feature', tasks: [{ caseId: 'TC-6', layer: 'e2e', file: 'a', testName: 'x' }], sharedRequests: ['common.steps 加「我已登入」'] },
      { version: 1, feature: 'login.feature', tasks: [{ caseId: 'TC-1', layer: 'e2e', file: 'b', testName: 'y' }] }
    ]
  });
  assert.deepEqual(tasks.tasks.map((t) => [t.id, t.caseId]), [['T-1', 'TC-6'], ['T-2', 'TC-1']]);
  assert.equal(tasks.designHash, 'd'.repeat(64));
  assert.deepEqual(sharedRequests, ['[lock.feature] common.steps 加「我已登入」']);
});
