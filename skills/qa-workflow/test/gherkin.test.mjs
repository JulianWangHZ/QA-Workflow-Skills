import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGherkin, toCases } from '../lib/gherkin.mjs';
import { joinIndex } from '../lib/design.mjs';

const FEATURE = `# 頁面 code 路徑：src/checkout/index.tsx
# 註：付款在另一個 feature
@會員
Feature: 購物車結帳
  作為一個會員
  我想要完成結帳
  以便收到商品

  Background:
    Given 我已登入會員 "amy"

  # ############################################
  # 庫存
  # ############################################
  @結帳頁面 @regression @auto @庫存不足
  Scenario: 庫存不足時無法下單
    Given "馬克杯" 庫存為 "0"
    When 我購買 "馬克杯"
    Then 系統顯示 "商品庫存不足"
    And 不會建立訂單

  # ############################################
  # 數量上限
  # ############################################
  @結帳頁面 @smoke @regression @auto @邊界 @數量上限
  Scenario: 數量剛好 10 件可以下單
    When 我購買 "10" 件 "馬克杯"
    Then 訂單成立

  @收據頁面 @regression @收據版面
  Scenario: 收據顯示總金額
    When 我開啟收據
    Then 收據顯示：
      """
      總計 350
      """
`;

test('解析：英文關鍵字、中文內容、Background、段落分隔、doc string', () => {
  const { feature, errors } = parseGherkin(FEATURE, 'checkout.feature');
  assert.deepEqual(errors, []);
  assert.equal(feature.name, '購物車結帳');
  assert.deepEqual(feature.tags, ['@會員']);
  assert.deepEqual(feature.description, ['作為一個會員', '我想要完成結帳', '以便收到商品']);
  assert.equal(feature.scenarios.length, 3);
  assert.deepEqual(feature.scenarios.map((s) => s.section), ['庫存', '數量上限', '數量上限']);
  assert.equal(feature.scenarios[2].steps[1].docString, '總計 350');
});

test('toCases：三軸 tag 推導 smoke / manual / boundary 與描述性 tag', () => {
  const { cases, errors } = toCases(parseGherkin(FEATURE, 'checkout.feature').feature, 'checkout.feature');
  assert.deepEqual(errors, []);
  const [c1, c2, c3] = cases;
  assert.deepEqual(c1.preconditions, ['我已登入會員 "amy"', '"馬克杯" 庫存為 "0"']);
  assert.deepEqual(c1.steps, ['我購買 "馬克杯"']);
  assert.deepEqual(c1.expected, ['系統顯示 "商品庫存不足"', '不會建立訂單']);
  assert.deepEqual(c1.labels, ['@會員', '@結帳頁面', '@庫存不足']);
  assert.deepEqual([c1.manual, c1.smoke, c1.boundary], [false, false, false]);
  assert.deepEqual([c2.manual, c2.smoke, c2.boundary], [false, true, true]);
  assert.equal(c3.manual, true);
});

test('規則：缺 @regression、禁止的 tag、缺描述性 tag、Outline、缺 Then、缺說明', () => {
  const bad = `Feature: X

  @P0 @regression @auto
  Scenario: 有優先級 tag
    When a
    Then b

  @smoke @auto @頁面
  Scenario: 沒有 regression
    When a

  Scenario Outline: 大綱
    When <a>
    Then b
    Examples:
      | a |
      | 1 |
`;
  const { cases, errors } = toCases(parseGherkin(bad, 'x.feature').feature, 'x.feature');
  const text = errors.join('\n');
  assert.equal(cases.length, 3);
  assert.match(text, /x\.feature:1 .*三行說明/);
  assert.match(text, /x\.feature:4 .*@P0/);
  assert.match(text, /x\.feature:4 .*描述性 tag/);
  assert.match(text, /x\.feature:9 .*@regression/);
  assert.match(text, /x\.feature:9 .*Then/);
  assert.match(text, /x\.feature:12 .*Scenario Outline/);
});

test('語法：中文關鍵字、# language、步驟在 Scenario 之外、沒有 Feature', () => {
  assert.match(parseGherkin('功能：登入\n', 'a.feature').errors.join(), /a\.feature:1 .*英文/);
  assert.match(parseGherkin('# language: zh-TW\nFeature: a\n', 'b.feature').errors.join(), /b\.feature:1 .*language/);
  assert.match(parseGherkin('Feature: a\n  Rule: r\n    When b\n', 'c.feature').errors.join(), /c\.feature:3/);
  assert.match(parseGherkin('Scenario: a\n', 'd.feature').errors.join(), /d\.feature:1/);
});

test('joinIndex：以檔案與標題對應索引，兩邊都要一一對應', () => {
  const { cases } = toCases(parseGherkin(FEATURE, 'checkout.feature').feature, 'checkout.feature');
  const index = [
    { id: 'TC-2', file: 'checkout.feature', title: '數量剛好 10 件可以下單', priority: 'P1', riskIds: ['R-1'], type: 'boundary' },
    { id: 'TC-1', file: 'checkout.feature', title: '庫存不足時無法下單', priority: 'P0', riskIds: ['R-1'], type: 'negative' },
    { id: 'TC-9', file: 'checkout.feature', title: '不存在的情境', priority: 'P2', riskIds: [], type: 'positive' }
  ];
  const joined = joinIndex(cases, index);
  assert.deepEqual(joined.cases.map((c) => c.id), ['TC-1', 'TC-2']);
  assert.equal(joined.cases[0].priority, 'P0');
  const text = joined.errors.join('\n');
  assert.match(text, /收據顯示總金額/);
  assert.match(text, /TC-9/);
});
