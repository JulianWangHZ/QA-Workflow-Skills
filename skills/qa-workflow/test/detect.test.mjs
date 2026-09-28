import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectStack } from '../lib/detect.mjs';

const project = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-detect-'));
  Object.entries(files).forEach(([name, content]) => writeFileSync(join(dir, name), content));
  return dir;
};

test('Node + Playwright + Vitest', () => {
  const dir = project({
    'package.json': JSON.stringify({ devDependencies: { '@playwright/test': '1', vitest: '1' } })
  });
  const d = detectStack(dir);
  assert.ok(d.stack.includes('ts-playwright'));
  assert.match(d.layers.e2e.command, /playwright test/);
  assert.ok(d.layers.e2e.junit);
  assert.match(d.layers.unit.command, /vitest run/);
});

test('Python pytest', () => {
  const d = detectStack(project({ 'pyproject.toml': '[tool.pytest.ini_options]\n' }));
  assert.match(d.layers.unit.command, /pytest --junitxml/);
});

test('npm 預設的佔位 test script 不算', () => {
  const d = detectStack(project({ 'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) }));
  assert.equal(d.layers.unit, undefined);
});

test('偵測不到任何東西時回傳空 layers', () => {
  assert.deepEqual(detectStack(project({})).layers, {});
});

test('node:test 專案自動加上 JUnit reporter', () => {
  const d = detectStack(project({ 'package.json': JSON.stringify({ scripts: { test: 'node --test "test/*.test.mjs"' } }) }));
  assert.match(d.layers.unit.command, /--test-reporter=junit/);
  assert.match(d.layers.unit.command, /"test\/\*\.test\.mjs"$/);
  assert.equal(d.layers.unit.junit, '.qa/tmp/unit-junit.xml');
});

test('playwright-bdd：設定 bdd 並在 e2e 指令前產生測試', () => {
  const d = detectStack(project({
    'package.json': JSON.stringify({ devDependencies: { '@playwright/test': '1', 'playwright-bdd': '8' } })
  }));
  assert.equal(d.bdd.framework, 'playwright-bdd');
  assert.equal(d.bdd.featuresDir, 'features');
  assert.match(d.layers.e2e.command, /^npx bddgen && npx playwright test/);
  assert.deepEqual(d.reviewChecks, [{ name: 'bdd-steps', command: 'npx bddgen' }]);
});

test('cucumber-js 與 behave', () => {
  const cucumber = detectStack(project({ 'package.json': JSON.stringify({ devDependencies: { '@cucumber/cucumber': '10' } }) }));
  assert.equal(cucumber.bdd.framework, 'cucumber-js');
  assert.match(cucumber.layers.e2e.command, /cucumber-js .*junit/);
  const behave = detectStack(project({ 'requirements.txt': 'behave==1.2\n' }));
  assert.equal(behave.bdd.framework, 'behave');
  assert.match(behave.layers.e2e.command, /--junit/);
});

test('TypeScript + WebdriverIO + Appium + cucumber：依 iOS／Android 設定檔拆成兩個 layer', () => {
  const d = detectStack(project({
    'package.json': JSON.stringify({ devDependencies: { '@wdio/cli': '9', '@wdio/appium-service': '9', '@wdio/cucumber-framework': '9', appium: '2' } }),
    'wdio.ios.conf.ts': '',
    'wdio.android.conf.ts': ''
  }));
  const profile = d.profiles.find((p) => p.id === 'ts-webdriverio-appium');
  assert.deepEqual(profile.platforms, ['app']);
  assert.deepEqual(profile.layers, ['e2e-ios', 'e2e-android']);
  assert.equal(profile.style, 'typescript-webdriverio.md');
  assert.equal(profile.bdd.framework, 'wdio-cucumber');
  assert.equal(d.layers['e2e-ios'].command, 'npx wdio run wdio.ios.conf.ts');
  assert.equal(d.layers['e2e-android'].env.QA_JUNIT_DIR, '.qa/tmp/e2e-android');
});

test('Python + pytest-bdd + Appium：app 平台，使用 python-bdd 風格', () => {
  const d = detectStack(project({ 'requirements.txt': 'pytest-bdd==7\nAppium-Python-Client==4\n' }));
  const profile = d.profiles.find((p) => p.id === 'py-pytest-bdd');
  assert.deepEqual(profile.platforms, ['app']);
  assert.equal(profile.style, 'python-bdd.md');
  assert.match(d.layers.e2e.command, /pytest --junitxml/);
  assert.equal(d.layers.unit, undefined, 'pytest-bdd 已經用 pytest 執行，不另外建立 unit layer');
});

test('Python + pytest-bdd 同時用 Playwright 與 Appium：兩個平台都需要', () => {
  const d = detectStack(project({ 'pyproject.toml': '[project]\ndependencies = ["pytest-bdd", "pytest-playwright", "Appium-Python-Client"]\n' }));
  assert.deepEqual(d.profiles[0].platforms, ['web', 'app']);
});

test('同一個 repo 同時有 web（playwright-bdd）與 app（WebdriverIO + Appium）', () => {
  const d = detectStack(project({
    'package.json': JSON.stringify({ devDependencies: { 'playwright-bdd': '8', '@playwright/test': '1', '@wdio/cli': '9', appium: '2' } })
  }));
  assert.deepEqual(d.profiles.map((p) => p.id), ['ts-playwright-bdd', 'ts-webdriverio-appium']);
  assert.ok(d.layers.e2e && d.layers['e2e-app']);
});

test('純 pytest + pytest-playwright：web profile，有 tests/e2e 時 unit 排除該目錄', () => {
  const root = project({ 'requirements.txt': 'pytest\npytest-playwright\n' });
  mkdirSync(join(root, 'tests/e2e'), { recursive: true });
  const d = detectStack(root);
  const profile = d.profiles.find((p) => p.id === 'py-pytest');
  assert.deepEqual(profile.platforms, ['web']);
  assert.equal(profile.style, 'python-pytest.md');
  assert.equal(d.bdd, undefined);
  assert.match(d.layers.e2e.command, /^pytest tests\/e2e --junitxml/);
  assert.match(d.layers.unit.command, /--ignore=tests\/e2e/);
});

test('純 pytest + Appium、沒有獨立 e2e 目錄：app profile，只有 e2e layer', () => {
  const d = detectStack(project({ 'pyproject.toml': '[project]\ndependencies = ["pytest", "Appium-Python-Client"]\n' }));
  assert.deepEqual(d.profiles[0].platforms, ['app']);
  assert.match(d.layers.e2e.command, /^pytest --junitxml/);
  assert.equal(d.layers.unit, undefined);
});

test('純 pytest、沒有瀏覽器或 app 驅動：只當成單元測試', () => {
  const d = detectStack(project({ 'requirements.txt': 'pytest\nrequests\n' }));
  assert.deepEqual(d.profiles, []);
  assert.match(d.layers.unit.command, /^pytest --junitxml/);
});
