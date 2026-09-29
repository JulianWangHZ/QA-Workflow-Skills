---
name: qa-workflow
description: >
  端到端 QA 驗收流程的入口與調度者。使用者要求對某個功能、需求、issue、PR、分支或模組做驗收、
  回歸測試、品質檢查、「幫我 QA / 測這個功能 / 驗收這張單」時使用。依序調度
  上下文收集 → 風險分析 → 用例設計 → 人工確認 → 腳本生成 → 執行與修復 → 代碼審查 → 報告，
  只在用例確認處停下等使用者。也用於「繼續 QA」「QA 進度」接續中斷的流程。
  不適用：單純寫一個單元測試、一般除錯、與驗收無關的程式開發。
---

# QA Workflow — 調度者

你負責推進整個流程：**在主對話中依序載入每個階段的子 skill 並親自執行**，每一步都回報進度，並在 gate 把關、與使用者溝通。

```
context → risk → cases → ★confirm → scripts → run → review → report → done
上下文     風險    用例    人工確認    腳本      執行修復  代碼審查  報告
```

## CLI

所有狀態與產物都由 CLI 管理。以下 `qa` 代表：

```bash
node "<本 skill 目錄>/bin/qa.mjs"
```

本 skill 目錄在 skill 被載入時會提供（Base directory）。子 skill 位於同一層目錄，
它們使用 `<子 skill 目錄>/../qa-workflow/bin/qa.mjs`。指令總覽見 `references/cli.md`。

## 開場（每次被觸發都先做）

1. 在專案根目錄執行 `qa status`。
2. 若回報「找不到 .qa/config.json」：
   1. 執行 `qa init`。
   2. 把偵測到的測試指令給使用者看，請使用者確認或修正（只有第一次需要）。
   3. 設定說明見 `references/config.md`。
3. 若沒有進行中的 run，或上一個 run 已是 `done`：
   1. 用一句話和使用者確認驗收範圍。已經很明確就不必再問。
   2. 執行 `qa start --scope "<範圍>" --name <短名稱>`。
   3. 需要沿用上一輪時加 `--mode`，見下方「模式」。
4. 若有進行中的 run：告訴使用者目前在哪個階段，從該階段接續。

## 主迴圈：在主對話中依序執行

所有階段都在主對話中執行：用 Skill 工具載入對應的子 skill，照著它做完，再執行 gate。
不派 subagent。這樣使用者能即時看到每一步在做什麼，也不會因為子代理重複讀取上下文而多耗時間與 token。

| stage | 執行方式 | 主要產物 | 完成後 |
|---|---|---|---|
| context | 載入 `qa-context` | `context.json` | `qa gate context` |
| risk | 載入 `qa-risk` | `risks.json` | `qa gate risk` |
| cases | 載入 `qa-cases`：設計 → 評審 → 修正（見下方） | `design.json`、`design/features/*.feature`、`design/prototype.html` | `qa gate cases` |
| confirm | **你 + 使用者** | `confirmation.json` | `qa confirm --by <名字>` |
| scripts | 載入 `qa-scripts`：逐個 feature 做 planner → `qa plan-merge` → 逐個 feature 做 generator（見下方） | `evidence/`、`plan.json`、測試檔、`tasks.json` | `qa gate scripts` |
| run | 載入 `qa-run`：執行 → healer → 防假綠檢查（見下方） | `results.json` | `qa gate run` |
| review | `qa review-checks` → 載入 `qa-code-review`，逐塊審查 → `qa review-merge`（見下方） | `review-checks.json`、`review.json` | `qa gate review` |
| report | 直接執行 `qa report`，再讀 `summary.md` 回報 | `report.html`、`summary.md` | 推進到 done |

### 進度回報

每個步驟開始與結束都在聊天中輸出一行進度，讓使用者分得清現在在做什麼、做到哪裡：

| 時機 | 格式 |
|---|---|
| 開始 | `▶ [3/8 用例設計] 開始設計（2 個 feature），預計 3–5 分鐘` |
| 完成 | `✓ [3/8 用例設計] 設計完成：14 個情境。下一步：評審` |
| gate | `✓ gate cases 通過`，或 `✗ gate cases 失敗：<一句原因>，修正第 1/2 次` |
| 逐項處理 | 每處理完一個 feature 或分塊就回報一行，例如 `✓ planner 2/4：checkout 完成` |
| 等使用者 | `⏸ 等你：<要你做的事>`，讓使用者分得清是在跑還是在等 |

1. 階段編號：context 1、risk 2、cases 3、confirm 4、scripts 5、run 6、review 7、report 8。
2. 階段內有多個步驟時（設計 → 評審、planner → generator、run → healer → 防假綠），每個步驟都各自回報。
3. 時間依規模估一個範圍即可。只寫一行，不貼產物內容。

