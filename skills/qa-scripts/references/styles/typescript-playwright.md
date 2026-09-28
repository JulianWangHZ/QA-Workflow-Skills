# TypeScript + Playwright（playwright-bdd／cucumber-js）

適用 profile：`ts-playwright-bdd`、`ts-cucumber`、`ts-playwright`｜平台：web
共用原則見 `../coding-style.md`。

## 目錄

```
features/                     已確認的 .feature（唯讀）
tests/steps/{domain}.steps.ts step definitions（精簡）
tests/steps/_hooks.steps.ts   失敗截圖、console 與網路錯誤收集
src/pages/{name}.page.ts      Page Object（BasePage 子類別）
src/components/*.component.ts 跨頁共用的 UI 區塊
src/api/*.ts                  API client（ApiClient 子類別，Raw → Clean）
src/fixtures/{domain}.fixtures.ts、test.fixtures.ts（只做 mergeTests）
src/data/tags.ts、src/data/factory/*.factory.ts
```

## Step definition

```ts
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../../src/fixtures/test.fixtures";

const { Given, When, Then } = createBdd(test);

// ─────────────────────────────────────────────
// Given：前置狀態
// ─────────────────────────────────────────────
Given("我已連續輸錯密碼 {string} 次", async ({ accountApi, ctx }, count: string) => {
  await accountApi.setFailedAttempts(ctx.account.id, Number(count));
});

// ─────────────────────────────────────────────
// When：使用者操作
// ─────────────────────────────────────────────
When("我以密碼 {string} 登入", async ({ loginPage }, password: string) => {
  await loginPage.login({ password });
});

// ─────────────────────────────────────────────
// Then：預期結果
// ─────────────────────────────────────────────
Then("系統顯示 {string}", async ({ loginPage }, message: string) => {
  await expect(loginPage.errorMessage()).toHaveText(message);
});
```

## Page Object

```ts
import { type Page } from "@playwright/test";
import { BasePage } from "./base.page";

export class LoginPage extends BasePage {
  private readonly emailInput = () => this.page.getByTestId("login-email");
  private readonly passwordInput = () => this.page.getByTestId("login-password");
  private readonly submitButton = () => this.page.getByRole("button", { name: "登入" });
  readonly errorMessage = () => this.page.getByTestId("login-error");

  constructor(page: Page) {
    super(page);
  }

  async login({ email = this.defaultEmail, password }: { email?: string; password: string }): Promise<void> {
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await Promise.all([
      this.page.waitForResponse((res) => res.url().includes("/auth/login")),
      this.submitButton().click()
    ]);
  }
}
```

## Fixtures

```ts
// src/fixtures/auth.fixtures.ts
import { test as base } from "@playwright/test";
import { LoginPage } from "../pages/login.page";

export const authTest = base.extend<{ loginPage: LoginPage }>({
  loginPage: async ({ page }, use) => use(new LoginPage(page))
});

// src/fixtures/test.fixtures.ts —— 只合併，不定義
import { mergeTests } from "@playwright/test";
import { test as bddTest } from "playwright-bdd";
import { authTest } from "./auth.fixtures";

export const test = mergeTests(bddTest, authTest);
```

## 框架差異

| 項目 | playwright-bdd | cucumber-js |
|---|---|---|
| 產生 spec | `npx bddgen`（也用來檢查缺少的 step） | 不需要；`npx cucumber-js --dry-run` 檢查缺少的 step |
| 注入 Page | fixture 解構 | 在 `World` 中建立 Page 物件，step 用 `this.loginPage`；不要在 World 寫業務邏輯 |
| 報告 | `--reporter=line,junit`，並設定 `PLAYWRIGHT_JUNIT_OUTPUT_NAME` | `--format junit:<檔案>` |

## 等待

`await expect(locator).toBeVisible()`、`page.waitForURL()`、`page.waitForResponse()`。**不要用** `page.waitForTimeout()`。
