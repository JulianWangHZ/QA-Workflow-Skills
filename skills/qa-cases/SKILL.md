---
name: qa-cases
description: >
  qa-workflow 的第 3 階段：依上下文與風險，依序產出測試矩陣、狀態機、互動原型與 BDD feature（Gherkin），
  逐項套用 12 種測試設計技法並經獨立評審，力求情境覆蓋最大化；CLI 會把結果組成多頁審閱 HTML 給 PM／QA 確認。
  通常由 qa-workflow 調度；已有 qa run 時，使用者要求「設計測試案例 / 寫 BDD / 畫狀態機 / 做原型 / 測試矩陣」也可直接使用。
  不寫測試腳本、不執行測試。
---

# qa-cases — 用例設計（BDD）

目標：**讓漏測在源頭就被看見，並讓 PM 和 QA 都看得懂。**

依序產出下列內容。前一項是後一項的依據：

```
測試矩陣 → 狀態機 → 互動原型 → BDD feature → 獨立評審
```

`qa` = `node "<本 skill 目錄>/../qa-workflow/bin/qa.mjs"`

## 產物

| 路徑（`qa path design-dir` 之下） | 內容 | 格式 |
|---|---|---|
| `../design.json` | 情境索引（編號、優先級、風險、類型）、測試矩陣、狀態機、技法清單、原型設定、自審 | `../qa-workflow/schemas/design.schema.json` |
| `features/*.feature` | **用例本身**：BDD 情境，是唯一的真實來源 | `references/gherkin.md` |
| `prototype.html` | 互動原型與情境示範（UI 功能才做） | `references/prototype.md` |

- `cases.json` 與審閱頁 `cases-review.html` 由 CLI 在 `qa gate cases` 時產生，**不要手寫**。
- 本 skill **不**執行 `qa gate`、`qa confirm`，由調度者負責。

## 流程

### 1. 讀懂範圍

1. 讀取 `qa path context`、`qa path risks`，以及 context 指到的程式碼、既有測試與需求來源。
2. 業務規則以程式碼與需求為準。找不到依據的規則寫進 `design.json` 的 `openQuestions`，不要自行假設成預期結果。
3. 有設計稿連結、且有可用的設計工具 MCP 時，**必須讀取實際畫面**，從畫面中找出元件、狀態（空、停用、錯誤）、入口與跳轉，列入矩陣維度。

### 2. 測試矩陣（`design.json` → `matrices`）

讀 `references/techniques.md`，依技法把功能拆成矩陣。每張矩陣包含：
- `id`：`M-n`
- `title`
- `technique`
- `columns`
- `rows`

常見矩陣：

| 矩陣 | 技法 | 欄位例 |
|---|---|---|
| 輸入等價類與邊界 | equivalence / boundary | 欄位、值、類別（有效/無效/邊界）、預期 |
| 決策表 | decision-table | 條件 A、條件 B、…、結果 |
| 角色 × 動作 | role-permission | 角色、可見、可操作、預期 |
| 動作路徑 | path | 動作、正向、負向、例外 |
| 資料生命週期 | data-lifecycle | 物件、新增/讀取/修改/刪除、空/首筆/大量 |
| 環境差異 | environment | 設定或 flag、值、預期差異 |

**每一列**都要做以下其中一件事，CLI 會檢查：
1. 對應到至少一個情境：`caseIds`。
2. 寫出不測的理由：`skipReason`，例如「前端已阻擋，後端另有單元測試」。

### 3. 狀態機（`design.json` → `stateMachine`）

功能有狀態流轉時（訂單、審核、訂閱、帳號鎖定、表單步驟、按鈕啟用/停用）：

- 必填：`states`、`transitions`。選填：`entity`（狀態主體，例如「訂單」）、`initial`。
- 每條轉換包含：`from`、`to`、`trigger`（白話觸發條件）、`valid`、`caseIds`。
- **每條合法轉換至少一個情境。**
- **列出不該發生的轉換**：`valid: false`，並在 `reason` 寫出為什麼不允許，再用負向情境驗證系統會擋下。

沒有狀態流轉時，`states` 與 `transitions` 維持空陣列，並把 `state-transition` 技法標為 N/A、寫理由。

### 4. 互動原型（`design/prototype.html`）

範圍包含畫面或 UI 流程時，**必須做**。純 API、批次、後端邏輯時可以不做。規格見 `references/prototype.md`：
1. 複製 `assets/prototype-starter.html` 到 `qa path design-dir` 下的 `prototype.html`。
   - App 產品設為 `data-platform="app"`，只有 iPhone 17 Pro。
   - 網頁產品設為 `data-platform="web"`，有桌面瀏覽器與手機兩種檢視，同一份畫面依寬度自動切換版面。
2. 依矩陣與狀態機補上畫面，包含正常、空、載入、錯誤、停用、權限不足等關鍵狀態。畫面要能直接點擊、輸入、切換，讓 PM 實際走一遍流程。
3. 寫好 BDD 之後，回來在 `qa-scenarios` 為**每一個情境**寫情境示範：每個 Given／When／Then 步驟都對應畫面上的操作（輸入、點擊、預期結果標示）。審閱時點選情境，裝置會自動播放。
   - 時間、次數、併發這類看不到的規則，用原型內的模擬函式建立狀態。
   - 只有完全沒有畫面的情境，才能標 `noUi` 並寫原因。CLI 會檢查每個情境都有示範。
