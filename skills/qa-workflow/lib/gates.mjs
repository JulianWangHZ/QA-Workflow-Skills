// 各階段的放行條件。全部是純函式：輸入已讀取的產物，輸出 { errors, warnings }。
import { validateArtifact } from './schema.mjs';
import { canonicalHash } from './io.mjs';
import { countPrototypeScreens, readPrototypeScenarios } from './design.mjs';
import { checkSelfReview } from './self-review.mjs';

export const TECHNIQUES = [
  'equivalence', 'boundary', 'decision-table', 'path', 'state-transition', 'role-permission',
  'data-lifecycle', 'pairwise', 'error-guessing', 'concurrency', 'dependency-failure', 'environment'
];

export const DEFAULT_CASE_DESIGN = { minReviewScore: 85, maxReviewRounds: 3 };

const result = (errors = [], warnings = []) => ({ errors, warnings });

// schema 不過就不做交叉檢查，避免在殘缺資料上誤報。
const withSchema = (name, value, check) => {
  if (value == null) return result([`缺少 ${name} 產物`]);
  const errors = validateArtifact(name, value);
  return errors.length > 0 ? result(errors) : check();
};

const duplicates = (ids) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

const isHighRisk = (risk) => risk.level === 'P0' || risk.level === 'P1';

export const checkContext = (context) =>
  withSchema('context', context, () => {
    const warnings = [];
    if (context.changes.length === 0 && context.scope.sources.every((s) => s.type === 'text')) {
      warnings.push('只有文字描述、沒有任何程式變更或文件來源，風險分析的依據可能不足');
    }
    if ((context.openQuestions ?? []).length > 0) {
      warnings.push(`有 ${context.openQuestions.length} 個待釐清問題，請在用例確認時一併提出`);
    }
    return result([], warnings);
  });

export const checkRisks = (risks) =>
  withSchema('risks', risks, () => {
    const errors = duplicates(risks.risks.map((r) => r.id)).map((id) => `風險 id 重複：${id}`);
    const warnings = risks.risks.length === 0 ? ['沒有辨識出任何風險，請確認範圍是否正確'] : [];
    return result(errors, warnings);
  });

const checkTechniques = (coverage, caseIds) => {
  const listed = coverage.techniques.map((t) => t.technique);
  const errors = [
    ...TECHNIQUES.filter((t) => !listed.includes(t)).map((t) => `技法清單缺少 ${t}（每項都要判定適用或 N/A）`),
    ...duplicates(listed).map((t) => `技法清單重複：${t}`)
  ];
  coverage.techniques.forEach((t) => {
    if (t.applicable) {
      if (!t.caseIds?.length) errors.push(`技法 ${t.technique} 標為適用，但沒有對應用例`);
      (t.caseIds ?? []).filter((id) => !caseIds.has(id))
        .forEach((id) => errors.push(`技法 ${t.technique} 引用不存在的用例 ${id}`));
    } else if (!t.reason?.trim()) {
      errors.push(`技法 ${t.technique} 標為 N/A，必須寫理由`);
    }
  });
  return { errors, warnings: [] };
};

const unknownIds = (ids, caseIds, where) =>
  (ids ?? []).filter((id) => !caseIds.has(id)).map((id) => `${where} 引用不存在的用例 ${id}`);

// 測試矩陣的每一列都是一個要驗證的維度組合：必須對應到用例，或寫明不測的理由。
const checkMatrices = (matrices, techniques, caseIds) => {
  const errors = duplicates(matrices.map((m) => m.id)).map((id) => `矩陣 id 重複：${id}`);
  const warnings = [];
  const notApplicable = new Set(techniques.filter((t) => !t.applicable).map((t) => t.technique));
  matrices.forEach((m) => {
    if (notApplicable.has(m.technique)) warnings.push(`矩陣 ${m.id} 使用 ${m.technique}，但技法清單標為 N/A`);
    m.rows.forEach((row, i) => {
      const where = `矩陣 ${m.id}「${m.title}」第 ${i + 1} 列（${row.cells[0]}）`;
      if (row.cells.length !== m.columns.length) errors.push(`${where} 欄位數 ${row.cells.length} 與表頭 ${m.columns.length} 不符`);
      if (!row.caseIds?.length && !row.skipReason?.trim()) errors.push(`${where} 沒有對應用例，也沒有 skipReason`);
      errors.push(...unknownIds(row.caseIds, caseIds, where));
    });
  });
  return { errors, warnings };
};

