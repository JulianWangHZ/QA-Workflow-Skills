// 用例評審的證據規則：每個維度都要列出核對過的項目與扣分依據，分數必須能由扣分算出。
// 評審和設計在同一個對話中進行，靠這些檢查避免只寫一個數字就放行。

// 與 qa-cases/references/review-rubric.md 的維度與滿分一致
export const REVIEW_RUBRIC = [
  ['riskCoverage', 20], ['techniques', 20], ['stateMachine', 10], ['oracle', 15],
  ['grounding', 10], ['bdd', 15], ['concise', 10]
];

const ID_PATTERN = /\b(?:TC|R|M)-\d+\b/g;

// 可以被引用的東西：情境、風險、矩陣、技法、狀態、feature 檔、原型
const knownRefs = (design, cases, risks, files) => ({
  ids: new Set([
    ...cases.map((c) => c.id),
    ...(risks?.risks ?? []).map((r) => r.id),
    ...design.matrices.map((m) => m.id)
  ]),
  names: [...design.coverage.techniques.map((t) => t.technique), ...design.stateMachine.states, ...files.map((f) => f.file), 'prototype']
});

// 至少引用一個認得的東西，而且引用的編號都必須存在
const checkRef = (text, known, where) => {
  const ids = String(text).match(ID_PATTERN) ?? [];
  const unknown = ids.filter((id) => !known.ids.has(id));
  if (unknown.length > 0) return [`${where} 引用了不存在的 ${unknown.join('、')}：「${text}」`];
  const named = known.names.some((name) => name && String(text).includes(name));
  return ids.length > 0 || named ? [] : [`${where}「${text}」沒有引用任何情境、風險、矩陣、技法、狀態或 feature 檔`];
};

const checkDimension = (key, max, dim, known) => {
  if (!dim) return [`selfReview.breakdown 缺少維度 ${key}`];
  const errors = [];
  if (dim.max !== max) errors.push(`selfReview.breakdown.${key}.max 應為 ${max}（評分標準），實際為 ${dim.max}`);
  const deducted = dim.deductions.reduce((sum, d) => sum + d.points, 0);
  if (dim.score !== max - deducted) {
    errors.push(`selfReview.breakdown.${key}.score 為 ${dim.score}，但滿分 ${max} 扣掉 ${deducted} 應為 ${max - deducted}`);
  }
  dim.checked.forEach((c, i) => errors.push(...checkRef(c, known, `${key}.checked[${i}]`)));
  dim.deductions.forEach((d, i) => errors.push(...checkRef(d.ref, known, `${key}.deductions[${i}].ref`)));
  return errors;
};

const checkEvidence = (selfReview, known) => {
  if (selfReview.rounds === 0) return ['用例尚未評審（selfReview.rounds 為 0）：依評分標準評審後再執行 gate'];
  if (!selfReview.breakdown) return ['selfReview 缺少 breakdown：每個維度都要寫分數、核對紀錄與扣分'];
  const rubricKeys = new Set(REVIEW_RUBRIC.map(([key]) => key));
  const extra = Object.keys(selfReview.breakdown).filter((key) => !rubricKeys.has(key));
  const errors = [
    ...extra.map((key) => `selfReview.breakdown 有評分標準以外的維度 ${key}`),
    ...REVIEW_RUBRIC.flatMap(([key, max]) => checkDimension(key, max, selfReview.breakdown[key], known))
  ];
  const total = REVIEW_RUBRIC.reduce((sum, [key]) => sum + (selfReview.breakdown[key]?.score ?? 0), 0);
  if (errors.length === 0 && selfReview.score !== total) {
    errors.push(`selfReview.score 為 ${selfReview.score}，但各維度加總為 ${total}`);
  }
  return errors;
};

const checkThreshold = (selfReview, { minReviewScore, maxReviewRounds }) => {
  if (selfReview.score >= minReviewScore) return { errors: [], warnings: [] };
  const message = `用例自審分數 ${selfReview.score} 未達 ${minReviewScore}`;
  return selfReview.rounds >= maxReviewRounds
    ? { errors: [], warnings: [`${message}（已審 ${selfReview.rounds} 輪，交由人工確認時說明）`] }
    : { errors: [`${message}，請修正後重審（第 ${selfReview.rounds}/${maxReviewRounds} 輪）`], warnings: [] };
};

export const checkSelfReview = ({ design, cases, files }, risks, caseDesign) => {
  const errors = checkEvidence(design.selfReview, knownRefs(design, cases, risks, files));
  return errors.length > 0 ? { errors, warnings: [] } : checkThreshold(design.selfReview, caseDesign);
};
