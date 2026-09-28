# 產物

```
.qa/
├── config.json              # 專案設定（建議提交）
├── .gitignore               # 忽略 runs/、tmp/、current
├── current                  # 目前 run 的 id
├── reports/                 # 報告副本：<runId>.html、latest.html
├── tmp/                     # 測試框架輸出的 JUnit 等暫存檔
└── runs/<runId>/
    ├── state.json           # 階段與歷史（只由 CLI 修改）
    ├── context.json         # 0 上下文
    ├── risks.json           # 1 風險
    ├── design.json          # 2 測試矩陣、狀態機、技法、原型畫面、自審
    ├── design/
    │   ├── features/*.feature   # 2 BDD 情境（用例的唯一來源）
    │   └── prototype.html       # 2 互動原型（UI 功能才有）
    ├── cases.json           # 2 由 feature 解析出的情境清單（CLI 產生）
    ├── cases-review.html    # 2 六分頁審閱頁（CLI 產生）
    ├── confirmation.json    # ★ 確認紀錄與設計 hash（只由 CLI 產生）
    ├── plan/                # 5 planner 的計畫分檔（qa plan-merge 合併）
    ├── plan.json            # 5 每個 @auto 情境的可行性、證據、前置資料、oracle
    ├── tasks/               # 5 並行產生時，各 feature 的 task 分檔（qa tasks-merge 合併）
    ├── tasks.json           # 5 情境 ↔ 測試對照
    ├── results.json         # 4 執行結果、失敗分類、修復紀錄
    ├── logs/attempt-N-<layer>.log
    ├── review-checks.json   # 7 確定性檢查、審查範圍與 diff 分塊（CLI 產生）
    ├── review/              # 7 review.diff、chunk-N.diff、chunk-N.json（各分塊的審查結果）、檢查指令的 log
    ├── review.json          # 7 代碼審查評分與結論
    ├── report.html          # 6 報告
    └── summary.md           # 6 摘要
```

正式欄位定義都在 `../schemas/`。以下是各檔案的重點。

## context.json

- `scope`：`summary`、`sources[]`（type + ref）、`inScope`、`outOfScope`
- `changes[]`：變更檔案
- `existingTests[]`：相關既有測試與其覆蓋內容
- `environment`：執行條件（不含機密值）
- `integrations[]`：外部整合是否可用
- `assumptions[]`、`openQuestions[]`

## risks.json

`risks[]`：`id`（R-n）、`title`、`level`（P0–P3）、`area`、`impact`、`likelihood`、`evidence[]`（至少一條）

## design.json

| 欄位 | 內容 |
|---|---|
| `scenarios[]` | 情境索引：`id`（TC-n）、`file`、`title`（與 Scenario 標題相同）、`priority`、`riskIds`、`type` |
| `matrices[]` | 測試矩陣：`id`（M-n）、`title`、`technique`、`columns`、`rows[]`（`cells`、`caseIds` 或 `skipReason`） |
| `stateMachine` | `entity`、`initial`、`states`、`transitions[]`（`from`、`to`、`trigger`、`valid`、`reason`、`caseIds`） |
| `coverage.techniques[]` | 12 種技法逐項判定：適用時填 `caseIds`，N/A 時填 `reason` |
| `coverage.deferredRisks[]` | 延後處理的 P0/P1 風險與理由 |
| `prototype` | `file`、`platform`（`app` 或 `web`），或 `skipReason`。畫面與情境示範寫在原型 HTML 中 |
| `selfReview` | 獨立評審的 `score`、`rounds`、`breakdown`、`notes` |
| `openQuestions[]` | 待釐清問題 |

## design/features/*.feature

BDD 情境，撰寫規範與 tag 規則見 `../../qa-cases/references/gherkin.md`。

## cases.json（CLI 產生）

由 feature 解析並與 `scenarios` 索引合併：`id`、`title`、`priority`、`riskIds`、`type`、
`manual`（沒有 `@auto`）、`smoke`、`boundary`（`@邊界`）、`tags`、`labels`（描述性 tag）、`feature`、`section`、`file`、`line`，
以及 `preconditions`（Background + Given）、`steps`（When）、`expected`（Then）。

## confirmation.json

`confirmedAt`、`confirmedBy`、`note`、`designHash`（design.json + 所有 feature + 原型的 SHA-256）、`caseIds`

## tasks.json

`designHash`（必須等於確認時的 hash）、`tasks[]`：`id`（T-n）、`caseId`、`layer`、`file`、`testName`（Scenario 標題）、`assertions`

## plan.json

`designHash`、`entries[]`：`caseId`、`feasibility`（AUTOMATABLE／NEEDS_API_SETUP／NOT_FEASIBLE）、`probed`（是否實際操作過畫面）、
`evidence`（證據圖路徑#錨點，證據圖放在專案的 `evidence/`）、`reason`、`apiSetup[]`、`oracles[]`（`then`、`observable`、`locator`）

## results.json

| 欄位 | 內容 |
|---|---|
| `attempts` | 已執行次數 |
| `executions[]` | 每次各 layer 的指令、exit code、log、JUnit 路徑 |
| `results[]` | `taskId`、`status`（passed/failed/blocked/skipped/not-run）、`classification`、`reason`、`message`、`evidence` |
| `repairs[]` | 修復紀錄：`attempt`、`taskId`、`change`、`files` |
| `oracleAudit[]` | 防假綠檢查：`taskId`、`mutation`（改了哪條斷言）、`turnedRed`、`log` |

## review-checks.json（CLI 產生）

`passed`、`checks[]`（`name`、`command`、`status`、`detail`、`log`）、`scan`（`files`、`hits[]`）、
`scope`（`files[]`、`diffFile`、`diffLines`、`chunks`）

## review.json

`checksHash`、`score`、`breakdown`（fidelity、reliability、style、productRisk、maintainability，各 0–20 分）、`verdict`（APPROVE／APPROVE_WITH_FIXES／BLOCK）、
`summary`、`strengths[]`、`findings[]`（`id`、`severity`：critical／important／minor、`category`、`title`、`file`、`line`、`detail`、`suggestion`、`relatedCaseIds`）、`suggestions[]`
