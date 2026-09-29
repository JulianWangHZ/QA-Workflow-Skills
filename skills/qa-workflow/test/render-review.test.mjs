import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCasesReview } from '../lib/render-review.mjs';
import { dictionary } from '../lib/i18n.mjs';
import * as fx from './fixtures.mjs';

const render = () => renderCasesReview({
  runId: 'r1', context: fx.context(), risks: fx.risks(), loaded: { ...fx.loaded(), designHash: 'a'.repeat(64) },
  confirmationStatus: 'pending', dict: dictionary('zh-TW'), language: 'zh-TW'
});

test('評審分數顯示每個維度的滿分、核對紀錄與扣分', () => {
  const html = render();
  assert.match(html, /16\/20/);
  assert.match(html, /8\/10/);
  assert.match(html, /R-1 → TC-1/);
  assert.match(html, /−4/);
  assert.match(html, /只有 UI 情境 TC-2/);
});
