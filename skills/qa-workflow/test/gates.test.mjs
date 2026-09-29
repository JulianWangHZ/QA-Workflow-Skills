import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkContext, checkRisks, checkCases, checkConfirmation, checkTasks, checkResults, checkReview, checkProjectFeatures, checkPlan
} from '../lib/gates.mjs';
import { canonicalHash } from '../lib/io.mjs';
import * as fx from './fixtures.mjs';

const HASH = 'a'.repeat(64);
const confirmation = (designHash = HASH) => ({
  version: 1, confirmedAt: '2026-01-01T00:00:00Z', confirmedBy: 'tester', designHash, caseIds: ['TC-1', 'TC-2']
});
const withDesign = (patch) => fx.loaded({ design: { ...fx.design(), ...patch } });
const errorsOf = (loaded, cfg) => checkCases(loaded, fx.risks(), cfg).errors.join('\n');

test('context：範圍摘要不可空白', () => {
  assert.deepEqual(checkContext(fx.context()).errors, []);
  const blank = { ...fx.context(), scope: { summary: '   ', sources: [{ type: 'text', ref: 'x' }] } };
  assert.ok(checkContext(blank).errors.length > 0);
});

test('risks：id 不可重複', () => {
  assert.deepEqual(checkRisks(fx.risks()).errors, []);
  const r = fx.risks();
  assert.match(checkRisks({ ...r, risks: [...r.risks, { ...r.risks[0] }] }).errors.join(), /R-1/);
});

test('cases：合法設計通過', () => {
  assert.deepEqual(checkCases(fx.loaded(), fx.risks()).errors, []);
});

test('cases：沒有 feature 檔、feature 解析錯誤都擋下', () => {
  assert.match(errorsOf(fx.loaded({ files: [] })), /沒有任何 \.feature/);
  assert.match(errorsOf(fx.loaded({ errors: ['a.feature:3 缺少 @regression'] })), /a\.feature:3/);
});

test('cases：引用不存在的風險、P0/P1 風險未覆蓋都擋下', () => {
  const [c1, c2] = fx.cases();
  const errors = errorsOf(fx.loaded({ cases: [{ ...c1, riskIds: ['R-9'] }, c2] }));
  assert.match(errors, /R-9/);
  assert.match(errors, /R-1/);
});

test('cases：技法清單 12 項齊全，N/A 要有理由，適用要有 caseIds', () => {
  const t = fx.design().coverage.techniques;
  assert.match(errorsOf(withDesign({ coverage: { techniques: t.slice(1) } })), /equivalence/);
  const noReason = t.map((x) => (x.applicable ? x : { technique: x.technique, applicable: false }));
  assert.match(errorsOf(withDesign({ coverage: { techniques: noReason } })), /理由/);
  const ghost = t.map((x) => (x.applicable ? { ...x, caseIds: ['TC-99'] } : x));
  assert.match(errorsOf(withDesign({ coverage: { techniques: ghost } })), /TC-99/);
});

test('cases：矩陣每列都要有用例或 skipReason，欄位數要對齊', () => {
  const m = fx.design().matrices[0];
  const noCase = { ...m, rows: [{ cells: ['空密碼', '拒絕'] }] };
  assert.match(errorsOf(withDesign({ matrices: [noCase] })), /M-1.*skipReason/);
  const skipped = { ...m, rows: [{ cells: ['空密碼', '拒絕'], skipReason: '前端已阻擋' }] };
  assert.deepEqual(checkCases(withDesign({ matrices: [skipped] }), fx.risks()).errors, []);
  const badCells = { ...m, rows: [{ cells: ['只有一欄'], caseIds: ['TC-1'] }] };
  assert.match(errorsOf(withDesign({ matrices: [badCells] })), /欄位數/);
});

test('cases：狀態轉換每條邊都要有用例，適用時至少要有非法轉換', () => {
  const techniques = fx.design().coverage.techniques.map((t) =>
    t.technique === 'state-transition' ? { technique: t.technique, applicable: true, caseIds: ['TC-1'] } : t);
  const stateMachine = {
    states: ['未登入', '已登入'],
    transitions: [{ from: '未登入', to: '已登入', trigger: '正確密碼', valid: true, caseIds: [] }]
  };
  const errors = errorsOf(withDesign({ stateMachine, coverage: { techniques } }));
  assert.match(errors, /未登入 → 已登入/);
  assert.match(errors, /非法轉換/);
});