const checkStateMachine = (machine, techniques, caseIds) => {
  const errors = [];
  const warnings = [];
  const states = new Set(machine.states);
  machine.transitions.forEach((tr) => {
    const label = `狀態轉換 ${tr.from} → ${tr.to}（${tr.trigger}）`;
    if (tr.caseIds.length === 0) errors.push(`${label} 沒有對應用例`);
    errors.push(...unknownIds(tr.caseIds, caseIds, label));
    [tr.from, tr.to].filter((st) => !states.has(st)).forEach((st) => warnings.push(`${label} 的狀態「${st}」不在 states 中`));
  });
  const stateTechnique = techniques.find((t) => t.technique === 'state-transition');
  if (stateTechnique?.applicable) {
    if (machine.transitions.length === 0) errors.push('state-transition 標為適用，但 stateMachine.transitions 是空的');
    else if (!machine.transitions.some((tr) => !tr.valid)) {
      errors.push('state-transition 標為適用，但沒有列出任何非法轉換（valid: false）');
    }
  }
  return { errors, warnings };
};

const checkPrototype = (prototype, prototypeHtml, caseIds) => {
  // 原型一律必做（app 與 web 都是），沒有設計稿或程式碼時依需求畫線框；skipReason 不再接受
  if (!prototype.file || !prototype.platform) {
    const hint = prototype.skipReason?.trim() ? `（不接受 skipReason「${prototype.skipReason.trim()}」）` : '';
    return { errors: [`原型一律必做，prototype 需要 file 與 platform${hint}`], warnings: [] };
  }
  if (prototypeHtml == null) return { errors: [`原型檔不存在：design/${prototype.file}`], warnings: [] };
  const errors = [];
  const warnings = [];
  if (countPrototypeScreens(prototypeHtml) === 0) errors.push('原型中沒有任何 <section class="screen"> 畫面');
  const { scenarios, error } = readPrototypeScenarios(prototypeHtml);
  if (error) return { errors: [...errors, `原型：${error}`], warnings };
  scenarios.forEach((sc, i) => {
    if (!sc?.id || !caseIds.has(sc.id)) errors.push(`原型情境示範第 ${i + 1} 筆引用不存在的情境 ${sc?.id ?? '（缺少 id）'}`);
    if (sc?.noUi) {
      if (!sc.reason?.trim()) errors.push(`原型情境示範 ${sc.id} 標為 noUi，必須寫 reason（為什麼沒有畫面可以示範）`);
    } else if (!Array.isArray(sc?.steps) || sc.steps.length === 0) {
      errors.push(`原型情境示範 ${sc?.id ?? i + 1} 沒有 steps`);
    }
  });
  // 每個情境都要有示範；真的沒有畫面的情境用 noUi + reason 說明
  const demoed = new Set(scenarios.map((sc) => sc?.id));
  const missing = [...caseIds].filter((id) => !demoed.has(id));
  if (missing.length > 0) errors.push(`原型缺少這些情境的示範：${missing.join('、')}（沒有畫面的情境請加 { "id", "noUi": true, "reason" }）`);
  duplicates(scenarios.map((sc) => sc?.id).filter(Boolean)).forEach((id) => errors.push(`原型情境示範重複：${id}`));
  return { errors, warnings };
};

