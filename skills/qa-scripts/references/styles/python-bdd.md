# Python + pytest-bdd／behave（Playwright、Selenium 或 Appium）

適用 profile：`py-pytest-bdd`、`py-behave`｜平台：web、app
共用原則見 `../coding-style.md`。Python 慣例：snake_case、型別註記、`logging` 取代 `print`。

## 目錄

```
tests/features/                  已確認的 .feature（唯讀）
tests/step_defs/test_{domain}.py pytest-bdd 的 step 與 scenarios 綁定（behave 用 features/steps/{domain}_steps.py）
tests/pages/{name}_page.py       Page／Screen Object
tests/api/{domain}_client.py     API client（Raw → dataclass）
tests/conftest.py                fixtures（依領域拆成 fixtures/{domain}.py 再匯入）
```

## pytest-bdd step（web：Playwright）

```python
from pytest_bdd import given, parsers, scenarios, then, when
from playwright.sync_api import expect

from tests.pages.login_page import LoginPage

scenarios("../features/account-lock.feature")


@given(parsers.parse('我已連續輸錯密碼 "{count:d}" 次'))
def failed_attempts(account_api, account, count: int) -> None:
    account_api.set_failed_attempts(account.id, count)


@when(parsers.parse('我以密碼 "{password}" 登入'))
def login(login_page: LoginPage, password: str) -> None:
    login_page.login(password=password)


@then(parsers.parse('系統顯示 "{message}"'))
def shows_message(login_page: LoginPage, message: str) -> None:
    expect(login_page.error_message()).to_have_text(message)
```

## Page Object（Playwright）

```python
from dataclasses import dataclass

from playwright.sync_api import Locator, Page


@dataclass
class LoginPage:
    page: Page
    default_email: str

    def _email(self) -> Locator:
        return self.page.get_by_test_id("login-email")

    def _password(self) -> Locator:
        return self.page.get_by_test_id("login-password")

    def error_message(self) -> Locator:
        return self.page.get_by_test_id("login-error")

    def login(self, *, password: str, email: str | None = None) -> None:
        self._email().fill(email or self.default_email)
        self._password().fill(password)
        with self.page.expect_response(lambda res: "/auth/login" in res.url):
            self.page.get_by_role("button", name="登入").click()
```

## Screen Object（app：Appium-Python-Client）

```python
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support import expected_conditions as ec
from selenium.webdriver.support.ui import WebDriverWait


class LoginScreen:
    EMAIL = (AppiumBy.ACCESSIBILITY_ID, "login-email")
    PASSWORD = (AppiumBy.ACCESSIBILITY_ID, "login-password")
    SUBMIT = (AppiumBy.ACCESSIBILITY_ID, "login-submit")
    ERROR = (AppiumBy.ACCESSIBILITY_ID, "login-error")

    def __init__(self, driver, timeout: float = 10) -> None:
        self.driver = driver
        self.wait = WebDriverWait(driver, timeout)

    def login(self, *, password: str, email: str) -> None:
        self.wait.until(ec.visibility_of_element_located(self.EMAIL)).send_keys(email)
        self.driver.find_element(*self.PASSWORD).send_keys(password)
        self.driver.find_element(*self.SUBMIT).click()

    def error_text(self) -> str:
        return self.wait.until(ec.visibility_of_element_located(self.ERROR)).text
```

## Fixtures（conftest.py）

- 每個領域一個 fixtures 模組，在 `conftest.py` 匯入。`conftest.py` 本身只做匯入與共用設定。
- Page／Screen 由 fixture 建立，step 用參數注入，不要自己建立實例。
- 測試資料在 Given 中透過 API client 或 factory 建立，並在 fixture 的 teardown 中清理。

## behave 差異

- step 放在 `features/steps/{domain}_steps.py`，用 `context` 取得 Page 物件（在 `environment.py` 的 `before_scenario` 中建立）。
- 不要把業務邏輯寫在 `context` 或 `environment.py`。
- 檢查缺少的 step：`behave --dry-run`。報告：`--junit --junit-directory <目錄>`。

## 等待

- Playwright：`expect(locator).to_be_visible()`、`page.expect_response(...)`。
- Appium／Selenium：`WebDriverWait(...).until(條件)`。
- **不要用** `time.sleep()` 或 `driver.implicitly_wait()` 來處理時序問題。
