// 並行 subagent 產出的合併：規則固定、由程式執行，主對話不需要讀取各塊內容。
import { REVIEW_DIMENSIONS, expectedReviewVerdict } from './gates.mjs';

const SEVERITY_ORDER = ['critical', 'important', 'minor'];
const unique = (items) => [...new Set(items.map((i) => i.trim()).filter(Boolean))];

// 各維度取最低分，避免某一塊的問題被其他塊平均掉；說明沿用最低分那一塊
export const mergeReviewChunks = ({ chunks, checks, checksHash, summary }) => {
  const breakdown = Object.fromEntries(REVIEW_DIMENSIONS.map((d) => {
    const worst = chunks.reduce((min, c) => (c.breakdown[d].score < min.breakdown[d].score ? c : min));
    return [d, { score: worst.breakdown[d].score, note: chunks.length > 1 ? `${worst.breakdown[d].note}（分塊 ${worst.chunk}）` : worst.breakdown[d].note }];
  }));
  const seen = new Set();
  const findings = chunks.flatMap((c) => c.findings)
    .filter((f) => {
      const key = `${f.file}:${f.line ?? ''}:${f.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0))
    .map((f, i) => ({ id: `F-${i + 1}`, ...f }));
  const score = REVIEW_DIMENSIONS.reduce((total, d) => total + breakdown[d].score, 0);
  const draft = { version: 1, checksHash, score, breakdown, findings };
  const verdict = expectedReviewVerdict(draft, checks);
  const count = (s) => findings.filter((f) => f.severity === s).length;
  return {
    ...draft,
    verdict,
    summary: summary?.trim() || `${verdict} ${score}/100：critical ${count('critical')}、important ${count('important')}、minor ${count('minor')}${checks.passed ? '' : '；確定性檢查未通過'}`,
    strengths: unique(chunks.flatMap((c) => c.strengths)),
    suggestions: unique(chunks.flatMap((c) => c.suggestions))
  };
};

// 依 feature 名稱排序後重新編號，讓並行產出的結果每次合併都一樣
export const mergeTaskParts = ({ parts, designHash }) => {
  const tasks = [...parts].sort((a, b) => a.feature.localeCompare(b.feature))
    .flatMap((p) => p.tasks)
    .map((t, i) => ({ id: `T-${i + 1}`, ...t }));
  return {
    tasks: { version: 1, designHash, tasks },
    sharedRequests: unique(parts.flatMap((p) => (p.sharedRequests ?? []).map((r) => `[${p.feature}] ${r}`)))
  };
};
