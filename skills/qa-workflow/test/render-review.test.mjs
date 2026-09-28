import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rubricMax } from '../lib/render-review.mjs';

test('評審維度名稱有空白或字尾差異時，仍對到正確的滿分', () => {
  assert.equal(rubricMax('技法與矩陣'), 20);
  assert.equal(rubricMax('技法與矩陣完整'), 20);
  assert.equal(rubricMax('BDD 品質'), 15);
  assert.equal(rubricMax('BDD品質'), 15);
  assert.equal(rubricMax(' 精簡與原型 '), 10);
});

test('不認得的維度名稱退回 100', () => {
  assert.equal(rubricMax('其他'), 100);
});
