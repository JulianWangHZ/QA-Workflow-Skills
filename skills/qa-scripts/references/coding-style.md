# 自動化測試 Coding Style

產生測試腳本時的預設規範。本文件是**所有框架共用的原則**：分層、step、Page／Screen Object、selector、等待、fixtures、資料、命名、禁止清單。
**各框架的寫法與範例**在 `styles/` 下，由 `.qa/config.json` 的 `profiles[].style` 指定：

| profile | 語言與框架 | 平台 | 範例檔 |
|---|---|---|---|
| `ts-playwright-bdd`、`ts-cucumber`、`ts-playwright` | TypeScript + Playwright（playwright-bdd／cucumber-js） | web | `styles/typescript-playwright.md` |
| `ts-webdriverio-appium`、`ts-webdriverio` | TypeScript + WebdriverIO（+ Appium），可搭配 @wdio/cucumber-framework | app（或 web） | `styles/typescript-webdriverio.md` |
| `py-pytest-bdd`、`py-behave` | Python + pytest-bdd／behave，驅動 Playwright、Selenium 或 Appium | web、app | `styles/python-bdd.md` |
| `py-pytest` | Python + 純 pytest（不用 BDD），驅動 Playwright、Selenium 或 Appium | web、app | `styles/python-pytest.md` |

同一個 repo 可以有多個 profile，例如 web 用 playwright-bdd、app 用 WebdriverIO + Appium。每個 profile 依自己的範例檔撰寫，**共用的原則一律依本文件**。

**優先順序**：專案已有自己的自動化框架與規範 → 沿用專案的；專案沒有，或規範沒提到的部分 → 依本文件與對應的範例檔。

> 下文提到的 `createBdd`、`BasePage`、`expect` 等名稱以 TypeScript 為例，Python 的對應寫法見 `styles/python-bdd.md`。

## 0. 範圍與紅線

| 可以改 | 不可以改 |
|---|---|
| step definitions、Page／Screen Object、Component、API client、fixtures、測試資料、設定檔 | `.feature`（已確認的用例，唯一的真實來源） |
| | BDD 框架產生的檔案（例如 `.features-gen/`，由工具重新產生） |
| | 產品程式碼 |

- **註解**用團隊的工作語言（預設繁體中文），寫「為什麼」，不寫「做了什麼」。
  - 每個新增或修改的區塊最多 1 行，只記錄不明顯的原因或陷阱；寧可 0 行。
- **命名自己說明用途**：
  - 變數用「它是什麼」命名，不用無意義的縮寫。
  - 布林值用 `is`／`has`／`can` 開頭；集合用複數。
  - 單字母變數只允許出現在一行內的簡短 `.map()`／`.filter()`。

## 1. 分層與依賴方向

```
.feature（唯讀）
   │  BDD 工具產生 → .features-gen/*.spec.js（不手改）
tests/steps/*.steps.ts        薄橋接：Gherkin 句子 → 呼叫 Page / API → 斷言
   │
src/pages/*.page.ts（web）     src/screens/*.screen.ts（app）
src/components/*               跨頁共用的 UI 區塊
   │
src/api · src/data · src/types · src/utils   純 TypeScript，不依賴測試框架
```

**依賴只能往下**：

| 層 | 禁止 |
|---|---|
| steps | 直接操作 `page`、寫 selector、寫業務邏輯（斷言除外） |
| pages／screens | 碰測試框架的 infra（fixture、testInfo）、用固定秒數等待 |
| api | 對外暴露原始 response、依賴任何測試框架 |

## 2. Step Definition

- 從 `createBdd(test)` 取得 `Given`／`When`／`Then`。`test` 必須是 `src/fixtures/test.fixtures.ts` 合併後的 test。
- **薄**，只做三件事：
  1. 解析參數。
  2. 呼叫 Page／Screen／API 的方法。
  3. 斷言。
- Page 物件透過 fixture 注入（在參數中解構取得），不自己 `new`。
- **優先重用**：寫新 step 前先找既有的 step；意思相同的句子，改用既有的措辭。
- 檔名依業務領域：`{domain}.steps.ts`。跨領域共用的放 `common.steps.ts`；hook 放 `_hooks.steps.ts`。
- 檔案內依 Given／When／Then 分段：

語言與框架專屬的範例見 `styles/` 下對應的檔案（見文件開頭的對照表）。

## 3. Page Object（web）／Screen Object（app）

- web 繼承 `BasePage`，app 繼承 `BaseScreen`。
- **selector 集中宣告在 class 頂端**，寫成回傳 Locator 的箭頭函式。DOM 改動時只需要改一處。
- 方法用**業務語意**命名（`login()`、`book()`、`cancel()`），不用 UI 語意（`clickSubmitButton()`）。
- **composite method**：把多個 UI 操作組成一個業務動作，給宣告式的 step 呼叫。
  - 例如 feature 寫「我以密碼 "wrong" 登入」，Page 就提供 `login({ password })`，而不是在 step 中依序填 Email、填密碼、按按鈕。

範例見 `styles/` 下對應的檔案。

### Selector 優先順序

| 平台 | 優先順序 | 規則 |
|---|---|---|
| web | `data-testid` → `getByRole`／`getByLabel` → `getByText`（只用在文案穩定的地方） | **禁止**結構性 CSS（`nth-child`、長串 class）與 XPath |
| app | `testID` → 可見文字、role、label → 語意錨點 → 結構定位（XPath、索引、座標） | 結構定位是最後手段：能穩定定位就先用，讓情境先跑起來；用到時加 1 行註解說明是哪個元素缺 `testID` |