const checkRiskCoverage = (cases, risks, deferred) => {
  const errors = [];
  const warnings = [];
  const riskIds = new Set(risks.risks.map((r) => r.id));
  cases.forEach((c) => c.riskIds.filter((id) => !riskIds.has(id))
    .forEach((id) => errors.push(`用例 ${c.id} 引用不存在的風險 ${id}`)));

  const covered = new Set(cases.flatMap((c) => c.riskIds));
  const deferredIds = new Map(deferred.map((d) => [d.riskId, d.reason]));
  risks.risks.filter(isHighRisk).forEach((risk) => {
    if (covered.has(risk.id)) {
      const hasNonHappy = cases.some((c) => c.riskIds.includes(risk.id) && c.type !== 'positive');
      if (!hasNonHappy) warnings.push(`${risk.level} 風險 ${risk.id} 只有正向用例，建議補負向/邊界/例外情境`);
    } else if (deferredIds.has(risk.id)) {
      warnings.push(`${risk.level} 風險 ${risk.id} 延後處理：${deferredIds.get(risk.id)}`);
    } else {
      errors.push(`${risk.level} 風險 ${risk.id}「${risk.title}」沒有任何用例覆蓋，也未寫入 deferredRisks`);
    }
  });
  return { errors, warnings };
};

// loaded 來自 design.mjs 的 loadDesign：{ design, cases, errors（feature 解析錯誤）, files, prototypeExists }
export const checkCases = (loaded, risks, config = {}) =>
  withSchema('design', loaded.design, () => {
    if (loaded.files.length === 0) return result(['design/features/ 下沒有任何 .feature 檔']);
    if (loaded.errors.length > 0) return result(loaded.errors);
    const { design, cases } = loaded;
    const caseIds = new Set(cases.map((c) => c.id));
    const parts = [
      { errors: duplicates(cases.map((c) => c.id)).map((id) => `用例 id 重複：${id}`), warnings: [] },
      checkTechniques(design.coverage, caseIds),
      checkMatrices(design.matrices, design.coverage.techniques, caseIds),
      checkStateMachine(design.stateMachine, design.coverage.techniques, caseIds),
      checkPrototype(design.prototype, loaded.prototypeHtml, caseIds),
      checkRiskCoverage(cases, risks ?? { risks: [] }, design.coverage.deferredRisks ?? []),
      checkSelfReview(loaded, risks, { ...DEFAULT_CASE_DESIGN, ...config.caseDesign })
    ];
    return result(parts.flatMap((p) => p.errors), parts.flatMap((p) => p.warnings));
  });

export const checkConfirmation = (confirmation, currentHash) => {
  if (!confirmation) return result(['用例尚未確認：必須由使用者明確同意後執行 qa confirm']);
  const schemaErrors = validateArtifact('confirmation', confirmation);
  if (schemaErrors.length > 0) return result(schemaErrors);
  return confirmation.designHash === currentHash
    ? result()
    : result(['用例設計（design.json、feature、原型）在確認後被修改，確認已失效：請把變更給使用者看過，再重新執行 qa confirm']);
};

// 自動化計畫：每個 @auto 情境都要有 planner 的可行性判定與證據；做不到的必須說明原因
export const checkPlan = (plan, cases, confirmation, fileExists) => withSchema('plan', plan, () => {
  const errors = [];
  const warnings = [];
  if (plan.designHash !== confirmation.designHash) errors.push('plan.designHash 與已確認的設計不一致：計畫不是依照最新確認的情境產生');
  const autoIds = new Set(cases.filter((c) => !c.manual).map((c) => c.id));
  duplicates(plan.entries.map((e) => e.caseId)).forEach((id) => errors.push(`計畫中 ${id} 重複`));
  plan.entries.filter((e) => !autoIds.has(e.caseId)).forEach((e) => errors.push(`計畫中的 ${e.caseId} 不是 @auto 情境`));
  const planned = new Set(plan.entries.map((e) => e.caseId));
  [...autoIds].filter((id) => !planned.has(id)).forEach((id) => errors.push(`@auto 情境 ${id} 沒有自動化計畫（需要 planner 判定可行性）`));
  plan.entries.forEach((e) => {
    const evidenceFile = e.evidence.split('#')[0];
    if (!fileExists(evidenceFile)) errors.push(`${e.caseId} 的證據檔不存在：${evidenceFile}`);
    if (e.feasibility === 'NOT_FEASIBLE' && !e.reason?.trim()) errors.push(`${e.caseId} 判定為 NOT_FEASIBLE，必須寫 reason`);
    if (e.feasibility === 'NEEDS_API_SETUP' && !(e.apiSetup ?? []).length) errors.push(`${e.caseId} 判定為 NEEDS_API_SETUP，必須列出 apiSetup`);
    if (e.feasibility !== 'NOT_FEASIBLE' && e.oracles.some((o) => !o.observable)) {
      warnings.push(`${e.caseId} 有 Then 無法觀察，斷言需要改用其他可驗證的結果或標為 TODO`);
    }
    if (!e.probed) errors.push(`${e.caseId} 沒有實際操作畫面：planner 必須用 Playwright MCP／Appium MCP 實測，工具缺少時請先設定，不能用猜測的 locator`);
  });
  const infeasible = plan.entries.filter((e) => e.feasibility === 'NOT_FEASIBLE').map((e) => e.caseId);
  if (infeasible.length) warnings.push(`不可自動化：${infeasible.join('、')}，最終結論會列為需要人工驗證`);
  return result(errors, warnings);
});

