// 以真實 CLI 跑完整條流程：init → start → 各 gate → confirm → run → report。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash } from '../lib/io.mjs';
import * as fx from './fixtures.mjs';

const CLI = fileURLToPath(new URL('../bin/qa.mjs', import.meta.url));

const makeProject = () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-cli-'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'test'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'demo', type: 'module' }));
  writeFileSync(join(root, 'src/login.mjs'), 'export const login = (pw) => (pw === "secret" ? 200 : 401);\n');
  writeFileSync(join(root, 'test/login.test.mjs'), [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { login } from '../src/login.mjs';",
    "test('錯誤密碼被拒絕', () => assert.equal(login('nope'), 401));",
    ''
  ].join('\n'));
  return root;
};

// node --test 會設定 NODE_TEST_CONTEXT，讓子行程的 node --test 不輸出 reporter 檔案，必須移除。
const { NODE_TEST_CONTEXT, ...cleanEnv } = process.env;

const qa = (root, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', env: cleanEnv });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

const ok = (res) => {
  assert.equal(res.code, 0, res.out);
  return res;
};

const runDir = (root) => join(root, '.qa/runs', readFileSync(join(root, '.qa/current'), 'utf8').trim());
const put = (root, name, data) => writeFileSync(join(runDir(root), `${name}.json`), JSON.stringify(data, null, 2));
const putFeature = (root, text = fx.FEATURE) => {
  mkdirSync(join(runDir(root), 'design/features'), { recursive: true });
  writeFileSync(join(runDir(root), 'design/features/login.feature'), text);
  // demo 中的 TC-1 對應 test/login.test.mjs 裡同名的測試
};
const stage = (root) => JSON.parse(readFileSync(join(runDir(root), 'state.json'), 'utf8')).stage;

const setupUntilConfirm = (root) => {
  ok(qa(root, 'init'));
  const configPath = join(root, '.qa/config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  writeFileSync(configPath, JSON.stringify({
    ...config,
    layers: {
      unit: {
        // 不加引號，讓 shell 展開 glob：Node 20 的 --test 不支援 glob 參數
        command: 'node --test --test-reporter=junit --test-reporter-destination=.qa/tmp/unit-junit.xml test/*.test.mjs',
        junit: '.qa/tmp/unit-junit.xml'
      }
    }
  }));
  ok(qa(root, 'start', '--scope', '登入功能'));
  put(root, 'context', fx.context());
  ok(qa(root, 'gate', 'context'));
  put(root, 'risks', fx.risks());
  ok(qa(root, 'gate', 'risk'));
  put(root, 'design', fx.design());
  putFeature(root);
  ok(qa(root, 'gate', 'cases'));
  assert.equal(stage(root), 'confirm');
  const review = readFileSync(join(runDir(root), 'cases-review.html'), 'utf8');
  ['overview', 'matrix', 'state', 'prototype', 'acceptance', 'bdd'].forEach((id) => assert.match(review, new RegExp(`data-page="${id}"`)));
  assert.match(review, /錯誤密碼被拒絕/);
  const derived = JSON.parse(readFileSync(join(runDir(root), 'cases.json'), 'utf8'));
  assert.deepEqual(derived.cases.map((c) => c.id), ['TC-1', 'TC-2']);
};