### 每一輪

1. `qa status` 取得目前的 stage。
2. 輸出「開始」進度行，用 Skill 工具載入該 stage 的子 skill，依它的流程執行。
3. 做完後輸出「完成」進度行，再執行該 stage 的 `qa gate`，並回報結果。
4. gate 通過 → 回到步驟 1，不需要問使用者。
5. gate 失敗 → 依錯誤原文修正後重跑 gate，最多 2 次。
6. 仍然失敗，或卡在需要使用者提供的資訊 → 輸出 `⏸` 進度行，說明卡在哪裡，只問一個具體的問題。拿到答案後繼續。

`⚠` 警告不擋流程，但要記下來，在確認點或最終報告時告訴使用者。

### 控制 context

所有階段都在同一個對話中，所以要主動節省 context：

- 階段之間只靠產物檔交接。進入新階段時，從產物檔讀需要的欄位，不依賴前面對話的記憶。
- 大檔（log、diff、`review-checks.json`）只讀需要的段落，用 `grep`、`sed -n` 或一行指令抽出，不整份讀進來。
- 逐個 feature、逐個分塊處理，每處理完一個就把結果寫成檔案，再處理下一個。中斷後可以從沒完成的部分接續。
- 指令輸出很長時，只看摘要或結尾。

### 用例設計：設計 → 評審 → 修正

1. 依 `qa-cases` 第 1–6 步完成設計，`selfReview` 先填 `{ "score": 0, "rounds": 0 }`。
2. 依 `qa-cases` 第 7 步做評審：切換成評審角色，**重新從檔案讀取**產物，依 `qa-cases/references/review-rubric.md` 嚴格評分，列出問題。
3. 分數未達 `caseDesign.minReviewScore`：逐條修正，再評審一輪。最多 `caseDesign.maxReviewRounds` 輪。
4. 把評審結果寫進 `design.json` 的 `selfReview`（`score`、`rounds`、`breakdown`、`notes`），再執行 `qa gate cases`。

### 腳本生成：planner → generator

0. **先確認工具**：執行 `qa doctor`，它會依產品平台（web 或 app）檢查 Playwright MCP／Appium MCP 是否已設定。
   - 缺少時**停下來**，把 doctor 提示的設定方式告訴使用者，並說明設定後要重新啟動 Claude Code，再說「繼續 QA」。
   - **不要**在缺少工具的情況下做 planner，也不要改用猜的。
1. **Planner**：依 `qa-scripts/references/planner.md`，**一次處理一個 feature**，實際操作畫面，寫出證據圖與 `plan/<feature>.json`。
   - 工具連不上、模擬器沒開、網址無法連線時，停下來請使用者處理，處理好之後從這個 feature 接續。
2. 執行 `qa plan-merge`：合併成 `plan.json`，並列出各判定的數量與無法自動化的情境。**不需要停下來問使用者**：
   - `NOT_FEASIBLE` 的情境會在最終報告中列為「無法自動化，需要人工驗證」，附上原因。
   - 實際畫面和情境不一致的地方，記下來，最終報告時一併說明。
3. **Generator**：依 `qa-scripts` 的流程，只使用證據圖中的 selector。
   - 只有 1 個 feature → 直接寫 `tasks.json`。
   - 多個 feature：先建立或確認共用的基礎（BasePage、fixtures 合併檔、common steps、tags），再**一次處理一個 feature**，結果寫到 `tasks/<feature>.json`，全部完成後執行 `qa tasks-merge`，最後跑型別與格式檢查。
4. 執行 `qa gate scripts`。它會檢查：
   - 每個 `@auto` 情境都有計畫與證據檔。
   - 可行的情境都有 task。
   - `NOT_FEASIBLE` 的情境沒有 task。

### 執行與修復：run → healer → 防假綠

1. 依 `qa-run` 執行 `qa run`，並替每個失敗分類。
2. 有測試缺陷時，依失敗的 feature 分組，一次修一組，每個測試最多修 `run.maxHealRounds` 輪。
3. 全部處理完之後，做防假綠檢查，寫入 `oracleAudit`。
4. 執行 `qa gate run`。

### 代碼審查：確定性檢查 → 逐塊審查 → 合併

1. 執行 `qa review-checks`。只看它印出的摘要，不要整份讀 `review-checks.json`。
2. 執行 `qa review-merge --pending`，列出待審的分塊。中斷後重跑時，只會列出還沒審完的分塊。
3. 依 `qa-code-review`，**一次審一塊**：
   - 從 `review-checks.json` 的 `scope.chunks` 用一行指令抽出這一塊的 `diffFile` 與 `features`。
   - 只讀這一塊的 diff、相關 feature 與 `qa-code-review/references/review-rubric.md`。
   - 結果寫到 `.qa/runs/<runId>/review/chunk-<id>.json`（格式：`schemas/review-chunk.schema.json`，`checksHash` 用 `qa review-checks` 印出的值），再審下一塊。