test('cases：原型要有 file 或 skipReason，file 必須存在，情境示範要引用存在的情境', () => {
  assert.match(errorsOf(withDesign({ prototype: {} })), /skipReason/);
  const withFile = { file: 'prototype.html', platform: 'app' };
  assert.match(errorsOf(withDesign({ prototype: withFile })), /原型檔不存在/);
  const html = (demo) => `<section class="screen" data-id="a"></section><script type="application/json" id="qa-scenarios">${demo}</script>`;
  const load = (demo) => fx.loaded({ design: { ...fx.design(), prototype: withFile }, prototypeHtml: html(demo), prototypeExists: true });
  const full = '[{"id":"TC-1","steps":[{"kind":"when","text":"x"}]},{"id":"TC-2","noUi":true,"reason":"文案檢查"}]';
  assert.deepEqual(checkCases(load(full), fx.risks()).errors, []);
  assert.match(checkCases(load('[{"id":"TC-9","steps":[{}]}]'), fx.risks()).errors.join(), /TC-9/);
  assert.match(checkCases(load('{oops'), fx.risks()).errors.join(), /JSON/);
  assert.match(checkCases(load('[{"id":"TC-1","steps":[{}]}]'), fx.risks()).errors.join(), /缺少這些情境的示範：TC-2/);
  assert.match(checkCases(load('[{"id":"TC-1","steps":[{}]},{"id":"TC-2","noUi":true}]'), fx.risks()).errors.join(), /reason/);
});

// 把 riskCoverage 再扣 20 分，總分變成 70
const lowScore = (rounds) => {
  const review = fx.selfReview();
  const riskCoverage = { ...review.breakdown.riskCoverage, score: 0, deductions: [...review.breakdown.riskCoverage.deductions, { ref: 'R-1', points: 16, reason: '只驗了一個密碼' }] };
  return { ...review, score: 74, rounds, breakdown: { ...review.breakdown, riskCoverage } };
};
const withReview = (patch) => withDesign({ selfReview: { ...fx.selfReview(), ...patch } });
const withDimension = (key, patch) => {
  const review = fx.selfReview();
  return withDesign({ selfReview: { ...review, breakdown: { ...review.breakdown, [key]: { ...review.breakdown[key], ...patch } } } });
};

test('cases：評分有核對紀錄與扣分依據時通過', () => {
  assert.deepEqual(checkCases(fx.loaded(), fx.risks(), fx.config()).errors, []);
});

test('cases：自審分數未達門檻會擋下，輪數用完只警告', () => {
  const cfg = fx.config();
  assert.match(errorsOf(withDesign({ selfReview: lowScore(1) }), cfg), /74/);
  const r = checkCases(withDesign({ selfReview: lowScore(3) }), fx.risks(), cfg);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.includes('74')));
});

test('cases：還沒評審（rounds 0）或缺少 breakdown 會擋下', () => {
  const { breakdown, ...unreviewed } = fx.selfReview();
  assert.match(errorsOf(withDesign({ selfReview: { ...unreviewed, score: 0, rounds: 0 } })), /尚未評審/);
  assert.match(errorsOf(withDesign({ selfReview: unreviewed })), /breakdown/);
});

test('cases：每個維度都要有，滿分要和評分標準一致', () => {
  const { concise, ...rest } = fx.selfReview().breakdown;
  assert.match(errorsOf(withReview({ breakdown: rest })), /concise/);
  assert.match(errorsOf(withReview({ breakdown: { ...fx.selfReview().breakdown, extra: concise } })), /extra/);
  assert.match(errorsOf(withDimension('stateMachine', { max: 20, score: 20 })), /stateMachine.*10/);
});

test('cases：維度分數必須等於滿分減扣分，總分必須等於各維度加總', () => {
  assert.match(errorsOf(withDimension('oracle', { score: 15 })), /oracle.*15.*13/);
  assert.match(errorsOf(withReview({ score: 95 })), /95.*90/);
});

test('cases：扣分超過維度上限時，分數以上限計算、最低為 0', () => {
  const vague = Array.from({ length: 6 }, (_, i) => ({ ref: i % 2 ? 'TC-1' : 'TC-2', points: 2, reason: '含糊的 Then' }));
  // oracle 最多扣 10：扣 12 仍然是 15 − 10 = 5
  const oracle = withDimension('oracle', { score: 5, deductions: vague });
  assert.doesNotMatch(errorsOf(oracle), /oracle/);
  // riskCoverage 扣 30 超過滿分 20：最低為 0
  const risks = [{ ref: 'R-1', points: 10, reason: '未覆蓋' }, { ref: 'R-2', points: 10, reason: '未覆蓋' }, { ref: 'R-1', points: 10, reason: '只有正向' }];
  assert.doesNotMatch(errorsOf(withDimension('riskCoverage', { score: 0, deductions: risks })), /riskCoverage\.score/);
});