// 先確認用例狀態：未確認或確認失效時，腳本本身是否正確已無意義。
export const checkTasks = (tasks, cases, confirmation, currentHash, fileExists, plan = null) => {
  const confirmed = checkConfirmation(confirmation, currentHash);
  if (confirmed.errors.length > 0) return confirmed;
  return withSchema('tasks', tasks, () => {
    const errors = duplicates(tasks.tasks.map((t) => t.id)).map((id) => `task id 重複：${id}`);
    if (tasks.designHash !== confirmation.designHash) {
      errors.push('tasks.designHash 與已確認的設計不一致：腳本不是依照最新確認的用例產生');
    }
    const caseById = new Map(cases.map((c) => [c.id, c]));
    tasks.tasks.forEach((t) => {
      if (!caseById.has(t.caseId)) errors.push(`${t.id} 引用不存在的用例 ${t.caseId}`);
      if (!fileExists(t.file)) errors.push(`${t.id} 的測試檔不存在：${t.file}`);
    });
    const withTask = new Set(tasks.tasks.map((t) => t.caseId));
    const infeasible = new Set((plan?.entries ?? []).filter((e) => e.feasibility === 'NOT_FEASIBLE').map((e) => e.caseId));
    cases.filter((c) => !c.manual && !infeasible.has(c.id) && !withTask.has(c.id))
      .forEach((c) => errors.push(`情境 ${c.id}「${c.title}」沒有對應的測試腳本 task`));
    tasks.tasks.filter((t) => infeasible.has(t.caseId))
      .forEach((t) => errors.push(`${t.id} 對應的 ${t.caseId} 已判定為 NOT_FEASIBLE，不應該產生測試`));
    return result(errors);
  });
};

const SCENARIO_FIELDS = ['title', 'tags', 'preconditions', 'steps', 'expected'];
const scenarioKey = (c) => canonicalHash(Object.fromEntries(SCENARIO_FIELDS.map((f) => [f, c[f] ?? null])));

// BDD 專案：放進專案的 feature 必須與使用者確認的內容一致（以 Scenario 標題對應）。
// 專案既有的 feature 可能不符合本流程的 tag 規則，所以只看被確認的那些 Scenario。
export const checkProjectFeatures = (projectLoaded, confirmedCases, featuresDir) => {
  const byTitle = new Map(projectLoaded.scenarios.map((c) => [c.title, c]));
  const errors = [];
  confirmedCases.filter((c) => !c.manual).forEach((c) => {
    const found = byTitle.get(c.title);
    if (!found) errors.push(`${featuresDir} 中找不到 ${c.id} 的 Scenario「${c.title}」`);
    else if (scenarioKey(found) !== scenarioKey(c)) {
      errors.push(`${featuresDir}/${found.file}:${found.line} ${c.id}「${c.title}」與確認的內容不一致（tag 或步驟被修改）`);
    }
  });
  return result(errors);
};

