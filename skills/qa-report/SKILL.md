---
name: qa-report
description: >
  qa-workflow 的第 8 階段：產生最終驗收報告（report.html、summary.md），並向使用者說明結論與依據。
  由 qa-workflow 調度。
---

# qa-report — 報告

`qa` = `node "<本 skill 目錄>/../qa-workflow/bin/qa.mjs"`

## 流程

### 1. 產生報告

執行 `qa report`。它會：
1. 依各階段產物計算結論。
2. 產生 run 目錄下的 `report.html` 與 `summary.md`。
3. 複製一份到 `config.report.dir`（`<runId>.html` 與 `latest.html`）。
4. 把 stage 推進到 `done`。

### 2. 向使用者報告

讀 `summary.md` 與相關產物，精簡回報：

1. **結論**（第一行）：可發布 / 有條件可發布 / 不可發布 / 未完成。
2. **主要依據**：最多 3 條，取自報告的結論依據。
3. **產品缺陷**：用例、實際與預期、程式位置。
4. **尚未驗證的部分**：人工驗收的情境、planner 判定無法自動化的情境（附原因）、blocked、延後處理的風險。
5. **報告路徑**：報告中也有連結可以回到用例審閱頁（測試矩陣、狀態機、原型、驗收清單、BDD）。
6. **一個下一步建議**，例如「修正 TC-2 對應的回應碼後，用 `qa start --mode rerun` 重跑」。

### 3. 對外發佈（選用）

- 使用者要求時才做，例如在 issue 留言附上摘要、建立缺陷單。
- 發佈前先把要送出的內容給使用者看，得到同意後才用對應的 MCP 工具送出。

## 結論規則

由 CLI 計算，完整規則見 `../qa-workflow/references/gates.md`：

| 結論 | 條件 |
|---|---|
| 不可發布 | P0 情境未通過、P0/P1 情境有產品缺陷、代碼審查為 BLOCK，或有 critical 審查問題 |
| 有條件可發布 | 其餘任何未通過（含人工驗收）、代碼審查為 APPROVE_WITH_FIXES，或有 important 審查問題 |
| 可發布 | 全部通過，且沒有上述問題 |
| 未完成 | 缺少執行結果或審查結果 |

## 規則

- 報告中的數字只能來自 CLI 產生的報告，不自行估算。
- 不軟化結論。「不可發布」就照實說，並說明依據。
