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

test('PM 驗收清單：獨立分頁、沿用 TC 編號、連到 QA 情境並可播放原型示範', () => {
  const html = render();
  assert.match(html, /<a href="#pm"><span class="n">5<\/span>PM 驗收清單<\/a>/);
  assert.match(html, /<a href="#acceptance"><span class="n">6<\/span>QA 驗收清單<\/a>/);
  assert.match(html, /id="pm-TC-1" data-pm="TC-1"/);
  assert.match(html, /密碼錯誤無法登入/);
  assert.match(html, /href="#acceptance\/case-TC-1"/);
  assert.match(html, /data-play="TC-1"/);
  assert.match(html, /連續錯幾次要鎖帳號？/);
  assert.match(html, /data-case-meta="[^"]*&quot;pm&quot;:true/);
  assert.match(html, /qa-review-pm:r1/);
});
