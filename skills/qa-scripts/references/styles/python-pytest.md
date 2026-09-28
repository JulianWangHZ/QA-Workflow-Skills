# Python + 純 pytest（不用 BDD），驅動 Playwright、Selenium 或 Appium

適用 profile：`py-pytest`｜平台：web、app
共用原則見 `../coding-style.md`。Python 慣例：snake_case、型別註記、`logging` 取代 `print`。

專案沒有使用 BDD 框架時，已確認的 `.feature` 仍然是規格。只是不會放進專案，而是**由測試函式忠實對應**：一個 Scenario 對應一個測試函式，Given／When／Then 一一對應到程式碼。

## 情境與測試的對應

| 已確認的情境 | pytest |
|---|---|
| Feature | 一個測試模組：`tests/e2e/test_{domain}.py` |
| `# ####` 段落 | 一個測試類別，例如 `class TestLockAfterFailures`（選用） |
| Scenario | 一個測試函式，函式名稱用情境標題：`test_第5次失敗後帳號被鎖定`（Python 3 允許中文識別字；去掉空白與符號） |
| Given | 函式開頭的準備步驟：fixture 或 API client |
| When | 呼叫 Page／Screen 的業務方法 |
| Then | 斷言 |
| `@smoke`、`@regression` | `@pytest.mark.smoke`、`@pytest.mark.regression`（在 `pytest.ini` 註冊 markers） |
| `@auto` | 有對應的測試函式就代表已自動化，不需要另外的 marker |

- **tasks.json 的 `testName` 填測試函式名稱**，例如 `test_第5次失敗後帳號被鎖定`。JUnit 報告中的測試名稱就是它。
- 函式的 docstring 貼上情境原文（Given／When／Then），讓審查時可以逐條核對。
- 一個情境只對應一個函式。不要把多個情境塞進 `parametrize`；資料組合已經在用例設計時拆成獨立的情境。

## 目錄

```
tests/e2e/test_{domain}.py     測試函式（精簡：準備 → 業務動作 → 斷言）
tests/pages/{name}_page.py     Page Object（web）
tests/screens/{name}_screen.py Screen Object（app）
tests/api/{domain}_client.py   API client（Raw → dataclass）
tests/conftest.py              只匯入各領域的 fixtures 模組與共用設定
tests/fixtures/{domain}.py     各領域的 fixtures
```

## 測試函式（web：pytest-playwright）

```python
import pytest
from playwright.sync_api import expect

from tests.pages.login_page import LoginPage


@pytest.mark.regression
class TestLockAfterFailures:
    def test_第5次失敗後帳號被鎖定(self, login_page: LoginPage, account_api, account) -> None:
        """
        Given 我已連續輸錯密碼 "4" 次
        When 我再以錯誤密碼登入
        Then 系統顯示 "帳號已鎖定，請於 15 分鐘後再試"
        And 帳號狀態為 "鎖定"
        """
        account_api.set_failed_attempts(account.id, 4)

        login_page.login(password="wrong")

        expect(login_page.error_message()).to_have_text("帳號已鎖定，請於 15 分鐘後再試")
        assert account_api.get(account.id).status == "locked"
```

Page Object 的寫法和 `python-bdd.md` 相同：selector 集中在類別中，方法用業務語意命名。

## 測試函式（app：Appium-Python-Client）

```python
import pytest

from tests.screens.login_screen import LoginScreen


@pytest.mark.regression
def test_錯誤密碼被拒絕(login_screen: LoginScreen, account) -> None:
    """
    Given 我已註冊帳號 "amy@example.com"
    When 我以密碼 "wrong" 登入
    Then 系統顯示 "帳號或密碼錯誤，還可嘗試 4 次"
    """
    login_screen.login(email=account.email, password="wrong")

    assert login_screen.error_text() == "帳號或密碼錯誤，還可嘗試 4 次"
```

Screen Object 的寫法見 `python-bdd.md` 的「Screen Object（app）」。iOS 與 Android 共用同一份 Screen；平台差異在 Screen 方法內用 `driver.capabilities["platformName"]` 分支。

## Fixtures

```python
# tests/fixtures/auth.py
import pytest

from tests.pages.login_page import LoginPage


@pytest.fixture
def login_page(page, settings) -> LoginPage:
    page.goto(f"{settings.base_url}/login")
    return LoginPage(page=page, default_email=settings.test_email)


# tests/conftest.py —— 只匯入，不定義
pytest_plugins = ["tests.fixtures.auth", "tests.fixtures.account"]
```

- 測試資料在 fixture 中透過 API client 或 factory 建立，並在 teardown（`yield` 之後）清理。
- 帳號與密碼從環境變數讀取，不要寫死。

## 報告與執行

- `pytest <目錄> --junitxml=<檔案>`，qa-workflow 會自動帶入參數。
- 有獨立的 e2e 目錄（`tests/e2e`、`tests/ui`、`tests/app`）時，單元測試的 layer 會排除它。

## 等待

- Playwright：`expect(locator).to_have_text()`、`page.expect_response(...)`。
- Appium／Selenium：`WebDriverWait(...).until(條件)`。
- **不要用** `time.sleep()` 或 `driver.implicitly_wait()` 來處理時序問題。