4. 執行 `qa review-merge`：合併所有分塊，計算分數與 verdict，寫入 `review.json`。
5. 執行 `qa gate review`。

## ★ 人工確認：唯一的強制停點

`qa gate cases` 通過後，停下來請使用者確認用例。

**審閱頁**：`qa path review-page`（`cases-review.html`），給使用者檔案的絕對路徑，讓他用瀏覽器開啟。共 6 個分頁：

| # | 分頁 | 給誰看 |
|---|---|---|
| 1 | 產生方式：流程、範圍、風險與覆蓋、12 項技法、評審分數、待釐清問題 | 全部 |
| 2 | 測試矩陣 | PM、QA |
| 3 | 狀態機：狀態圖 + 轉換表（允許／應被阻擋） | PM、QA |
| 4 | 互動原型：點選情境自動示範，也可以自由操作；app 用 iPhone，web 可切換桌面與手機 | PM、設計、CS |
| 5 | 驗收清單：白話表格，每列一個情境，可以勾選核對 | PM、CS |
| 6 | BDD Feature：Gherkin 原文，將直接轉成自動化測試 | QA、工程師 |

**聊天中精簡呈現**：
1. 情境數量，依優先級分佈，以及需要人工驗收（沒有 `@auto`）的數量。
2. P0/P1 風險的覆蓋狀況，以及延後處理的風險與理由。
3. 標為 N/A 的技法與理由，讓使用者判斷有沒有漏掉的維度。
4. 待釐清問題、評審分數，以及 gate 的 `⚠` 警告。
5. 審閱頁路徑。建議使用者把「驗收清單」分頁交給 PM 對 AC。

**判定確認**：
- 只有使用者對這批用例明確表示同意（例如「確認」「同意」「可以，繼續」「LGTM」）才算。
- 模糊回覆、只回答其中一個問題、或同時提出修改，都不算確認。
- 使用者要求修改時：
  1. 執行 `qa rewind cases`。
  2. 依使用者的原話修改設計；修改後重新評審。
  3. 重跑 `qa gate cases`，審閱頁會重新產生。
  4. 再次請使用者確認。
- 確認後執行 `qa confirm --by "<使用者名稱>" --note "<使用者原話摘要>"`。

**絕對禁止**：未經使用者同意執行 `qa confirm`；或在確認前產生任何測試腳本。
CLI 會以 hash 鎖定已確認的設計（design.json、所有 feature、原型）。確認後只要有任何改動，後續階段就會全部被擋下，需要重新確認。
BDD 專案中，放進專案的 feature 也必須與確認內容一致。

## 其他可以停下的情況

以下不是門禁，只在無法前進時才停：

- 第一次 `qa init` 後確認測試指令。
- 腳本生成前，Playwright MCP／Appium MCP 還沒設定好，或模擬器、測試網址無法使用。
- 缺少執行必要的環境、帳號或服務，且無法自行解決。
- `qa-run` 回報 `unclear-requirement`，需要使用者決定預期行為。

## 結尾

執行 `qa report`，讀 `summary.md`（很短），依 `qa-report` 的規則向使用者報告。報告內容包含：
1. 結論。
2. 主要依據。
3. 產品缺陷清單。
4. 報告路徑。

## 模式

| 模式 | 用途 | 行為 |
|---|---|---|
| `full`（預設） | 新的驗收範圍 | 從 context 開始 |
| `incremental` | 在上一輪基礎上加情境 | 複製上一輪的 context / risks / cases，從 context 開始增補。確認時只需展示新增或修改的用例 |
| `rerun` | 修復後重跑同一批用例 | 複製到 tasks 為止，直接從 run 開始。用例確認沿用上一輪 |

用法：`qa start --mode incremental|rerun [--from <runId>]`。不指定 `--from` 時沿用最近一次 run。

## 鐵則

1. 不修改產品程式碼。測試相關檔案只能寫在 `config.repair.allowedPaths` 範圍內。
2. 不手改 `state.json`、`confirmation.json`，只透過 CLI 改變狀態。
3. 不捏造結果：執行結果只能來自 `qa run` 與 log 證據。
4. gate 失敗不可繞過：不改 schema、不刪檢查、不為了過 gate 而弱化用例或斷言。
5. 對外動作（在 issue 留言、發通知）要先徵得使用者同意。

## 參考

- `references/artifacts.md`：產物目錄與各檔案欄位
- `references/gates.md`：每個 gate 的放行條件與最終結論規則
- `references/config.md`：`.qa/config.json` 設定
- `references/cli.md`：CLI 指令
- `schemas/*.schema.json`：產物的正式格式（CLI 用它驗證）
