# 架構

## 分工：LLM 判斷，CLI 守門

| 由 skill（LLM）負責 | 由 CLI 負責 |
|---|---|
| 讀需求與程式碼、推理風險 | 產物格式驗證（JSON Schema、Gherkin 解析） |
| 測試矩陣、狀態機、原型、寫 BDD 情境 | 階段狀態機與放行條件 |
| 寫測試、分類失敗、修正測試 | 用例確認的 hash 鎖定 |
| 審查程式碼 | 執行測試指令、保存 log、解析 JUnit |
| 向使用者說明 | 產生審閱頁、計算結論、產生報告 |

需要判斷的事交給模型；需要可靠、可重現的事交給程式。
所以就算模型漏看某個規則，gate 仍然會擋下格式錯誤、未覆蓋的高風險、未確認就產生的腳本。

## 階段與產物

每個階段只讀上游產物、只寫自己的產物，階段之間以 `.qa/runs/<runId>/` 下的 JSON 交接：

```
context.json → risks.json → design.json + design/features/*.feature + design/prototype.html
            → (CLI) cases.json + cases-review.html → confirmation.json → tasks.json → results.json → review.json → report.html
```

用例的唯一來源是 `.feature`，保持團隊的 BDD 風格（不放編號或優先級 tag）。編號、優先級、風險、類型寫在 `design.json` 的 `scenarios` 索引，以檔案與標題對應。`cases.json` 是 CLI 把兩者合併後的扁平清單，供下游的 tasks、結論與報告使用。

好處：
- **可中斷續跑**：`state.json` 記錄目前階段，新對話說「繼續 QA」即可接續。
- **可稽核**：每個結論都能追到產生它的檔案。
- **可替換**：只要遵守產物格式，任何一個子 skill 都能被換掉。

## 人工確認的強制方式

1. `qa gate cases` 通過後，stage 停在 `confirm`。
2. 只有 `qa confirm` 能離開這個 stage。它把使用者在審閱頁看到的全部內容算出 SHA-256，存進 `confirmation.json`：
   - `design.json`（正規化，排序 key 後）
   - 所有 feature 原文
   - 原型 HTML
3. 之後的 scripts、run、review 三個 gate 都會重新計算 hash。
4. hash 不符就擋下，要求重新確認。`tasks.json` 也必須帶著同一個 hash，證明腳本是依確認後的設計產生的。
5. BDD 專案中，scripts gate 會以 Scenario 標題對應專案中的 feature，tag 與步驟必須與確認內容完全一致。

## 用例覆蓋率的設計

四層保護，逐層降低漏測：

1. **測試矩陣**：依技法把條件組合列成表。每一列都要對應情境，或寫明不測理由；漏測通常來自沒列出來的維度。
2. **狀態機**：列出狀態與轉換，包含不該發生的非法轉換。每條轉換都要有情境。
3. **技法清單**：12 種技法逐項判定，N/A 必須寫理由。
4. **獨立評審**：全新上下文的 subagent 依 rubric 打分（含 BDD 品質與原型），未達門檻就修正重審。分數與輪數寫進產物，並在審閱頁展示。

互動原型不直接產生情境。它讓 PM 在寫自動化之前確認畫面與流程，畫面也會標出對應的情境：沒有情境的畫面代表可能缺少情境。

## 審閱頁

`cases-review.html` 是單一 HTML 檔，沒有外部依賴（狀態圖會嘗試從 CDN 載入 mermaid，離線時退回轉換表）。
- 驗收清單直接由 Gherkin 轉成白話內容：Background + Given 是前置條件，When 是操作，Then 是預期結果；依 feature 中的段落分組；描述性 tag、`@smoke`、`@邊界`、人工驗收會顯示成標籤，優先級來自索引。
- 深色／淺色模式可以切換，選擇會記在瀏覽器中，並同步給內嵌的原型。
- 所以 feature 必須用宣告式的業務語言撰寫，這也是評審的評分項目。
- PM 的勾選狀態存在瀏覽器 localStorage，不會回寫到產物中。

另外，gate 會對每個 P0/P1 風險檢查兩件事：
- 必須有用例覆蓋，或明確延後並寫理由。
- 只有正向用例時發出警告。

## 結論

結論只由產物推導，規則見 [gates.md](../skills/qa-workflow/references/gates.md)。
模型不能自行宣告「可發布」，只能如實填寫結果與分類，由 CLI 計算。

## 設計取捨

- **設定用 JSON 而不是 YAML**：CLI 零依賴，不需要 YAML 解析器。
- **自寫 JSON Schema 子集驗證器**：只支援產物用到的關鍵字，約 80 行，換來零安裝。
- **以 JUnit 作為通用結果格式**：幾乎所有測試框架都能輸出。沒有 JUnit 時退回讀 log，由模型判定並附證據。
- **不做多模型互評、自動建分支或提交、通知推送**：保持核心流程精簡。需要時可以在報告階段用現有的 MCP 工具完成。

## 控制主對話的 context

8 個階段如果都在同一個對話裡執行，走到後段時 context 會累積到很滿。做法如下：

- **自動階段派 subagent**：主對話只負責調度、執行 gate、和使用者溝通。每個 subagent 從產物檔開始工作，只回傳幾行 JSON 摘要。
- **人工確認留在主對話**，因為 subagent 不能直接和使用者對話。
- **需要並行的工作由主對話派發**，因為 subagent 不能再派 subagent：
  - 用例設計的設計與評審
  - 腳本生成依 feature 並行
  - 代碼審查依分塊並行
- **合併由 CLI 執行**：`qa tasks-merge`、`qa review-merge` 依固定規則合併，主對話不需要讀取各塊內容。
- **代碼審查分塊**：每塊有自己的 diff 檔，超過上限的大檔會再切開，而且只附上相關的 feature。
- **可以中斷重跑**：各分塊的結果寫成檔案，重跑時只補沒完成的部分。