4. 在 `design.json` 寫 `prototype`：
   - 有做：`{ "file": "prototype.html", "platform": "app" | "web" }`
   - 不做：`{ "skipReason": "<理由>" }`

### 5. BDD feature（`design/features/*.feature`）

依 `references/gherkin.md` 撰寫，重點：
- **英文關鍵字、中文內容**：`Feature / Background / Scenario / Given / When / Then / And`，不加 `# language`。
- 一個業務功能一個檔案，檔名用英文 kebab-case。檔頭寫 `# 頁面 code 路徑：` 與 `# 註：`。
- `Feature:` 下方三行：`作為一個…`／`我想要…`／`以便…`，PM 以此對 AC。
- 用 `# ####…` 段落分隔，依業務功能分組 Scenario。
- **每個 Scenario 只驗一件事**，宣告式、第一人稱（「我…」），具體資料用雙引號。不用 Scenario Outline。
- Tag 三軸加描述，CLI 會檢查：

  | 類別 | Tag | 規則 |
  |---|---|---|
  | 套件 | `@regression`（必填）、`@smoke` | `@smoke` 只給核心成功流程 |
  | 執行 | `@auto` | 能程式化執行與驗證就標；沒有代表人工驗收 |
  | 性質 | `@邊界` | 只給臨界值、資源耗盡、競態、故障 |
  | 描述 | 中文頁面 tag + 情境條件 tag | 至少一個 |

- 編號、優先級、風險、類型**不放進 tag**，寫在 `design.json` 的 `scenarios`（以檔案 + 標題對應）。
- 只寫情境，不區分 unit、api、e2e。怎麼自動化是腳本階段的事。
- 寫完執行 `qa validate features`：它會檢查語法、tag，以及 feature 與 `scenarios` 索引是否一一對應。修到沒有錯誤。

### 6. 回填對應並檢查覆蓋

1. 把情境 ID 回填到矩陣列、狀態轉換，以及 `coverage.techniques[].caseIds`；原型畫面的 `data-cases` 也要標上。
2. 12 項技法逐一判定：
   - 適用 → 列出對應情境
   - 不適用 → `applicable: false` 並寫具體理由（「不需要」不算理由）
3. 風險覆蓋：
   - 每個 P0/P1 風險至少一個情境，而且至少一個情境的 `type` 不是 `positive`。
   - 真的無法在本輪覆蓋的，寫進 `coverage.deferredRisks` 並附理由。
4. 無法用程式驗證的情境（例如視覺確認、真實簡訊、人工審核）不標 `@auto`，並在 `# 註：` 說明原因。
5. **去重**：
   - 既有測試已覆蓋、且本次沒有變更的行為，不重寫。
   - 同類資料的變體用等價類挑代表值；需要多組資料時，拆成獨立的 Scenario。

### 7. 獨立評審（最多 `caseDesign.maxReviewRounds` 輪，預設 3）

**由調度者派評審 subagent 時**（一般情況，因為 subagent 不能再派 subagent）：
- 你是設計者，跳過這一步。調度者會把評審意見放進下一次的 prompt，你只需要依意見修正。
- 最後一次被派時，調度者會提供評審結果，由你寫入 `selfReview`。

**自己被直接呼叫、而且有 Agent 工具時**：
1. 用 Agent 工具開一個**全新上下文**的 subagent 當評審。給它：
   - design.json、features 目錄、原型、context、risks 的路徑
   - `references/review-rubric.md`
   - 要求它只評分並列出問題，不改檔案
2. 分數未達 `caseDesign.minReviewScore`（預設 85）：
   1. 逐條處理評審提出的問題。
   2. 不採納的問題寫下理由。
   3. 再送一輪評審。
3. 把結果寫進 `design.json` 的 `selfReview`：
   - `score`：最後一輪分數
   - `rounds`
   - `breakdown`：各維度分數
   - `notes`：重要修正與未採納的理由
4. 環境沒有 Agent 工具時，自己依 rubric 嚴格評分，並在 `notes` 註明「無獨立評審」。

### 8. 驗證並回報

1. 執行 `qa validate design`，再執行 `qa validate features`，兩者都修到沒有錯誤。
2. 回報調度者，內容包含：
   - 情境數，依優先級分佈，以及沒有 `@auto`（人工驗收）的數量
   - 矩陣數、狀態轉換數、原型畫面數
   - 評審分數
   - 延後的風險
   - 待釐清問題

## incremental 模式

- 沿用既有的 feature 與 design，已確認情境的編號不變。
- 新增情境接續最大編號。矩陣、狀態機、原型、技法清單要一併更新，反映新增的範圍。
- 回報時列出新增與修改的情境，讓調度者在確認點只展示差異。

## 禁止

- 在確認前建立任何測試檔或 step definitions。
- 為了讓 gate 通過而把適用的技法標成 N/A、給矩陣列亂填 `skipReason`，或把 P0/P1 風險丟進 deferredRisks。
- 預期結果寫成「正常」「成功」「200 或 400」這類無法判定的描述。
