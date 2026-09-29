# 放行條件與結論規則

`qa gate <stage>` 只能對「目前所在的 stage」執行。
- ✗ 錯誤：擋下，不推進。
- ⚠ 警告：不擋，但要轉告使用者。

所有 gate 都先做 schema 驗證。

## context

- ✗ `scope.summary` 空白、沒有任何 `sources`
- ⚠ 只有文字描述、沒有程式變更或文件來源
- ⚠ 有 `openQuestions`

## risk

- ✗ 風險 id 重複
- ⚠ 沒有任何風險

## cases

- ✗ `design.json` 不符合 schema；`design/features/` 下沒有 feature
- ✗ feature 語法錯誤；使用中文關鍵字或 `# language`；Feature 沒有三行說明（都會附上 file:line）
- ✗ Scenario 缺少 `@regression`；缺少描述性 tag；使用編號、優先級、風險、版本號這類 tag；使用 Scenario Outline；缺少 When 或 Then
- ✗ Scenario 標題重複；feature 與 `design.json` 的 `scenarios` 索引沒有一一對應
- ✗ 情境 id 重複
- ✗ 12 項技法缺漏或重複；適用卻沒有 `caseIds`；N/A 沒寫理由；引用不存在的情境
- ✗ 矩陣列欄位數與表頭不符；矩陣列既沒有 `caseIds` 也沒有 `skipReason`
- ✗ 狀態轉換沒有對應情境；`state-transition` 標為適用，但沒有轉換或沒有非法轉換
- ✗ `prototype` 沒有 `file`（原型一律必做，`skipReason` 不能跳過）；原型檔不存在；原型沒有畫面
- ✗ 情境示範（qa-scenarios）不是合法 JSON；引用不存在的情境；重複；沒有步驟；**有情境沒有示範**；`noUi` 沒有寫 reason
- ✗ 情境引用不存在的風險；P0/P1 風險沒有情境覆蓋，也不在 `deferredRisks`
- ✗ 自審分數低於 `minReviewScore`，且輪數還沒用完
- ⚠ P0/P1 風險只有 `type: positive` 的情境；P0/P1 風險被延後處理
- ⚠ 矩陣使用的技法在清單中標為 N/A；轉換中的狀態不在 `states`
- ⚠ 自審輪數用完仍未及格

通過後，CLI 會產生 `cases.json` 與 `cases-review.html`，stage 進入 `confirm`。

## confirm（`qa confirm`）

- ✗ 還沒走到 confirm 階段
- ✗ 設計不符合 cases gate

通過後寫入 `confirmation.json`（含 `designHash`：design.json、所有 feature 原文、原型 HTML 的內容 hash），並重新產生審閱頁（狀態顯示為已確認）。stage 進入 `scripts`。

## scripts

- ✗ 沒有 `plan.json`，或 `plan.designHash` 與確認不一致
- ✗ 有 `@auto` 情境沒有計畫；計畫中有非 `@auto` 的情境或重複
- ✗ 證據檔不存在；`NOT_FEASIBLE` 沒寫 reason；`NEEDS_API_SETUP` 沒列 apiSetup
- ✗ 可行的情境沒有 task；`NOT_FEASIBLE` 的情境卻有 task
- ⚠ 有情境沒有實際操作畫面（`probed: false`）；有 Then 無法觀察；有情境無法自動化

- ✗ 沒有確認紀錄，或設計在確認後被修改（hash 不符）
- ✗ `tasks.designHash` 與確認的 hash 不一致
- ✗ task id 重複；引用不存在的用例；測試檔不存在
- ✗ 標了 `@auto` 的情境沒有任何 task
- ✗ （設定 `bdd.featuresDir` 時）專案 feature 中找不到已確認的 `@auto` Scenario（以標題對應），或其 tag、步驟與確認內容不一致

## run

- ✗ 確認紀錄失效
- ✗ 有 task 沒有結果；還有 `not-run`
- ✗ `failed` 沒有 `classification`；`blocked` 沒有 `reason`
- ✗ `test-defect` 且還有修復次數（`attempts ≤ maxLoops`）
- ✗ 通過的 task 沒有防假綠檢查（`oracleAudit`），或斷言改壞後仍然通過（假綠）。`run.oracleAudit: false` 時不檢查
- ⚠ 修復上限用完仍有 `test-defect`
- ⚠ `environment` 類失敗

## review

- ✗ 確認紀錄失效
- ✗ 沒有 `review-checks.json`（請先執行 `qa review-checks`）
- ✗ `review.checksHash` 與目前的 `review-checks.json` 不一致（確定性檢查重跑過）
- ✗ `score` 不等於 5 個維度加總
- ✗ `verdict` 不符合規則：確定性檢查有 fail 或有 critical 問題時必須是 BLOCK；否則 <60 為 BLOCK、60–74 為 APPROVE_WITH_FIXES、≥75 為 APPROVE
- ✗ 審查問題 id 重複
- ⚠ verdict 為 BLOCK（最終結論會是不可發布）

## 最終結論（`qa report`）

用例結果由它的 task 推導：
1. 任一 task failed → `failed`
2. 否則任一 blocked → `blocked`
3. 否則全部 passed → `passed`
4. 否則為 `not-run` 或 `skipped`

manual 用例一律為 `manual`。

| 結論 | 條件（由上往下判定，符合即停） |
|---|---|
| 未完成 | 缺少 `results.json` 或 `review.json` |
| 不可發布 | P0 用例不是 passed/manual；P0/P1 用例有 `product-defect`；代碼審查為 BLOCK 或有 critical 問題 |
| 有條件可發布 | 還有任何不是 passed 的用例（含 manual，以及判定為無法自動化的情境）；代碼審查為 APPROVE_WITH_FIXES 或有 important 問題 |
| 可發布 | 以上皆否 |
