import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../lib/verdict.mjs';
import * as fx from './fixtures.mjs';

const base = (overrides = {}) => {
  const c = { version: 1, cases: fx.cases() };
  return {
    risks: fx.risks(),
    cases: c,
    tasks: fx.tasks('a'.repeat(64)),
    results: fx.results(),
    review: fx.review(),
    ...overrides
  };
};

test('全部自動化通過但仍有 manual 用例 → 有條件可發布', () => {
  const s = summarize(base());
  assert.equal(s.caseStatus['TC-1'], 'passed');
  assert.equal(s.caseStatus['TC-2'], 'manual');
  assert.equal(s.verdict, 'conditional');
});

test('全部通過且無 manual → 可發布', () => {
  const onlyAuto = { version: 1, cases: [fx.cases()[0]] };
  const risks = { ...fx.risks(), risks: [fx.risks().risks[0]] };
  assert.equal(summarize(base({ cases: onlyAuto, risks })).verdict, 'go');
});

test('P0 用例失敗 → 不可發布', () => {
  const results = fx.results({ results: [{ taskId: 'T-1', status: 'failed', classification: 'product-defect', reason: 'x' }] });
  const s = summarize(base({ results }));
  assert.equal(s.verdict, 'no-go');
  assert.ok(s.reasons.some((r) => r.includes('TC-1')));
});

test('代碼審查 BLOCK 或 critical 問題 → 不可發布；APPROVE_WITH_FIXES → 有條件', () => {
  const critical = fx.review([{ id: 'F-1', severity: 'critical', category: 'product-risk', title: 'SQL injection', file: 'a.js' }], { verdict: 'BLOCK' });
  assert.equal(summarize(base({ review: critical })).verdict, 'no-go');
  const c = fx.cases();
  const onlyAuto = { version: 1, cases: [c[0]] };
  const risks = { ...fx.risks(), risks: [fx.risks().risks[0]] };
  const withFixes = fx.review([], { perDimension: 13, verdict: 'APPROVE_WITH_FIXES' });
  assert.equal(summarize(base({ cases: onlyAuto, risks, review: withFixes })).verdict, 'conditional');
});

test('缺少 results 或 review → 未完成', () => {
  assert.equal(summarize(base({ results: null })).verdict, 'incomplete');
  assert.equal(summarize(base({ review: null })).verdict, 'incomplete');
});

test('風險覆蓋率統計', () => {
  const s = summarize(base());
  assert.equal(s.stats.risks.total, 2);
  assert.equal(s.stats.risks.covered, 2);
  assert.equal(s.riskOutcome['R-1'], 'passed');
});

test('無法自動化的 P0 情境 → 有條件可發布，並說明原因', () => {
  const c = fx.cases();
  const onlyAuto = { version: 1, cases: [c[0]] };
  const risks = { ...fx.risks(), risks: [fx.risks().risks[0]] };
  const plan = fx.plan('a'.repeat(64), [fx.planEntry({ feasibility: 'NOT_FEASIBLE', reason: '需要真實簡訊驗證碼' })]);
  const s = summarize(base({ cases: onlyAuto, risks, plan, tasks: { ...fx.tasks('a'.repeat(64)), tasks: [] }, results: fx.results({ results: [] }) }));
  assert.equal(s.caseStatus['TC-1'], 'infeasible');
  assert.equal(s.verdict, 'conditional');
  assert.match(s.reasons.join(), /需要真實簡訊驗證碼/);
});
