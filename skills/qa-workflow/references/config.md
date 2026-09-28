# `.qa/config.json`

由 `qa init` 偵測技術棧後產生，使用者確認後就是這個專案的長期設定，建議提交到版本控制。
完整範例：`../assets/config.example.json`。正式格式：`../schemas/config.schema.json`。

| 欄位 | 說明 | 預設 |
|---|---|---|
| `language` | 報告與 cases.md 的語言：`zh-TW` / `en` | `zh-TW` |
| `profiles[]` | 偵測到的自動化框架。每個包含 `id`、`language`、`platforms`（web／app）、`style`（`qa-scripts/references/styles/` 下的範例檔）、`layers`、`bdd`。同一個 repo 可以有多個，例如 web 與 app | 依偵測結果 |
| `layers.<名稱>.command` | 執行這個 layer 的指令。名稱可以自訂，例如 `unit`、`e2e`、`e2e-ios`、`e2e-android`，在專案根目錄以 shell 執行 | 依偵測結果 |
| `layers.*.junit` | JUnit XML 的路徑（檔案或目錄）。有設定時 `qa run` 能自動判定每個 task 的結果 | 依偵測結果 |
| `layers.*.dir` | 該層測試檔所在目錄，給 qa-scripts 參考 | 依偵測結果 |
| `layers.*.env` | 執行時額外加入的環境變數。**不要放密碼**，密碼請用系統環境變數 | — |
| `layers.*.timeoutSec` | 單次執行逾時秒數 | 1800 |
| `repair.maxLoops` | 修復重跑的上限（總執行次數 = maxLoops + 1） | 3 |
| `repair.allowedPaths` | 測試相關檔案允許寫入的路徑（glob） | 依測試目錄推導 |
| `caseDesign.minReviewScore` | 用例獨立評審的及格分數 | 85 |
| `caseDesign.maxReviewRounds` | 用例評審最多幾輪。到上限仍不及格時改為警告，交由人工確認 | 3 |
| `bdd.framework` | 偵測到的 BDD 框架，例如 playwright-bdd、cucumber-js、pytest-bdd、behave。僅供參考 | 依偵測結果 |
| `bdd.featuresDir` | 專案存放 feature 的目錄。設定後，腳本階段會把確認的 feature 放進這裡，gate 也會檢查內容一致 | 依偵測結果 |
| `bdd.stepsDir` | step definitions 的目錄 | 依偵測結果 |
| `run.oracleAudit` | 通過的測試是否要做防假綠（突變）檢查 | `true` |
| `run.maxHealRounds` | healer 對每個失敗測試最多修幾輪 | 2 |
| `review.checks` | 代碼審查時要執行的確定性檢查指令，例如 `npx bddgen`、`npm run check`。任何一個失敗，審查結論就是 BLOCK | 依偵測結果 |
| `review.maxChunkLines` | 審查 diff 每一塊的行數上限。超過就分成多塊，由多個 subagent 並行審查 | 800 |
| `integrations.issueTracker` / `design` / `database` | 可用的 MCP 名稱，留空代表不使用。只是提示，各 skill 仍會檢查工具是否真的存在 | 空 |
| `report.dir` | 報告副本輸出目錄 | `.qa/reports` |

## 讓各框架輸出 JUnit

`qa run` 只讀取**本次執行之後**才寫出的 JUnit 檔，不會讀到上一次殘留的報告。

| 框架 | 做法 |
|---|---|
| node:test | `node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=.qa/tmp/unit-junit.xml` |
| Vitest | `--reporter=junit --outputFile=<檔案>` |
| Jest | 安裝 `jest-junit`，`--reporters=default --reporters=jest-junit`，用 `JEST_JUNIT_OUTPUT_DIR` / `JEST_JUNIT_OUTPUT_NAME` 指定位置 |
| Playwright | `--reporter=line,junit`，加上 `PLAYWRIGHT_JUNIT_OUTPUT_NAME` |
| Cypress | `--reporter junit --reporter-options mochaFile=<目錄>/junit-[hash].xml`，`junit` 設為該目錄 |
| pytest | `--junitxml=<檔案>` |
| Maven / Gradle | 預設就會輸出：`target/surefire-reports`、`build/test-results/test` |
| Go | 用 `gotestsum --junitfile <檔案>` |

沒有 JUnit 時也能跑。這種情況下每個 task 會先標為 `not-run`，由 qa-run 讀 log 判定。

## 支援的自動化框架（profiles）

| profile | 偵測條件 | 平台 | layer |
|---|---|---|---|
| `ts-playwright-bdd` | `playwright-bdd` | web | `e2e` |
| `ts-cucumber` | `@cucumber/cucumber`（沒有 WebdriverIO） | web | `e2e` |
| `ts-playwright` | `@playwright/test`（沒有 BDD） | web | `e2e` |
| `ts-webdriverio-appium` | `@wdio/cli` + `appium` 或 `@wdio/appium-service` | app | 有 `wdio.ios.conf.*`／`wdio.android.conf.*` 時為 `e2e-ios`、`e2e-android`，否則為 `e2e-app` |
| `ts-webdriverio` | `@wdio/cli`（沒有 Appium） | web | `e2e` |
| `py-pytest-bdd` | Python 依賴中有 `pytest-bdd` | 依驅動判斷：Playwright／Selenium 為 web，Appium 為 app，兩者都有就兩個平台 | `e2e` |
| `py-behave` | Python 依賴中有 `behave` | 同上 | `e2e` |
| `py-pytest` | 有 `pytest`、沒有 BDD 框架，但有 Playwright／Selenium／Appium | 同上 | `e2e`（有 `tests/e2e` 等獨立目錄時只跑該目錄，單元測試另成 `unit` layer 並排除它） |

- 每個 layer 執行時都會提供 `QA_JUNIT_DIR` 環境變數。沒有指令列參數可以指定 JUnit 輸出位置的框架（例如 WebdriverIO），請在設定檔中讀取它。
- 平台決定腳本生成需要哪個 MCP：web 需要 Playwright MCP，app 需要 Appium MCP。