test('cases：沒有核對紀錄就擋下', () => {
  assert.match(errorsOf(withDimension('bdd', { checked: [] })), /bdd/);
});

test('cases：核對與扣分只能引用存在的情境、風險、矩陣', () => {
  assert.match(errorsOf(withDimension('riskCoverage', { checked: ['R-9 → TC-1'] })), /R-9/);
  assert.match(errorsOf(withDimension('oracle', { deductions: [{ ref: 'TC-99', points: 2, reason: 'x' }] })), /TC-99/);
  assert.match(errorsOf(withDimension('grounding', { checked: ['看起來都合理'] })), /grounding.*看起來都合理/);
});

// TC-1 與 M-1 被移除後，評審紀錄只能引用還存在的東西
const onlyTc2Review = () => {
  const review = fx.selfReview();
  const retarget = (text) => text.replaceAll('TC-1', 'TC-2').replaceAll('M-1', 'R-2');
  const breakdown = Object.fromEntries(Object.entries(review.breakdown).map(([key, dim]) => [key, { ...dim, checked: dim.checked.map(retarget) }]));
  return { ...review, breakdown };
};

test('cases：P0/P1 風險延後處理需寫理由，並產生警告', () => {
  const [, c2] = fx.cases();
  const design = { ...fx.design(), matrices: [], coverage: { techniques: fx.design().coverage.techniques.map((t) => (t.applicable ? { ...t, caseIds: ['TC-2'] } : t)), deferredRisks: [{ riskId: 'R-1', reason: '需求未定' }] }, selfReview: onlyTc2Review() };
  const r = checkCases(fx.loaded({ design, cases: [c2] }), fx.risks());
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.includes('R-1')));
});

test('confirmation：hash 不符即失效', () => {
  assert.deepEqual(checkConfirmation(confirmation(), HASH).errors, []);
  assert.match(checkConfirmation(confirmation(), 'b'.repeat(64)).errors.join(), /確認後被修改/);
  assert.match(checkConfirmation(null, HASH).errors.join(), /尚未確認/);
});

test('tasks：hash 對得上、每個非 manual 用例都有 task、檔案存在', () => {
  const exists = () => true;
  assert.deepEqual(checkTasks(fx.tasks(HASH), fx.cases(), confirmation(), HASH, exists).errors, []);
  assert.match(checkTasks(fx.tasks('b'.repeat(64)), fx.cases(), confirmation(), HASH, exists).errors.join(), /designHash/);
  assert.match(checkTasks({ ...fx.tasks(HASH), tasks: [] }, fx.cases(), confirmation(), HASH, exists).errors.join(), /TC-1/);
  assert.match(checkTasks(fx.tasks(HASH), fx.cases(), confirmation(), HASH, () => false).errors.join(), /不存在/);
  assert.match(checkTasks(fx.tasks(HASH), fx.cases(), confirmation(), 'c'.repeat(64), exists).errors.join(), /確認後被修改/);
});

test('project features：以標題對應，內容必須與確認一致', () => {
  const confirmed = fx.cases();
  const same = { errors: [], scenarios: confirmed.map((c) => ({ ...c, file: 'x.feature', line: 99 })) };
  assert.deepEqual(checkProjectFeatures(same, confirmed, 'features').errors, []);
  const changed = { errors: [], scenarios: [{ ...confirmed[0], expected: ['回傳 200'] }] };
  assert.match(checkProjectFeatures(changed, confirmed, 'features').errors.join(), /不一致/);
  assert.match(checkProjectFeatures({ errors: [], scenarios: [] }, confirmed, 'features').errors.join(), /找不到 TC-1/);
});

test('results：not-run、缺分類、修復次數未用完的 test-defect 都擋下', () => {
  const t = fx.tasks(HASH);
  const cfg = fx.config();
  assert.deepEqual(checkResults(fx.results(), t, cfg).errors, []);
  assert.match(checkResults(fx.results({ results: [{ taskId: 'T-1', status: 'not-run' }] }), t, cfg).errors.join(), /not-run/);
  assert.match(checkResults(fx.results({ results: [{ taskId: 'T-1', status: 'failed' }] }), t, cfg).errors.join(), /classification/);
  const testDefect = fx.results({ results: [{ taskId: 'T-1', status: 'failed', classification: 'test-defect', reason: 'x' }] });
  assert.match(checkResults(testDefect, t, cfg).errors.join(), /修復/);
  const r = checkResults({ ...testDefect, attempts: 4, oracleAudit: [] }, t, cfg);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.length > 0);
  assert.match(checkResults(fx.results({ results: [] }), t, cfg).errors.join(), /T-1/);
});