test('完整流程可以走到 done 並產出報告', () => {
  const root = makeProject();
  setupUntilConfirm(root);

  const early = qa(root, 'gate', 'scripts');
  assert.equal(early.code, 1);
  assert.match(early.out, /confirm/);

  ok(qa(root, 'confirm', '--by', 'tester'));
  assert.equal(stage(root), 'scripts');

  const hash = JSON.parse(readFileSync(join(runDir(root), 'confirmation.json'), 'utf8')).designHash;
  assert.match(readFileSync(join(runDir(root), 'cases-review.html'), 'utf8'), /stamp confirmed/);
  // planner：證據檔與分檔計畫，再由 CLI 合併
  mkdirSync(join(root, 'evidence'), { recursive: true });
  writeFileSync(join(root, 'evidence/login.md'), '# 登入\n');
  mkdirSync(join(runDir(root), 'plan'), { recursive: true });
  writeFileSync(join(runDir(root), 'plan/login.feature.json'), JSON.stringify({ version: 1, feature: 'login.feature', entries: [fx.planEntry()] }));
  assert.match(ok(qa(root, 'plan-merge')).out, /可自動化 1/);
  // fixture 的測試檔路徑是虛構的，這裡換成實際存在的檔案
  put(root, 'tasks', { ...fx.tasks(hash), tasks: [{ ...fx.tasks(hash).tasks[0], file: 'test/login.test.mjs' }] });
  ok(qa(root, 'gate', 'scripts'));

  const run = ok(qa(root, 'run'));
  assert.match(run.out, /passed/);
  const results = JSON.parse(readFileSync(join(runDir(root), 'results.json'), 'utf8'));
  assert.equal(results.results[0].status, 'passed');
  assert.equal(results.attempts, 1);
  // 防假綠檢查的結果由 qa-run 寫入
  put(root, 'results', { ...results, oracleAudit: [{ taskId: 'T-1', mutation: '401 改成 200', turnedRed: true }] });

  ok(qa(root, 'gate', 'run'));
  const noChecks = qa(root, 'gate', 'review');
  assert.equal(noChecks.code, 1);
  assert.match(noChecks.out, /review-checks/);
  const checksOut = ok(qa(root, 'review-checks'));
  assert.match(checksOut.out, /確定性檢查全部通過/);
  const checks = JSON.parse(readFileSync(join(runDir(root), 'review-checks.json'), 'utf8'));
  assert.ok(checks.scope.files.some((f) => f.path === 'test/login.test.mjs'));
  assert.ok(existsSync(join(root, checks.scope.diffFile)));
  const pending = qa(root, 'review-merge');
  assert.equal(pending.code, 1);
  assert.match(pending.out, /待審 chunk 1/);
  const dims = Object.fromEntries(['fidelity', 'reliability', 'style', 'productRisk', 'maintainability'].map((d) => [d, { score: 18, note: 'ok' }]));
  writeFileSync(join(runDir(root), 'review/chunk-1.json'), JSON.stringify({
    version: 1, chunk: 1, checksHash: canonicalHash(checks), breakdown: dims, strengths: ['精簡'], findings: [], suggestions: []
  }));
  assert.match(ok(qa(root, 'review-merge')).out, /APPROVE 90\/100/);
  ok(qa(root, 'gate', 'review'));

  const report = ok(qa(root, 'report'));
  assert.match(report.out, /有條件可發布/);
  assert.equal(stage(root), 'done');
  assert.ok(existsSync(join(runDir(root), 'report.html')));
  assert.ok(existsSync(join(root, '.qa/reports/latest.html')));
  assert.match(readFileSync(join(runDir(root), 'report.html'), 'utf8'), /TC-1/);
});

test('確認後修改用例，腳本階段的 gate 會擋下', () => {
  const root = makeProject();
  setupUntilConfirm(root);
  ok(qa(root, 'confirm', '--by', 'tester'));

  putFeature(root, fx.FEATURE.replace('"401"', '"403"'));
  const res = qa(root, 'gate', 'scripts');
  assert.equal(res.code, 1);
  assert.match(res.out, /確認後被修改/);
});

test('階段不符時 gate 會拒絕', () => {
  const root = makeProject();
  ok(qa(root, 'init'));
  ok(qa(root, 'start', '--scope', 'x'));
  const res = qa(root, 'gate', 'risk');
  assert.equal(res.code, 1);
  assert.match(res.out, /context/);
});

test('沒有 init 就 start 會提示', () => {
  const res = qa(makeProject(), 'start');
  assert.equal(res.code, 1);
  assert.match(res.out, /qa init/);
});

test('BDD 專案：放進專案的 feature 被改動時 scripts gate 會擋下', () => {
  const root = makeProject();
  setupUntilConfirm(root);
  const configPath = join(root, '.qa/config.json');
  writeFileSync(configPath, JSON.stringify({ ...JSON.parse(readFileSync(configPath, 'utf8')), bdd: { framework: 'x', featuresDir: 'features' } }));
  ok(qa(root, 'confirm', '--by', 'tester'));
  const hash = JSON.parse(readFileSync(join(runDir(root), 'confirmation.json'), 'utf8')).designHash;
  put(root, 'tasks', { ...fx.tasks(hash), tasks: [{ ...fx.tasks(hash).tasks[0], file: 'test/login.test.mjs' }] });
  mkdirSync(join(root, 'evidence'), { recursive: true });
  writeFileSync(join(root, 'evidence/login.md'), '# 登入\n');
  put(root, 'plan', fx.plan(hash));

  mkdirSync(join(root, 'features'));
  writeFileSync(join(root, 'features/login.feature'), fx.FEATURE.replace('"401"', '"200"'));
  const bad = qa(root, 'gate', 'scripts', '--check');
  assert.equal(bad.code, 1);
  assert.match(bad.out, /TC-1「錯誤密碼被拒絕」與確認的內容不一致/);

  writeFileSync(join(root, 'features/login.feature'), fx.FEATURE);
  ok(qa(root, 'gate', 'scripts', '--check'));
});

test('feature 語法錯誤時 cases gate 回報 file:line', () => {
  const root = makeProject();
  ok(qa(root, 'init'));
  ok(qa(root, 'start'));
  put(root, 'context', fx.context());
  ok(qa(root, 'gate', 'context'));
  put(root, 'risks', fx.risks());
  ok(qa(root, 'gate', 'risk'));
  put(root, 'design', fx.design());
  putFeature(root, fx.FEATURE.replace('@登入頁面 @regression @auto @密碼錯誤', '@auto @P0'));
  const res = qa(root, 'gate', 'cases');
  assert.equal(res.code, 1);
  assert.match(res.out, /login\.feature:11 .*@regression/);
  assert.match(res.out, /login\.feature:11 .*@P0/);
});