缺少 `testID` 時不要卡住等前端補上：先用次一級的方式讓情境能跑，再把「請前端補 testID」列為後續改善。

### 等待

| 情境 | 用法 |
|---|---|
| 斷言畫面狀態 | `await expect(locator).toBeVisible()`（會自動等待） |
| 導頁之後 | `await page.waitForURL(pattern)` |
| 送出之後確認結果已寫入 | `await page.waitForResponse(pattern)`，避免 race condition |
| **禁止** | `page.waitForTimeout(ms)` 這類固定秒數等待 |

### 命名

| 類型 | Class 名稱 | 檔名 |
|---|---|---|
| Page | `{PascalCase}Page` | `{kebab-case}.page.ts` |
| Screen | `{PascalCase}Screen` | `{kebab-case}.screen.ts` |
| Component | `{PascalCase}Component` | `{kebab-case}.component.ts` |

頁面超過 5 個時，依業務領域分子目錄。

### App：一套程式跑 iOS 與 Android

預設 feature、step、screen 都共用一份。平台差異由輕到重處理：
1. 原生系統差異（權限彈窗、返回鍵、日期選擇器）收進 helper，對外只有一個業務方法。
2. 同一個方法中少量元素不同時，用 `if (platform)` 分支。
3. 整個畫面結構差太多時，才拆成 `{name}.ios.screen.ts`／`{name}.android.screen.ts`，由 fixture 依平台注入。

Screen 只依賴一個自己定義的 driver 介面，不直接依賴底層自動化工具的型別。這樣以後要換工具，只需要改 adapter。

## 4. Component

- 繼承 `BaseComponent`，封裝跨頁共用的 UI 區塊，例如 Toast、Modal、日期選擇器。
- 不放特定頁面的業務流程。

## 5. API Client

- 繼承共用的 `ApiClient`，它提供 get、post、patch、delete、錯誤處理與 log。
- 端點集中在 `src/api/endpoints.ts`，路徑要先對照後端實際的定義。
- **Raw／Clean 分層**：
  - `src/types/` 中，每個領域都有 `RawXxxResponse` 與整理後的 interface。
  - client 內用 `toXxx()` 轉換，對外只暴露整理後的型別。
- **用 API 建測試資料**：UI 測試的前置資料在 `Given` 中透過 API 建立，不用操作 UI 準備資料。

## 6. Fixtures

- **模組化**：每個領域一個 `{domain}.fixtures.ts`。
- `test.fixtures.ts` **只做 `mergeTests()`**，不定義任何 fixture。
  - 使用 playwright-bdd 時，`mergeTests()` 的第一個參數必須是 `import { test as bddTest } from "playwright-bdd"`，否則 `createBdd(test)` 會報錯。
- 新增 Page 時：
  1. 在對應的 `{domain}.fixtures.ts` 加上 fixture。
  2. 如果是新的領域，再把它併入 `test.fixtures.ts`。
- 多角色登入：各角色的 storage state 在 setup 專案中登入一次後重用。

## 7. 測試資料

- 假資料放在 `src/data/factory/*.factory.ts`，提供 `create(overrides?)` 與 `createMany(n, overrides?)`。
- 跟環境有關的 ID、帳號從環境變數讀取，不寫死。
  - 還沒確定的值標上 `TODO`，並寫明來源。
- 密碼與 token 不能出現在程式碼中。

## 8. Tags

- 程式中引用 tag 時，一律使用 `src/data/tags.ts` 的常數，不要直接寫字串。
- `.feature` 的 tag 規則見 `../../qa-cases/references/gherkin.md`。
- `@quarantine`：只有**實際重跑確認會時好時壞**時才加，並附上追蹤單號。修好後立即移除。
  - 用了次一級的 selector 但能穩定通過，不算 flaky，不要隔離。

## 9. Log 與失敗證據

- 用專案的 logger（例如 `createLogger(this.constructor.name)`），不要用 `console.log`。
- 截圖策略是「通過不留、失敗才留」：
  - 在 hook 中，只有步驟失敗或重試時才逐步截圖。
  - 失敗時附上 console error 與 4xx／5xx 的網路請求，幫助判斷是產品錯誤還是定位問題。
- 錄影、trace 設為只在失敗時保留。

## 10. 驗證

1. 產生 spec：例如 `npx bddgen`，確認每個步驟都有對應的 step definition。
2. 只跑相關的子集：傳入產生的 spec 路徑，或使用 `--grep`。
3. 送出前通過 type-check、format、lint，例如 `npm run check`。

## 11. 禁止清單

- ❌ 在 step 中寫 selector、直接操作 `page`，或寫業務邏輯
- ❌ `page.waitForTimeout(ms)` 等固定秒數的等待
- ❌ Page／Screen 對外提供 UI 語意的方法（`clickXxxButton`）
- ❌ 結構性 CSS、XPath（web）
- ❌ 原始 API response 流到 step 或斷言中
- ❌ 在 `test.fixtures.ts` 定義 fixture
- ❌ 直接寫 tag 字串、使用 `console.log`
- ❌ 修改 `.feature`、產生的檔案或產品程式碼
- ❌ 為了找 selector 去翻前端原始碼。先實際打開頁面或模擬器觀察，例如用瀏覽器或 Appium 的工具抓元素
