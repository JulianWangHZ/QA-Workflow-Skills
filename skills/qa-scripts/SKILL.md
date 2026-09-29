---
name: qa-scripts
description: >
  qa-workflow 的第 5 階段（腳本生成）。分兩個角色：planner 先實際操作畫面、判定每個 @auto 情境的可行性並產出證據圖，
  generator 再依證據圖寫出自動化測試。只在用例已被使用者確認後執行，把已確認的 BDD 情境轉成自動化測試
  （BDD 專案放入 feature 並撰寫 step definitions；非 BDD 專案寫成一般測試），
  並產出 tasks.json（情境 ↔ 測試檔 ↔ 測試名稱）。由 qa-workflow 調度。
---

# qa-scripts — 腳本生成

把**已確認**的 BDD 情境變成可執行的測試。情境就是規格，腳本必須忠實實現它，不能自行增刪預期。

`qa` = `node "<本 skill 目錄>/../qa-workflow/bin/qa.mjs"`

- 讀取：`qa path features` 下已確認的 feature、`qa path cases`（CLI 解析出的情境清單）、`qa path confirmation`、`.qa/config.json`、專案既有測試
- 寫入：測試檔（只能寫在 `config.repair.allowedPaths` 內）、`qa path tasks`（格式：`../qa-workflow/schemas/tasks.schema.json`）

## 兩個角色

| 角色 | 做什麼 | 產出 | 規範 |
|---|---|---|---|
| **Planner** | 實際操作畫面（Playwright MCP／Appium MCP，**缺少就停下來請使用者設定，不用猜的**），記錄 locator 與 oracle，判定可行性：`AUTOMATABLE`、`NEEDS_API_SETUP`、`NOT_FEASIBLE` | `evidence/<feature>.md`、`plan/<feature>.json` → `qa plan-merge` → `plan.json` | `references/planner.md` |
| **Generator** | 依證據圖寫 step、Page Object、fixture。**每個 selector 都要能在證據圖中找到**；`NOT_FEASIBLE` 的情境不寫 | 測試檔、`tasks.json`（或 `tasks/<feature>.json`） | 本文件下方與 `references/coding-style.md` |

先逐個 feature 做 planner，執行 `qa plan-merge`，再逐個 feature 做 generator。
**做 planner 時只看 `references/planner.md`，不要寫測試程式碼。** 以下內容是給 generator 的。

## Generator 的額外規則

- 讀 `qa path plan` 與對應的證據圖。只處理判定為 `AUTOMATABLE` 或 `NEEDS_API_SETUP` 的情境。
- **selector 只能用證據圖中驗證過的。** 證據圖沒有記錄的元素，不要自己猜。需要的話，回到 planner 補做這個情境。
- `NEEDS_API_SETUP` 的前置資料，依 `apiSetup` 在 Given 中透過 API client 或 factory 建立。
  - API 標為 `available: false` 時，先寫好呼叫的介面，並標上 `TODO` 與來源；該 task 的預期結果可能是 blocked。
- Then 的斷言要驗證證據圖記錄的 oracle，不能換成比較寬鬆的版本。
- 證據圖標為「不可觀察」的 oracle，寫成 `TODO` 並在回報中列出，不要用比較弱的斷言頂替。

## 前置檢查

`qa status` 的 stage 必須是 `scripts`，而且 `confirmation.json` 存在。
不符合就停下並回報，**不要產生任何測試檔**。

## 流程

### 1. 學習專案慣例與 coding style

**預設規範**：`references/coding-style.md` 是所有框架共用的原則（分層、Page／Screen Object、selector、等待、fixtures、命名、註解、禁止清單）。
**框架專屬的寫法**：讀 `.qa/config.json` 的 `profiles`，依你負責的 layer 找到對應 profile 的 `style`，再讀 `references/styles/<style>`：
- `typescript-playwright.md`：TypeScript + Playwright（playwright-bdd／cucumber-js）
- `typescript-webdriverio.md`：TypeScript + WebdriverIO（+ Appium）
- `python-bdd.md`：Python + pytest-bdd／behave（Playwright、Selenium、Appium）
- `python-pytest.md`：Python + 純 pytest，不用 BDD（Playwright、Selenium、Appium）

同一個 repo 有多個 profile 時（例如 web 與 app），每個情境依它要跑的平台寫進對應 profile 的目錄與 layer。專案已有自己的規範時以專案為準。

1. 讀 config 的 `layers`，以及各 layer 的 `dir`、`command`。
2. 讀 2–3 個既有測試，記下：
   - 測試框架與檔名慣例
   - fixture、helper、page object、factory
   - 資料準備與清理的方式
   - 斷言風格
3. **優先重用既有的 helper 與 fixture**，不要另起一套。
4. 專案完全沒有自動化框架時，先問使用者要用哪個 profile（見上方三種），再依對應的範例檔建立最小骨架：
   - Base Page／Screen、fixtures 合併檔、一個 domain 的 fixtures、tags、hooks
   - 只建立這次需要的部分，並在回報中說明

### 多個 feature 時逐個處理

