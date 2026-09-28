# CLI 指令

```bash
node "<qa-workflow skill 目錄>/bin/qa.mjs" <指令> [參數]
```

- 需要 Node.js 20 以上，沒有其他依賴。
- 所有指令都在專案內任一目錄執行，會往上尋找 `.qa/config.json`。
- exit code：0 成功；1 檢查未通過或發生錯誤；2 用法錯誤。

| 指令 | 用途 |
|---|---|
| `init [--force] [--language zh-TW\|en]` | 偵測技術棧並建立 `.qa/config.json` 與 `.qa/.gitignore` |
| `start [--scope 文字] [--mode full\|incremental\|rerun] [--from runId] [--name 名稱] [--force]` | 開始新的 run。還有未完成的 run 時需要加 `--force` |
| `status [--json]` | 目前 run 的階段、產物狀態與下一步 |
| `validate <artifact> [--file 路徑]` | 只做 schema 驗證，不推進階段。artifact：context、risks、design、cases、confirmation、tasks、results、review、config |
| `validate features [--dir 目錄]` | 解析並檢查 feature（語法與必要 tag）。預設檢查 run 的 `design/features/` |
| `gate <stage> [--check]` | 檢查該階段的放行條件，通過後推進。`--check` 只檢查、不推進 |
| `confirm --by <確認者> [--note 備註]` | 記錄使用者已確認用例，並以 hash 鎖定。**只能在使用者明確同意後執行** |
| `rewind <stage>` | 退回到較早的階段，例如使用者要求修改用例時退回 `cases` |
| `run [--layer unit,api,e2e] [--force]` | 執行測試，把 log 與結果寫入 run 目錄。到達修復上限後需要 `--force` |
| `review-merge [--pending] [--summary 文字]` | 合併 `review/chunk-*.json` 成 `review.json`（各維度取最低分、去重、重新編號、計算 verdict）。`--pending` 只列出待審的分塊 |
| `plan-merge` | 合併 planner 的 `plan/<feature>.json` 成 `plan.json`，列出各判定的數量與無法自動化的情境 |
| `tasks-merge` | 合併並行產生的 `tasks/<feature>.json` 成 `tasks.json`，重新編號並列出共用檔案的修改需求 |
| `review-checks` | 代碼審查的確定性檢查：feature 一致性、coding style 掃描、`config.review.checks` 指令；產出審查範圍與分塊 diff |
| `report [--force]` | 產生 `report.html`、`summary.md` 並推進到 done。`--force` 可在未完成時產生報告 |
| `render-review` | 重新產生審閱頁 `cases-review.html` |
| `path [artifact\|design-dir\|features\|review-page\|logs]` | 印出 run 目錄或某個產物的絕對路徑 |
| `doctor` | 檢查 Node 版本、設定、測試指令、確認紀錄是否有效 |
