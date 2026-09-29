---
name: qa-run
description: >
  qa-workflow 的第 6 階段：執行測試、判讀 log、為每個失敗分類（測試缺陷 / 產品缺陷 / 環境 / 需求不明），
  並在修復上限內修正測試本身的問題後重跑。由 qa-workflow 調度。
---

# qa-run — 執行與修復

讓每個 task 都有**有證據的**結果，並把失敗的原因說清楚。
修復對象只有測試本身，產品缺陷要如實記錄，不能被「修」掉。

`qa` = `node "<本 skill 目錄>/../qa-workflow/bin/qa.mjs"`

- 寫入：`qa path results`（由 `qa run` 產生，你補上分類與判定）
- 格式：`../qa-workflow/schemas/results.schema.json`

## 流程

### 1. 執行

執行 `qa run`。它會：
- 依 config 執行各 layer 的測試指令
- 把 log 存到 run 目錄的 `logs/`
- 用 JUnit 報告把結果對應回 task

只重跑特定層級時，用 `qa run --layer e2e`。

### 2. 處理 `not-run`

`not-run` 代表 CLI 無法自動判定。依 `reason` 處理：

| reason | 處理 |
|---|---|
| 沒有取得 JUnit 報告 | 讀 log 判斷每個 task 的結果，寫入 `status`，`evidence` 放 log 路徑 |
| JUnit 中找不到測試名稱 | 對照 log 修正 `tasks.json` 的 `testName`，或修正測試標題，然後重跑 |
| layer 未設定指令 | 停下來，請使用者補 config |
| 逾時 | 檢查是否卡住。需要時調高 `timeoutSec` 或修正測試 |

### 3. 為每個失敗分類（`classification` + `reason`）

| 分類 | 判斷依據 | 後續 |
|---|---|---|
| `test-defect` | 測試本身寫錯：step definition、選擇器、等待、資料準備、斷言寫法與**已確認的 Then** 不符 | 修正測試後重跑 |
| `product-defect` | 測試忠實反映已確認的預期，產品行為與預期不同 | 如實記錄，不修改 |
| `environment` | 服務沒啟動、帳號或憑證、網路、第三方沙箱不可用 | 能排除就排除後重跑；無法排除就改為 `blocked` 並寫明原因 |
| `unclear-requirement` | 預期本身有歧義，或需求來源互相矛盾 | 停下來，由使用者決定 |

分辨 `test-defect` 與 `product-defect` 的關鍵：**斷言是否和已確認 feature 的 Then 一致。**
一致卻失敗，就是產品缺陷。**絕對不要把斷言改成符合產品目前的行為。**

### 4. Healer：修復測試缺陷

依 `references/healer.md` 處理：
- **先打開實際畫面，找到失敗的地方**（Playwright MCP／Appium MCP），判斷根本原因後再修。
- 只修 `test-defect`，只改 `config.repair.allowedPaths` 內的檔案，並遵守 `../qa-scripts/references/coding-style.md`，例如不能用 `waitForTimeout` 掩蓋時序問題。
- **每個失敗的測試最多修 `run.maxHealRounds` 輪**（預設 2）。總執行次數的上限是 `repair.maxLoops + 1`，由 CLI 強制。
- 只重跑受影響的測試。可以用 `qa run --layer …` 縮小範圍。
- 每次修改都記錄在 `results.json` 的 `repairs`：`attempt`、`taskId`、`change`、`files`。
- 到上限仍未解決的，維持 `failed` + `test-defect`，報告會標示出來。
- 沒改任何東西、重跑就通過的，保留 `passed`，並在 `reason` 註明「疑似不穩定」。
- 依失敗的 feature 分組，一次修一組，修完再處理下一組。

### 5. 防假綠檢查

所有 task 都有結果、沒有待修的測試缺陷之後，依 `references/healer.md` 的「防假綠檢查」逐一處理**通過的 task**：
1. 對齊檢查：斷言驗證的是證據圖記錄的 oracle。
2. 突變檢查：把一條關鍵斷言暫時改壞，只跑這個測試，必須失敗，然後立即還原。
3. 把結果寫進 `results.json` 的 `oracleAudit`。

- 發現假綠：當成測試缺陷修正斷言，然後重新檢查。
- `qa gate run` 會擋下沒做檢查、或檢查結果是假綠的 task。

### 6. 驗證並回報

1. 執行 `qa validate results`。
2. 回報，內容包含：
   - 通過、失敗、阻塞的數量
   - 產品缺陷清單：task、用例、實際與預期
   - 修復紀錄
   - 需要使用者決定的事項

## 禁止

- 修改產品程式碼、feature 或預期。
- 刪除、跳過（skip）失敗的測試，或放寬斷言來讓測試通過。
- 沒有 log 或 JUnit 證據就把結果標成 `passed`。