1. 先建立或確認共用的基礎，例如 BasePage、`test.fixtures.ts`、`common.steps.ts`、`tags.ts`。
2. 一次處理一個 feature 中標了 `@auto` 的情境，寫這個領域的檔案：`{domain}.steps.ts`、這個領域的 Page Object、`{domain}.fixtures.ts`。需要修改共用檔案時直接改。
3. 每個 feature 的結果寫到 `.qa/runs/<runId>/tasks/<feature 檔名>.json`，格式見 `../qa-workflow/schemas/tasks-part.schema.json`。不需要填 task id 與 designHash，這些由 `qa tasks-merge` 產生。中斷後可以從沒有分檔的 feature 接續。
4. 全部完成後執行 `qa tasks-merge`。

### 2. 選擇實作方式

| config | 做法 |
|---|---|
| 有 `bdd.featuresDir`（BDD 專案） | 1. 把 `qa path features` 下的 feature **原樣複製**到 `bdd.featuresDir`，可以放在子目錄，但內容一個字都不能改。<br>2. 只撰寫 step definitions（放在 `bdd.stepsDir` 或專案慣用位置）。<br>3. 沒有 `@auto` 的情境也一併放入，由專案的 tag 設定（例如只跑 `@auto`）排除執行。 |
| 沒有 `bdd` | 依 layer 寫成一般測試。測試標題使用 Scenario 標題，測試內用註解標出對應的 Given/When/Then。不需要引入 BDD 框架。 |

BDD 專案的 `qa gate scripts` 會以 Scenario 標題比對專案中的 feature 與確認內容。tag 或步驟有任何差異都會被擋下。
發現情境本身有問題時，不要在專案中直接修改 feature，要回報使用者。

### 3. 每個標了 `@auto` 的情境至少一個 task

| 欄位 | 規則 |
|---|---|
| `id` | `T-<數字>` |
| `caseId` | 對應的用例 |
| `layer` | 用哪一組測試指令執行，必須是 `config.layers` 中已設定的名稱，例如 `e2e`、`e2e-ios`、`e2e-android`、`unit`。情境本身不分層；web 情境放 web profile 的 layer，app 情境放 app profile 的 layer |
| `file` | 測試檔相對專案根目錄的路徑 |
| `testName` | JUnit 報告中的測試名稱。BDD 框架用 **Scenario 標題**，例如 `庫存不足時無法下單`；純 pytest 用**測試函式名稱**，例如 `test_庫存不足時無法下單` |
| `assertions` | 列出每個 `expected` 對應的斷言摘要 |

`qa run` 用 `testName` 去比對 JUnit 報告中的測試名稱（部分符合即可），所以測試標題要包含 `testName`。
不同 BDD 框架產生的測試名稱格式不同，必要時先跑一次列舉模式確認。

### 4. 撰寫測試

- 每個 Then 都要有對應斷言。沒有斷言、或只斷言「沒有丟出錯誤」的測試不算完成。
- step definitions 以業務語句對應，同一句步驟只實作一次並重用。
- **step 要薄**：只做「解析參數 → 呼叫 Page 或 API 的業務方法 → 斷言」三件事。
  - feature 中的宣告式步驟，在 Page Object 中實作成 composite method，例如 `login()`。
- selector 集中宣告在 Page Object 頂端，優先順序是 `data-testid` → role／label → 文字。
  - 不使用結構性 CSS 或 XPath。
- 前置資料在 `Given` 中透過 API 或 factory 建立。
- 前置條件用程式建立，測試結束要清理。不依賴其他測試的執行順序。
- 用明確的等待條件（`expect` 自動等待、`waitForURL`、`waitForResponse`），不用 `waitForTimeout`。
- 註解用團隊語言，只寫不明顯的原因，每個區塊最多 1 行。不用 `console.log`，改用 logger。
- 不留 `.only`、`.skip`、`xit`、被註解掉的斷言。
- 密碼、token 從環境變數讀取，不寫死在測試裡。
- 需要產品程式碼提供測試入口（例如 test id、測試用 API）時：
  1. **不要修改產品程式碼**。
  2. 把該用例的 task 照樣建立。
  3. 在回報中列出需要的變更，告知使用者。

### 5. 產出 tasks.json

- `designHash` 必須等於 `confirmation.json` 的 `designHash`，直接複製。
- 產出後執行 `qa validate tasks`。

### 6. 自我檢查（含 coding style）

1. 依技術棧做最基本的語法或型別檢查，例如 `node --check`、`tsc --noEmit`、`python -m py_compile`，或測試框架的列舉模式（例如 `npx bddgen`、`cucumber-js --dry-run`、`behave --dry-run`），確認每個步驟都有對應的 step definition。
2. BDD 專案執行 `qa validate features --dir <bdd.featuresDir>`。
3. 執行專案的 type-check、format 與 lint（例如 `npm run check`）。代碼審查階段的 `qa review-checks` 會再跑一次，失敗時結論會是 BLOCK。
4. 對照 `references/coding-style.md` 的禁止清單逐項檢查。
5. 不需要在這一步跑完整測試。執行是下一階段的工作。

### 7. 回報

回報，內容包含：
- 新增與修改的檔案
- task 數量
- 無法自動化或需要產品配合的用例

## 禁止

- 修改 `design/` 下的任何檔案，或在專案中改寫已確認的 feature。發現情境本身有問題時，回報使用者，由使用者決定是否重新確認。
- 修改 `config.repair.allowedPaths` 以外的檔案。
