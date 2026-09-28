// 從各階段產物推導用例結果、風險結果與最終結論。純函式，報告與 CLI 共用。
const PRIORITY_ORDER = ['P0', 'P1', 'P2', 'P3'];

const caseOutcome = (kase, taskResults, infeasible) => {
  if (kase.manual) return 'manual';
  if (infeasible) return 'infeasible';
  if (taskResults.length === 0) return 'not-run';
  const statuses = taskResults.map((r) => r.status);
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.every((s) => s === 'passed')) return 'passed';
  return statuses.includes('not-run') ? 'not-run' : 'skipped';
};

const worst = (outcomes) => {
  const order = ['failed', 'blocked', 'not-run', 'skipped', 'infeasible', 'manual', 'passed'];
  return outcomes.length === 0 ? 'uncovered' : order.find((o) => outcomes.includes(o));
};

const count = (values) => values.reduce((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});

export const summarize = ({ risks, cases, tasks, results, review, plan }) => {
  const allCases = cases?.cases ?? [];
  const infeasible = new Set((plan?.entries ?? []).filter((e) => e.feasibility === 'NOT_FEASIBLE').map((e) => e.caseId));
  const allTasks = tasks?.tasks ?? [];
  const resultByTask = new Map((results?.results ?? []).map((r) => [r.taskId, r]));

  const caseStatus = Object.fromEntries(allCases.map((c) => {
    const taskResults = allTasks.filter((t) => t.caseId === c.id).map((t) => resultByTask.get(t.id) ?? { status: 'not-run' });
    return [c.id, caseOutcome(c, taskResults, infeasible.has(c.id))];
  }));

  const riskOutcome = Object.fromEntries((risks?.risks ?? []).map((r) => [
    r.id,
    worst(allCases.filter((c) => c.riskIds.includes(r.id)).map((c) => caseStatus[c.id]))
  ]));

  const findings = review?.findings ?? [];
  const stats = {
    cases: { total: allCases.length, ...count(Object.values(caseStatus)) },
    tasks: { total: allTasks.length, ...count([...resultByTask.values()].map((r) => r.status)) },
    risks: {
      total: Object.keys(riskOutcome).length,
      covered: Object.values(riskOutcome).filter((o) => o !== 'uncovered').length
    },
    findings: { total: findings.length, critical: findings.filter((f) => f.severity === 'critical').length, ...count(findings.map((f) => f.severity)) },
    review: review ? { score: review.score, verdict: review.verdict } : null,
    attempts: results?.attempts ?? 0
  };

  const infeasibleReason = new Map((plan?.entries ?? []).filter((e) => e.feasibility === 'NOT_FEASIBLE').map((e) => [e.caseId, e.reason]));
  const { verdict, reasons } = decide({ allCases, caseStatus, allTasks, resultByTask, findings, results, review, infeasibleReason });
  return { verdict, reasons, caseStatus, riskOutcome, stats };
};

const decide = ({ allCases, caseStatus, allTasks, resultByTask, findings, results, review, infeasibleReason }) => {
  if (!results) return { verdict: 'incomplete', reasons: ['缺少執行結果（results.json）'] };
  if (!review) return { verdict: 'incomplete', reasons: ['缺少代碼審查（review.json）'] };

  const noGo = [
    ...allCases.filter((c) => c.priority === 'P0' && !['passed', 'manual', 'infeasible'].includes(caseStatus[c.id]))
      .map((c) => `P0 用例 ${c.id}「${c.title}」結果為 ${caseStatus[c.id]}`),
    ...allTasks.map((t) => ({ t, r: resultByTask.get(t.id) }))
      .filter(({ t, r }) => r?.classification === 'product-defect' &&
        ['P0', 'P1'].includes(allCases.find((c) => c.id === t.caseId)?.priority))
      .map(({ t }) => `${t.caseId} 發現產品缺陷（${t.id}）`),
    ...(review.verdict === 'BLOCK' ? [`代碼審查結論為 BLOCK（${review.score}/100）`] : []),
    ...findings.filter((f) => f.severity === 'critical').map((f) => `critical 審查問題 ${f.id}：${f.title}`)
  ];
  if (noGo.length > 0) return { verdict: 'no-go', reasons: [...new Set(noGo)] };

  const conditional = [
    ...allCases.filter((c) => caseStatus[c.id] !== 'passed')
      .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority))
      .map((c) => (caseStatus[c.id] === 'infeasible'
        ? `${c.priority} 情境 ${c.id} 無法自動化，需要人工驗證：${infeasibleReason.get(c.id)}`
        : `${c.priority} 用例 ${c.id} 結果為 ${caseStatus[c.id]}`)),
    ...(review.verdict === 'APPROVE_WITH_FIXES' ? [`代碼審查結論為 APPROVE_WITH_FIXES（${review.score}/100）`] : []),
    ...findings.filter((f) => f.severity === 'important').map((f) => `important 審查問題 ${f.id}：${f.title}`)
  ];
  return conditional.length > 0
    ? { verdict: 'conditional', reasons: conditional }
    : { verdict: 'go', reasons: ['所有情境通過，代碼審查為 APPROVE'] };
};
