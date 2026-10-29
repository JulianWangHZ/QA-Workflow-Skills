// 用例修改紀錄：退回 cases 修改前存一份已審閱的版本，重產審閱頁時與目前版本比對，標出新增／修改／移除。
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, writeJson } from './io.mjs';

// 只比對審閱者看得到的內容；檔案行號等排版資訊不算修改
const QA_FIELDS = ['title', 'preconditions', 'steps', 'expected', 'type', 'priority'];
const PM_FIELDS = ['title', 'summary', 'expected'];
// 改動超過一半就整段對照，逐字標記反而整段都在變色
export const WORD_MARK_LIMIT = 0.5;

const revisionsDir = (run) => join(run.dir, 'revisions');

const pick = (source, fields) => Object.fromEntries(fields.map((f) => [f, source[f] ?? null]));

export const snapshotOf = (cases, pmItems) => ({
  qa: cases.map((c) => ({ id: c.id, file: c.file, ...pick(c, QA_FIELDS) })),
  pm: (pmItems ?? []).map((i) => ({ id: i.caseId, ...pick(i, PM_FIELDS) }))
});

export const loadRevisions = (run) => {
  const dir = revisionsDir(run);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))
    .map((f) => readJson(join(dir, f)))
    .sort((a, b) => a.round - b.round);
};

// 跟上一輪存的內容一樣就不再記一輪，避免出現空的修改紀錄
export const saveRevision = (run, snapshot, note, savedAt) => {
  const revisions = loadRevisions(run);
  if (revisions.length && JSON.stringify(revisions.at(-1).snapshot) === JSON.stringify(snapshot)) return null;
  const round = revisions.length + 1;
  mkdirSync(revisionsDir(run), { recursive: true });
  writeJson(join(revisionsDir(run), `${round}.json`), { round, savedAt, note: note ?? '', snapshot });
  return round;
};

// 中日韓逐字，數字與英文整段，才標得出「24 → 12」而不是拆成單一數字
const tokenize = (text) => String(text).match(/\d+|[A-Za-z]+|\s+|./gsu) ?? [];

export const diffSegments = (oldText, newText) => {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const segments = [];
  const push = (op, text) => {
    const last = segments.at(-1);
    if (last?.op === op) last.text += text;
    else segments.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push('=', a[i]); i++; j++; } else if (lengths[i + 1][j] >= lengths[i][j + 1]) push('-', a[i++]);
    else push('+', b[j++]);
  }
  while (i < a.length) push('-', a[i++]);
  while (j < b.length) push('+', b[j++]);
  return segments;
};

export const changeRatio = (segments) => {
  const size = (op) => segments.filter((s) => s.op === op).reduce((n, s) => n + s.text.length, 0);
  const kept = size('=');
  const longest = Math.max(kept + size('-'), kept + size('+'), 1);
  return Math.min(1, (size('-') + size('+')) / 2 / longest);
};

const asLines = (value) => (Array.isArray(value) ? value : value == null ? [] : [String(value)]);

// 一個欄位的前後對照：沒改的列標 same；只換掉一列且改動不多時，逐字標出差異
export const compareField = (before, after) => {
  const oldLines = asLines(before);
  const newLines = asLines(after);
  const kept = new Set(oldLines.filter((l) => newLines.includes(l)));
  const removed = oldLines.filter((l) => !kept.has(l));
  const added = newLines.filter((l) => !kept.has(l));
  const segments = removed.length === 1 && added.length === 1 ? diffSegments(removed[0], added[0]) : null;
  const wordMarks = segments && changeRatio(segments) <= WORD_MARK_LIMIT ? segments : null;
  const side = (lines, drop) => lines.map((text) => (kept.has(text)
    ? { text, same: true }
    : { text, same: false, parts: wordMarks?.filter((s) => s.op !== drop) ?? null }));
  return { before: side(oldLines, '+'), after: side(newLines, '-'), added: removed.length === 0 ? added : [] };
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const compareList = (oldItems, newItems, fields) => {
  const oldById = new Map(oldItems.map((x) => [x.id, x]));
  const newById = new Map(newItems.map((x) => [x.id, x]));
  const changes = new Map();
  newItems.forEach((item) => {
    const prev = oldById.get(item.id);
    if (!prev) { changes.set(item.id, { kind: 'added' }); return; }
    const changed = fields.filter((f) => !same(prev[f], item[f]));
    if (changed.length) changes.set(item.id, { kind: 'modified', fields: Object.fromEntries(changed.map((f) => [f, compareField(prev[f], item[f])])) });
  });
  const removed = oldItems.filter((x) => !newById.has(x.id));
  removed.forEach((x) => changes.set(x.id, { kind: 'removed', item: x }));
  return { changes, removed };
};

export const diffSnapshots = (before, after) => ({
  qa: compareList(before.qa, after.qa, QA_FIELDS),
  pm: compareList(before.pm, after.pm, PM_FIELDS)
});

// 所有被標記的情境編號（PM 與 QA 同一編號只算一次）
export const changeCounts = (diff) => {
  const kinds = new Map();
  [diff.qa.changes, diff.pm.changes].forEach((m) => m.forEach((c, id) => { if (!kinds.has(id)) kinds.set(id, c.kind); }));
  const count = (kind) => [...kinds.values()].filter((k) => k === kind).length;
  return { added: count('added'), modified: count('modified'), removed: count('removed'), total: kinds.size };
};

// 每一輪的差異：第 N 輪＝修改前存的第 N 份快照 → 下一份快照（最後一輪對目前版本）
export const revisionHistory = (revisions, current) => revisions.map((rev, i) => ({
  round: rev.round,
  savedAt: rev.savedAt,
  note: rev.note,
  diff: diffSnapshots(rev.snapshot, revisions[i + 1]?.snapshot ?? current)
}));
