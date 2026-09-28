// 測試共用的最小合法產物，各測試以展開覆寫需要的欄位。
export const context = () => ({
  version: 1,
  scope: { summary: '登入功能', sources: [{ type: 'text', ref: '使用者描述' }] },
  changes: [{ path: 'src/login.js', kind: 'modified' }],
  existingTests: [],
  integrations: [{ name: 'issue-tracker', available: false }]
});

export const risks = () => ({
  version: 1,
  risks: [
    { id: 'R-1', title: '密碼錯誤仍可登入', level: 'P0', area: '登入', impact: '帳號被盜', evidence: ['src/login.js:12'] },
    { id: 'R-2', title: '錯誤訊息不清楚', level: 'P2', area: '登入', impact: '體驗差', evidence: ['需求描述'] }
  ]
});

export const TECHNIQUES = [
  'equivalence', 'boundary', 'decision-table', 'path', 'state-transition', 'role-permission',
  'data-lifecycle', 'pairwise', 'error-guessing', 'concurrency', 'dependency-failure', 'environment'
];

const techniqueChecklist = () => TECHNIQUES.map((technique) =>
  technique === 'path'
    ? { technique, applicable: true, caseIds: ['TC-1', 'TC-2'] }
    : { technique, applicable: false, reason: '範例不適用' });

export const FEATURE = `# 註：登入相關情境
Feature: 登入
  作為一個訪客
  我想要登入
  以便查看我的訂單

  # ############################################
  # 密碼驗證
  # ############################################
  @登入頁面 @regression @auto @密碼錯誤
  Scenario: 錯誤密碼被拒絕
    Given 帳號 "amy" 存在
    When 我以錯誤密碼登入
    Then 系統回傳 "401"

  @登入頁面 @regression @錯誤訊息文案
  Scenario: 錯誤訊息文案
    When 我輸入錯誤密碼
    Then 顯示 "帳號或密碼錯誤"
`;

export const scenarioIndex = () => [
  { id: 'TC-1', file: 'login.feature', title: '錯誤密碼被拒絕', priority: 'P0', riskIds: ['R-1'], type: 'negative' },
  { id: 'TC-2', file: 'login.feature', title: '錯誤訊息文案', priority: 'P2', riskIds: ['R-2'], type: 'ui' }
];

export const design = () => ({
  version: 1,
  scenarios: scenarioIndex(),
  matrices: [{
    id: 'M-1', title: '密碼輸入', technique: 'path', columns: ['輸入', '預期'],
    rows: [{ cells: ['錯誤密碼', '拒絕'], caseIds: ['TC-1'] }]
  }],
  stateMachine: { states: [], transitions: [] },
  coverage: { techniques: techniqueChecklist() },
  prototype: { skipReason: '純 API，沒有畫面' },
  selfReview: { score: 90, rounds: 1 }
});

const baseCase = {
  feature: '登入', file: 'login.feature', line: 11, tags: ['@登入頁面', '@regression'], labels: ['@登入頁面'],
  preconditions: [], smoke: false, boundary: false, section: '密碼驗證'
};

export const cases = () => [
  { ...baseCase, id: 'TC-1', title: '錯誤密碼被拒絕', priority: 'P0', riskIds: ['R-1'], type: 'negative', manual: false,
    preconditions: ['帳號 "amy" 存在'], steps: ['以錯誤密碼登入'], expected: ['回傳 401'] },
  { ...baseCase, id: 'TC-2', title: '錯誤訊息文案', priority: 'P2', riskIds: ['R-2'], type: 'ui', manual: true, line: 12,
    steps: ['輸入錯誤密碼'], expected: ['顯示「帳號或密碼錯誤」'] }
];

// 模擬 loadDesign 的回傳值
export const loaded = (overrides = {}) => ({
  design: design(),
  cases: cases(),
  errors: [],
  files: [{ file: 'login.feature' }],
  prototypeExists: false,
  designHash: 'a'.repeat(64),
  ...overrides
});

export const tasks = (designHash) => ({
  version: 1,
  designHash,
  tasks: [{ id: 'T-1', caseId: 'TC-1', layer: 'unit', file: 'test/login.test.js', testName: '錯誤密碼被拒絕' }]
});

export const results = (overrides = {}) => ({
  version: 1,
  attempts: 1,
  executions: [{ attempt: 1, layer: 'unit', command: 'npm test', exitCode: 0, log: 'logs/a.log', junit: null }],
  results: [{ taskId: 'T-1', status: 'passed' }],
  oracleAudit: [{ taskId: 'T-1', mutation: '401 改成 200', turnedRed: true }],
  ...overrides
});

export const planEntry = (overrides = {}) => ({
  caseId: 'TC-1', feasibility: 'AUTOMATABLE', probed: true, evidence: 'evidence/login.md#tc-1',
  oracles: [{ then: '系統回傳 "401"', observable: true, locator: "getByTestId('login-error')" }],
  ...overrides
});

export const plan = (designHash, entries = [planEntry()]) => ({ version: 1, designHash, entries });

export const reviewChecks = (passed = true) => ({
  version: 1, ranAt: '2026-01-01T00:00:00Z', passed,
  checks: [{ name: 'features', status: 'pass' }, { name: 'coding-style-scan', status: passed ? 'pass' : 'fail' }],
  scan: { files: ['test/login.test.js'], hits: [] },
  scope: { files: [{ path: 'test/login.test.js', kind: 'test', lines: 10 }], diffFile: 'review/review.diff', diffLines: 10, chunks: [{ id: 1, diffFile: 'review/chunk-1.diff', lines: 10, files: ['test/login.test.js'], features: ['design/features/login.feature'] }] }
});

const dims = (score) => Object.fromEntries(['fidelity', 'reliability', 'style', 'productRisk', 'maintainability']
  .map((d) => [d, { score, note: '說明' }]));

// score 由各維度加總；verdict 依規則推導
export const review = (findings = [], { perDimension = 18, verdict = 'APPROVE', checksHash = 'a'.repeat(64) } = {}) => ({
  version: 1, checksHash, score: perDimension * 5, breakdown: dims(perDimension), verdict,
  summary: '無重大問題', strengths: ['step 保持精簡'], findings, suggestions: []
});

export const config = () => ({
  version: 1,
  language: 'zh-TW',
  layers: { unit: { command: 'npm test' } },
  repair: { maxLoops: 3, allowedPaths: ['test/**'] },
  report: { dir: '.qa/reports' }
});
