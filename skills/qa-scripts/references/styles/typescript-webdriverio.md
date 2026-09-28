# TypeScript + WebdriverIO（+ Appium）

適用 profile：`ts-webdriverio-appium`（app）、`ts-webdriverio`（web）｜BDD：`@wdio/cucumber-framework`
共用原則見 `../coding-style.md`。

## 目錄

```
features/                          已確認的 .feature（唯讀）
tests/steps/{domain}.steps.ts      step definitions（精簡）
src/screens/{name}.screen.ts       Screen Object（BaseScreen 子類別）
src/driver/mobile-driver.ts        自己定義的 driver 介面
src/driver/wdio-driver.ts          WebdriverIO 實作（唯一直接使用 $／driver 的地方）
src/api/*.ts、src/data/*           與 web 相同
wdio.ios.conf.ts、wdio.android.conf.ts（或 wdio.conf.ts）
```

## Step definition

```ts
import { Given, When, Then } from "@wdio/cucumber-framework";
import { expect } from "@wdio/globals";
import { screens } from "../../src/screens";
import { accountApi } from "../../src/api/account.api";

Given("我已連續輸錯密碼 {string} 次", async (count: string) => {
  await accountApi.setFailedAttempts(Number(count));
});

When("我以密碼 {string} 登入", async (password: string) => {
  await screens.login.login({ password });
});

Then("系統顯示 {string}", async (message: string) => {
  await expect(await screens.login.errorMessage()).toHaveText(message);
});
```

## Driver 介面與 Screen Object

Screen 只依賴自己定義的 `MobileDriver`，不直接使用 WebdriverIO 的型別。以後要換底層工具，只需要改 adapter。

```ts
// src/driver/mobile-driver.ts
export interface MobileDriver {
  readonly platform: "ios" | "android";
  byId(testId: string): Promise<WebdriverIO.Element>;
  byText(text: string): Promise<WebdriverIO.Element>;
  tap(testId: string): Promise<void>;
  type(testId: string, value: string): Promise<void>;
}

// src/driver/wdio-driver.ts —— RN 的 testID 在 iOS 是 accessibilityIdentifier、Android 是 resource-id
export const wdioDriver = (): MobileDriver => ({
  platform: driver.isIOS ? "ios" : "android",
  byId: async (testId) => (driver.isIOS ? $(`~${testId}`) : $(`id=${testId}`)),
  byText: async (text) => (driver.isIOS ? $(`-ios predicate string:label == "${text}"`) : $(`android=new UiSelector().text("${text}")`)),
  tap: async (testId) => (await wdioDriver().byId(testId)).click(),
  type: async (testId, value) => (await wdioDriver().byId(testId)).setValue(value)
});

// src/screens/login.screen.ts
import { BaseScreen } from "./base.screen";

export class LoginScreen extends BaseScreen {
  private readonly email = "login-email";
  private readonly password = "login-password";
  private readonly submit = "login-submit";
  readonly errorMessage = () => this.driver.byId("login-error");

  async login({ email = this.defaultEmail, password }: { email?: string; password: string }): Promise<void> {
    await this.driver.type(this.email, email);
    await this.driver.type(this.password, password);
    await this.driver.tap(this.submit);
  }
}
```

## Selector 的退路順序（app）

`testID`（`~id`／`id=`）→ 可見文字、accessibility label → 語意錨點 → 結構定位（XPath、UiSelector 結構、索引、座標）。

- 能穩定定位就先用，讓情境先跑起來。
- 用到結構定位時，加 1 行註解說明是哪個元素缺 testID，建議前端補上。
- **不要**為了找 testID 去翻前端原始碼。先用 Appium MCP 抓元素樹。

## 一套程式跑 iOS 與 Android

平台差異依輕重處理：
1. 原生差異（權限彈窗、返回鍵、日期選擇器）收在 helper 中。
2. 同一個方法中的少量差異，用 `if (this.driver.platform === "ios")` 分支。
3. 整個畫面差異很大時，才拆成 `login.ios.screen.ts`／`login.android.screen.ts`。

## 報告與執行

- 在 wdio 設定中加入 junit reporter，`outputDir` 讀取 `process.env.QA_JUNIT_DIR`（qa-workflow 執行時會提供）。
- iOS 與 Android 各有一個設定檔時，會分成 `e2e-ios`、`e2e-android` 兩個 layer 分開執行與記錄。
- 單一 Appium server、單一裝置時，不要並行跑兩個平台。

## 等待

用 `await el.waitForDisplayed()`、`await expect(el).toHaveText()`、`browser.waitUntil(條件)`。**不要用** `browser.pause()` 或固定秒數等待。
