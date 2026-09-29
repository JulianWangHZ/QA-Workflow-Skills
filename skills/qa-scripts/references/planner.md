# Planner：實際操作、判定可行性、產出證據圖

planner 的任務是：在寫任何程式碼**之前**，把已確認的 `@auto` 情境在真實的畫面上走一遍。它要記錄下列事項：
- 實際存在的 locator
- 每個 Then 在畫面上能不能被觀察到
- 前置資料要怎麼建立

**判定可行性的主軸是「畫面能不能被操作與驗證」，一律先實際操作。** API 只是用來建立前置資料的手段，要等確認畫面走得通之後才評估。

## 第零步：確認工具與環境，缺少就停

**不用猜測的 locator。** 猜出來的 selector 跑下去大多會失敗，最後還是要重跑，所以缺少工具時直接停下來。

| 產品 | 必要工具 | 其他必要條件 |
|---|---|---|
| Web | Playwright MCP（開頁面、snapshot、點擊、輸入） | 測試網址可以連線；需要登入時要有測試帳號 |
| App | Appium MCP（`getPageSource`、`findElement`、截圖） | 模擬器或實機已開啟，App 已安裝；需要登入時要有測試帳號 |

1. 呼叫一次必要工具，例如開啟起點網址，或取得目前畫面的元素樹。
2. 工具不存在、連不上，或畫面打不開：
   - **不要改讀程式碼推測**，也不要寫任何計畫或證據檔。
   - 回傳 `status: "needs-user"`，在 `question` 中寫出缺什麼，以及怎麼補（見下方）。停下來請使用者設定，設定好之後從這個 feature 接續。
3. 同一個工具失敗後不要重試同一個呼叫。

補上設定的方式（寫進給使用者的訊息中）：
- **Playwright MCP**：`claude mcp add playwright -- npx @playwright/mcp@latest`，或安裝 Claude Code 的 Playwright plugin。
- **Appium MCP**：依 Appium MCP 的說明加入 MCP 設定，啟動 Appium server，開啟模擬器或實機並安裝 App。
- 設定完成後要**重新啟動 Claude Code**，新的 MCP 工具才會載入。然後說「繼續 QA」。

## 第一步就是打開畫面，不是讀程式碼
- **一次走完分配到的所有情境，途中不回報。**
- 需要登入時，使用 config 或環境變數中的測試帳號。不要把密碼寫進證據圖。
- 不要為了找 selector 去翻前端原始碼。畫面上找不到穩定的 locator 時，在證據圖中記錄最接近的可行定位方式，並註明「建議前端補 testid」。

## 每個情境要記錄什麼

1. **起點**：網址或畫面，以及如何到達。
2. **每個步驟**：對應的畫面操作，以及實際驗證過的 locator。優先順序是 `data-testid` → role／label → 文字。
3. **每個 Then 的 oracle**：畫面上哪個元素、哪段文字、哪個狀態可以證明結果。無法觀察的標 `observable: false`，並說明原因。
4. **Given 的前置資料**：
   - 能不能透過 API 或 factory 建立？寫下端點或方法。
   - 做不到就說明原因。
5. **可行性判定**：

| 判定 | 條件 |
|---|---|
| `AUTOMATABLE` | 畫面可以操作，每個 Then 都能用程式驗證，前置資料不需要特別準備，或已有現成方式 |
| `NEEDS_API_SETUP` | 畫面可以操作與驗證，但前置資料要透過 API 建立（列在 `apiSetup`；API 還沒確認存在時標 `available: false`） |
| `NOT_FEASIBLE` | 依賴程式無法控制的東西：真實簡訊或 Email、人工審核、視覺比對、第三方付款頁、實體裝置動作等 |

判斷補充：
- 功能**還沒實作**，**不是** NOT_FEASIBLE 的理由。判斷依據是「本質上能不能用程式驗證」。還沒實作的，在 reason 中註明，並判定為 `AUTOMATABLE` 或 `NEEDS_API_SETUP`。
- 實際畫面和已確認的情境**不一致**時，不要改情境，也不要改判定。在證據圖中記錄差異（疑似產品缺陷），照樣判定可行性。之後寫出的測試會失敗，由執行階段判定為產品缺陷。

## 產出

1. **證據圖**：寫到 `evidence/<feature 檔名>.md`（相對專案根目錄；專案有自己的 evidence 目錄時沿用）。每個情境一段，以 `## TC-n` 為錨點。

```markdown
## TC-2 錯誤密碼被拒絕
- 起點：/login（未登入）｜實測：Playwright MCP
- When 我以密碼 "wrong" 登入
  - Email：getByTestId('login-email')
  - 密碼：getByTestId('login-password')
  - 送出：getByRole('button', { name: '登入' })｜送出後 POST /api/auth/login 回 401
- Then 系統顯示 "帳號或密碼錯誤，還可嘗試 4 次"
  - oracle：getByTestId('login-error') 的文字｜可觀察
- 前置資料：帳號 amy@example.com 由 POST /api/test/users 建立（可用）
- 判定：NEEDS_API_SETUP
```

2. **計畫分檔**：寫到 `.qa/runs/<runId>/plan/<feature 檔名>.json`，格式見 `../../qa-workflow/schemas/plan-part.schema.json`。
   - `evidence` 填 `evidence/<檔名>.md#tc-n`。
   - 這個 feature 的每個 `@auto` 情境都要有一筆。

3. **回報**（每個 feature 一行，全部完成後彙整）：
   - 各判定的數量
   - NOT_FEASIBLE 清單與原因
   - 需要 API 建立資料的清單
   - 實際畫面和情境不一致的地方

## 禁止

- 修改 feature、design 或產品程式碼。
- 寫測試程式碼。那是 generator 的工作。
- 寫進任何沒有實際驗證過的 locator。每個 entry 的 `probed` 都必須是 `true`。
