---
name: qa-code-review
description: >
  qa-workflow 的第 7 階段：代碼審查。先由 CLI 跑確定性檢查（BDD 步驟是否都有實作、coding style 靜態掃描、
  專案的 type-check／lint，並產出審查範圍與分塊 diff），再逐塊依 5 個維度、100 分制評分，
  最後得出 APPROVE／APPROVE_WITH_FIXES／BLOCK，寫入 review.json。由 qa-workflow 調度，只審查、不修改。
---

# qa-code-review — 代碼審查

兩段式：

1. **確定性檢查**：由 CLI 執行，不耗用模型 context。
2. **逐塊評分**：以審查者的角度，依評分標準逐塊打分。不因為測試是自己寫的就放寬。

結論有一票否決規則，由 CLI 在 `qa gate review` 驗證。你不能自己決定結論。

`qa` = `node "<本 skill 目錄>/../qa-workflow/bin/qa.mjs"`

## 流程

### 1. 確定性檢查（零 context）

執行 `qa review-checks`。它會：

| 檢查 | 內容 |
|---|---|
| `features` | 用例確認仍然有效；BDD 專案中，放進專案的 feature 與確認內容一致 |
| `coding-style-scan` | 掃描測試檔：固定等待、`.only`、skip、寫死的密碼列為 fail；`console.log`、結構性 selector 列為 warn |
| `config.review.checks` | 專案自己的指令，例如 `npx bddgen`（每個步驟都有 step definition）、`npm run check` |

同時它會：
- 算出**審查範圍**：本次產生或修改的測試檔，加上 context 中的產品變更檔。
- 把 diff 存成 `review/review.diff`，並依行數**分塊**，寫入 `review-checks.json` 的 `scope.chunks`。

**任一檢查 fail，結論就必須是 BLOCK**，不看分數。

### 2. 逐塊評分

`qa review-checks` 已經把審查範圍切成分塊，每一塊有自己的 diff 檔（`review/chunk-<id>.diff`）與相關的 feature 清單。

1. 執行 `qa review-merge --pending`，列出待審的分塊（中斷後只會列出沒審完的）。
2. 一次審一塊，審完寫檔再審下一塊。
3. 每一塊只讀：
   - 這一塊的 diff 檔
   - 這一塊的 feature
   - `references/review-rubric.md`
   - 確定性檢查的摘要（不含 log）
4. 需要更多上下文時，才讀相關檔案的特定段落。
5. 把結果寫到 `review/chunk-<id>.json`（格式：`../qa-workflow/schemas/review-chunk.schema.json`，`checksHash` 用 `qa review-checks` 印出的值），不修改其他檔案，也不重複列出靜態掃描已抓到的問題。

### 3. 合併成 review.json

執行 `qa review-merge [--summary "<一句話結論>"]`。它依固定規則合併並寫入 `review.json`（格式：`../qa-workflow/schemas/review.schema.json`）：
- 各維度取所有分塊中的最低分，避免某一塊的問題被其他塊平均掉。
- findings 去重後，依嚴重度排序並重新編號為 `F-1`…
- 優點與建議合併去重。
- 總分與 verdict 依下方規則計算。

review.json 的欄位：

| 欄位 | 內容 |
|---|---|
| `checksHash` | 確定性檢查的 hash。確定性檢查重跑後，舊的評分會失效，需要重審 |
| `breakdown` | 5 個維度各 0–20 分，並附一句說明 |
| `score` | 5 個維度加總，CLI 會核對 |
| `verdict` | 依下表決定，CLI 會核對 |
| `summary`、`strengths`、`findings`、`suggestions` | 整體結論、優點、問題（附 `file:line`）、建議 |

| 條件 | verdict |
|---|---|
| 確定性檢查有 fail，或有 `critical` 問題 | **BLOCK**（一票否決） |
| 總分 < 60 | BLOCK |
| 60–74 | APPROVE_WITH_FIXES |
| ≥ 75 | APPROVE |

最終結論的影響：BLOCK 代表不可發布，APPROVE_WITH_FIXES 代表有條件可發布。

### 4. 驗證並回報

1. 執行 `qa validate review`。
2. 回報，內容包含：
   - verdict 與總分
   - 各維度分數
   - critical 與 important 問題（附 file:line）
   - 確定性檢查失敗的項目

## 節省 context 的規則

- 只看 `qa review-checks` 印出的摘要，不整份讀 `review-checks.json` 或 log。
- 每一塊都有自己的 diff 檔，最多 `config.review.maxChunkLines` 行（預設 800）。超過上限的單一檔案會依 hunk 或行數再切開。
- diff 只帶前後 3 行（`-U3`）。需要上下文時，才讀該函式附近。
- 每一塊只附上相關的 feature（從 tasks 反查），不讀全部的 feature。
- 靜態掃描已經抓到的問題，不需要再找。
- 每一塊的結果寫成檔案，合併由 `qa review-merge` 執行。
- 中斷後重跑 `qa review-merge --pending`，只補審沒完成的分塊。

## 規則

- 只審查，不修改任何檔案。
- 每個問題都要有 `file:line` 與理由。沒有證據的疑慮最多列為 `minor`，並註明需要確認。
- 不要因為測試都通過了，就放寬審查標準。
