import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeCounts, compareField, diffSnapshots } from '../lib/revision.mjs';

const qaCase = (id, expected, extra = {}) => ({ id, file: 'a.feature', title: id, preconditions: [], steps: ['登入'], expected, type: 'positive', priority: 'P1', ...extra });

test('小改逐字標記，只標出改到的片段', () => {
  const field = compareField(['停在登入頁'], ['停在登入頁並提示錯誤']);
  assert.deepEqual(field.after[0].parts.filter((p) => p.op === '+').map((p) => p.text), ['並提示錯誤']);
});

test('整句改寫不逐字標記，整段對照', () => {
  const field = compareField(['先導向登入'], ['跳出登入彈窗，不離開店家頁']);
  assert.equal(field.after[0].parts, null);
  assert.equal(field.before[0].same, false);
});

test('只新增一列：舊的列標為沒變，新列記在 added', () => {
  const field = compareField(['收藏列表不再出現'], ['收藏列表不再出現', '愛心變回空心']);
  assert.equal(field.before[0].same, true);
  assert.deepEqual(field.added, ['愛心變回空心']);
});

test('比對兩版：新增、修改、移除各自歸類，同一編號 PM 與 QA 只算一次', () => {
  const before = { qa: [qaCase('TC-1', ['A']), qaCase('TC-2', ['B'])], pm: [{ id: 'TC-1', title: 't', summary: 's', expected: 'A' }] };
  const after = { qa: [qaCase('TC-1', ['A2']), qaCase('TC-3', ['C'])], pm: [{ id: 'TC-1', title: 't', summary: 's', expected: 'A2' }] };
  const diff = diffSnapshots(before, after);
  assert.equal(diff.qa.changes.get('TC-1').kind, 'modified');
  assert.equal(diff.qa.changes.get('TC-3').kind, 'added');
  assert.equal(diff.qa.removed[0].id, 'TC-2');
  assert.deepEqual(changeCounts(diff), { added: 1, modified: 1, removed: 1, total: 3 });
});

test('行號變動不算修改', () => {
  const before = { qa: [qaCase('TC-1', ['A'], { line: 3 })], pm: [] };
  const after = { qa: [qaCase('TC-1', ['A'], { line: 9 })], pm: [] };
  assert.equal(diffSnapshots(before, after).qa.changes.size, 0);
});