export const checkResults = (results, tasks, config) =>
  withSchema('results', results, () => {
    const errors = [];
    const warnings = [];
    const maxLoops = config?.repair?.maxLoops ?? 3;
    const repairsLeft = results.attempts <= maxLoops;
    const byTask = new Map(results.results.map((r) => [r.taskId, r]));

    (tasks?.tasks ?? []).filter((t) => !byTask.has(t.id)).forEach((t) => errors.push(`${t.id} 沒有執行結果`));
    results.results.forEach((r) => {
      if (r.status === 'not-run') errors.push(`${r.taskId} 狀態仍為 not-run：${r.reason ?? '請對照 log 判定結果'}`);
      if (r.status === 'blocked' && !r.reason?.trim()) errors.push(`${r.taskId} 為 blocked，必須寫 reason`);
      if (r.status !== 'failed') return;
      if (!r.classification) {
        errors.push(`${r.taskId} 失敗但沒有 classification（test-defect / product-defect / environment / unclear-requirement）`);
      } else if (r.classification === 'test-defect') {
        if (repairsLeft) errors.push(`${r.taskId} 是測試本身的缺陷，還有修復次數（${results.attempts}/${maxLoops + 1}），請修復後重跑`);
        else warnings.push(`${r.taskId} 的測試缺陷在修復上限內未解決`);
      } else if (r.classification === 'environment') {
        warnings.push(`${r.taskId} 因環境問題失敗，結果不可信`);
      }
    });
    // 防假綠：通過的測試要證明斷言真的會失敗（把關鍵斷言改壞後重跑必須轉紅）
    if (config?.run?.oracleAudit !== false) {
      const audited = new Map((results.oracleAudit ?? []).map((a) => [a.taskId, a]));
      results.results.filter((r) => r.status === 'passed').forEach((r) => {
        const audit = audited.get(r.taskId);
        if (!audit) errors.push(`${r.taskId} 通過了但還沒做防假綠檢查（oracleAudit）`);
        else if (!audit.turnedRed) errors.push(`${r.taskId} 的斷言改壞後仍然通過：疑似假綠，請修正斷言（${audit.mutation}）`);
      });
    }
    return result(errors, warnings);
  });

// 代碼審查的評分與結論規則：確定性檢查失敗或有 critical 問題時一票否決
export const REVIEW_DIMENSIONS = ['fidelity', 'reliability', 'style', 'productRisk', 'maintainability'];

export const expectedReviewVerdict = (review, checks) => {
  const vetoed = !checks?.passed || review.findings.some((f) => f.severity === 'critical');
  if (vetoed || review.score < 60) return 'BLOCK';
  return review.score < 75 ? 'APPROVE_WITH_FIXES' : 'APPROVE';
};

export const checkReview = (review, checks) => {
  if (!checks) return result(['缺少確定性檢查結果：請先執行 qa review-checks']);
  const checkErrors = validateArtifact('review-checks', checks);
  if (checkErrors.length > 0) return result(checkErrors);
  return withSchema('review', review, () => {
    const errors = duplicates(review.findings.map((f) => f.id)).map((id) => `審查問題 id 重複：${id}`);
    if (review.checksHash !== canonicalHash(checks)) {
      errors.push('review.checksHash 與目前的 review-checks.json 不一致：確定性檢查重跑過，請依最新結果重新審查');
    }
    const sum = REVIEW_DIMENSIONS.reduce((total, d) => total + review.breakdown[d].score, 0);
    if (sum !== review.score) errors.push(`總分 ${review.score} 與各維度加總 ${sum} 不一致`);
    const expected = expectedReviewVerdict(review, checks);
    if (review.verdict !== expected) {
      const why = !checks.passed ? '確定性檢查未通過' : review.findings.some((f) => f.severity === 'critical') ? '有 critical 問題' : `總分 ${review.score}`;
      errors.push(`verdict 應為 ${expected}（${why}），實際為 ${review.verdict}`);
    }
    const warnings = review.verdict === 'BLOCK' ? ['代碼審查結論為 BLOCK，最終結論將為不可發布'] : [];
    return result(errors, warnings);
  });
};
