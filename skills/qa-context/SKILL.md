---
name: qa-context
description: >
  qa-workflow 的第 1 階段：收集驗收範圍的事實（需求來源、程式變更、既有測試、環境、可用整合），
  產出 context.json。由 qa-workflow 調度，不做風險判斷、不設計用例。
---

# qa-context — 上下文收集

只收集**事實**，讓後面的階段有依據，不做判斷。

`qa` = `node "<本 skill 目錄>/../qa-workflow/bin/qa.mjs"`

- 寫入：`qa path context`（格式：`../qa-workflow/schemas/context.schema.json`）
- 範圍描述：`qa status --json` 的 `scope`，加上使用者在對話中提供的資訊

## 流程

### 1. 需求來源（`scope.sources`）

依使用者提供的內容逐一取得，每個來源一筆：

| 來源 | 做法 | `type` |
|---|---|---|
| 對話中的描述 | 摘要寫進 `scope.summary` | `text` |
| issue / ticket 連結或編號 | 有對應的 MCP 工具就讀取內容與子任務；沒有就只記錄連結 | `issue` |
| PR / 分支 | `git log`、`git diff --name-status <base>...HEAD` | `pr` / `diff` |
| 規格文件 | 讀取並摘要關鍵規則 | `doc` |
| 設計稿連結 | 有設計工具 MCP 就讀取畫面結構與狀態（之後會用來做原型與矩陣）；沒有就只記錄連結 | `design` |
| 直接指定的程式碼 | 讀取 | `code` |

`scope.inScope` / `scope.outOfScope`：明確列出這次驗收包含與不包含的東西。

### 2. 程式變更（`changes`）

1. 判斷基準分支：config 或使用者指定的優先，否則依序嘗試 `main`、`master`、`develop`。
2. 用 `git diff --name-status <base>...HEAD` 取得變更檔案，加上未提交的變更（`git status --porcelain`）。
3. 快速讀過主要變更檔案，在 `note` 寫一句它改了什麼。
4. 只有文字需求、沒有程式變更時，`changes` 可以是空陣列。

### 3. 既有測試（`existingTests`）

- 在 config `layers.*.dir` 與常見測試目錄中，找出與變更模組相關的測試檔。
- 在 `covers` 用一句話寫它測了什麼，讓用例設計階段可以去重。

### 4. 環境（`environment`）

記錄執行測試需要的條件：
- base URL
- 需要啟動的服務
- 測試帳號的**環境變數名稱**
- 需要的測試資料

**絕對不要把密碼、token、金鑰的值寫進任何產物。**

### 5. 整合（`integrations`）

- 列出可能用到的外部整合（issue tracker、設計工具、資料庫查詢等），以及本次是否可用（`available`）。
- 不可用不是錯誤，記錄下來即可。後續階段會據此調整做法。

### 6. 假設與待釐清（`assumptions`、`openQuestions`）

- 資料不足時先寫合理的假設，並標註為假設。
- 需要使用者或需求方回答的問題，寫進 `openQuestions`。會在用例確認時一併提出。

### 7. 驗證並回報

1. 執行 `qa validate context`。
2. 回報，內容包含：
   - 範圍摘要
   - 來源數與變更檔案數
   - 缺少的整合
   - 待釐清問題

## 規則

- 範圍完全不清楚（例如沒有描述、沒有連結、沒有分支）時，問使用者一個具體問題，不要猜。
- 不評論程式碼好壞，不列風險。那是下一階段的工作。