test('review：checksHash、分數加總與 verdict 規則', () => {
  const checks = fx.reviewChecks();
  const hash = canonicalHash(checks);
  const ok = fx.review([], { checksHash: hash });
  assert.deepEqual(checkReview(ok, checks).errors, []);
  assert.match(checkReview(ok, null).errors.join(), /review-checks/);
  assert.match(checkReview(fx.review([], { checksHash: 'b'.repeat(64) }), checks).errors.join(), /checksHash/);
  assert.match(checkReview({ ...ok, score: 99 }, checks).errors.join(), /加總/);
  // 分數 65 → APPROVE_WITH_FIXES；55 → BLOCK
  assert.match(checkReview(fx.review([], { perDimension: 13, checksHash: hash }), checks).errors.join(), /APPROVE_WITH_FIXES/);
  assert.deepEqual(checkReview(fx.review([], { perDimension: 11, verdict: 'BLOCK', checksHash: hash }), checks).errors, []);
});

test('review：確定性檢查失敗或有 critical 問題時一票否決為 BLOCK', () => {
  const failed = fx.reviewChecks(false);
  const hash = canonicalHash(failed);
  assert.match(checkReview(fx.review([], { checksHash: hash }), failed).errors.join(), /BLOCK.*確定性檢查未通過/);
  assert.deepEqual(checkReview(fx.review([], { checksHash: hash, verdict: 'BLOCK' }), failed).errors, []);
  const checks = fx.reviewChecks();
  const critical = { id: 'F-1', severity: 'critical', category: 'reliability', title: '假通過', file: 'a.js' };
  assert.match(checkReview(fx.review([critical], { checksHash: canonicalHash(checks) }), checks).errors.join(), /critical/);
  const dup = { id: 'F-1', severity: 'minor', category: 'style', title: 'x', file: 'a.js' };
  assert.match(checkReview(fx.review([dup, dup], { checksHash: canonicalHash(checks) }), checks).errors.join(), /F-1/);
});

test('plan：每個 @auto 情境都要有計畫，NOT_FEASIBLE 要有原因，證據檔要存在', () => {
  const conf = confirmation();
  const exists = () => true;
  assert.deepEqual(checkPlan(fx.plan(HASH), fx.cases(), conf, exists).errors, []);
  assert.match(checkPlan(fx.plan(HASH, []), fx.cases(), conf, exists).errors.join(), /TC-1 沒有自動化計畫/);
  assert.match(checkPlan(fx.plan(HASH, [fx.planEntry({ feasibility: 'NOT_FEASIBLE' })]), fx.cases(), conf, exists).errors.join(), /reason/);
  assert.match(checkPlan(fx.plan(HASH, [fx.planEntry({ feasibility: 'NEEDS_API_SETUP' })]), fx.cases(), conf, exists).errors.join(), /apiSetup/);
  assert.match(checkPlan(fx.plan(HASH), fx.cases(), conf, () => false).errors.join(), /證據檔不存在/);
  assert.match(checkPlan(fx.plan(HASH, [fx.planEntry(), fx.planEntry({ caseId: 'TC-2' })]), fx.cases(), conf, exists).errors.join(), /TC-2 不是 @auto/);
  assert.match(checkPlan(fx.plan(HASH, [fx.planEntry({ probed: false })]), fx.cases(), conf, exists).errors.join(), /沒有實際操作畫面/);
});

test('tasks：NOT_FEASIBLE 的情境不需要 task，也不應該有 task', () => {
  const conf = confirmation();
  const plan = fx.plan(HASH, [fx.planEntry({ feasibility: 'NOT_FEASIBLE', reason: '需要真實簡訊' })]);
  const noTasks = { ...fx.tasks(HASH), tasks: [] };
  assert.deepEqual(checkTasks(noTasks, fx.cases(), conf, HASH, () => true, plan).errors, []);
  assert.match(checkTasks(fx.tasks(HASH), fx.cases(), conf, HASH, () => true, plan).errors.join(), /NOT_FEASIBLE/);
});

test('results：通過的測試要有防假綠檢查，斷言改壞後沒轉紅就擋下', () => {
  const t = fx.tasks(HASH);
  const cfg = fx.config();
  assert.match(checkResults(fx.results({ oracleAudit: [] }), t, cfg).errors.join(), /防假綠/);
  const fake = fx.results({ oracleAudit: [{ taskId: 'T-1', mutation: '401 改成 200', turnedRed: false }] });
  assert.match(checkResults(fake, t, cfg).errors.join(), /疑似假綠/);
  assert.deepEqual(checkResults(fx.results({ oracleAudit: [] }), t, { ...cfg, run: { oracleAudit: false } }).errors, []);
});
