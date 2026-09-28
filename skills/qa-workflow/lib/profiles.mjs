// 自動化框架的 profile：每種框架怎麼偵測、怎麼執行、BDD 目錄在哪、對應哪個平台與 coding style。
// 同一個 repo 可以同時偵測到多個 profile（例如 web 與 app），各自成為一個 layer。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const JUNIT_DIR = '.qa/tmp';
const FEATURE_DIRS = ['features', 'tests/features', 'e2e/features', 'test/features', 'tests/e2e/features', 'tests/bdd/features'];

const firstExisting = (root, dirs) => dirs.find((d) => existsSync(join(root, d)));
const readText = (root, file) => (existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : '');

const PY_FILES = ['pyproject.toml', 'requirements.txt', 'requirements-dev.txt', 'requirements-test.txt', 'setup.cfg', 'Pipfile', 'poetry.lock'];
const pythonText = (root) => PY_FILES.map((f) => readText(root, f)).join('\n');

// 依 Python 依賴判斷驅動的是 web 還是 app（兩者都有就兩個平台）
const pythonPlatforms = (text) => [
  ...(/playwright|selenium|splinter/i.test(text) ? ['web'] : []),
  ...(/appium/i.test(text) ? ['app'] : [])
];

const layer = (name, command, extra = {}) => ({
  name,
  command,
  junit: extra.junit ?? `${JUNIT_DIR}/${name}-junit.xml`,
  env: { QA_JUNIT_DIR: `${JUNIT_DIR}/${name}`, ...(extra.env ?? {}) },
  ...(extra.dir ? { dir: extra.dir } : {})
});

// 回傳 [{ id, language, platforms, style, bdd, layers: [{ name, command, junit, env, dir }], reviewChecks }]
export const detectProfiles = (root, pkg) => {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const profiles = [];
  const featuresDir = firstExisting(root, FEATURE_DIRS) ?? 'features';

  // TypeScript + Playwright（playwright-bdd）
  if (deps['playwright-bdd']) {
    profiles.push({
      id: 'ts-playwright-bdd', language: 'typescript', platforms: ['web'], style: 'typescript-playwright.md',
      bdd: { framework: 'playwright-bdd', featuresDir, stepsDir: firstExisting(root, ['tests/steps', 'tests/ui', 'steps']) ?? 'tests/steps' },
      layers: [layer('e2e', 'npx bddgen && npx playwright test --reporter=line,junit', { env: { PLAYWRIGHT_JUNIT_OUTPUT_NAME: `${JUNIT_DIR}/e2e-junit.xml` } })],
      reviewChecks: [{ name: 'bdd-steps', command: 'npx bddgen' }]
    });
  } else if (deps['@cucumber/cucumber'] && !deps['@wdio/cli']) {
    // TypeScript + cucumber-js（通常搭配 Playwright 驅動瀏覽器）
    profiles.push({
      id: 'ts-cucumber', language: 'typescript', platforms: ['web'], style: 'typescript-playwright.md',
      bdd: { framework: 'cucumber-js', featuresDir, stepsDir: `${featuresDir}/step_definitions` },
      layers: [layer('e2e', `npx cucumber-js --format progress --format junit:${JUNIT_DIR}/e2e-junit.xml`, { dir: featuresDir })],
      reviewChecks: [{ name: 'bdd-steps', command: 'npx cucumber-js --dry-run' }]
    });
  } else if (deps['@playwright/test']) {
    profiles.push({
      id: 'ts-playwright', language: 'typescript', platforms: ['web'], style: 'typescript-playwright.md',
      layers: [layer('e2e', 'npx playwright test --reporter=line,junit', { env: { PLAYWRIGHT_JUNIT_OUTPUT_NAME: `${JUNIT_DIR}/e2e-junit.xml` } })],
      reviewChecks: []
    });
  }

  // TypeScript + WebdriverIO（Appium 驅動 app，或單純驅動瀏覽器）
  if (deps['@wdio/cli']) {
    const isApp = Boolean(deps.appium || deps['@wdio/appium-service']);
    const cucumber = Boolean(deps['@wdio/cucumber-framework']);
    const confOf = (name) => ['ts', 'js', 'mjs'].map((ext) => `wdio.${name}.conf.${ext}`).find((f) => existsSync(join(root, f)));
    const ios = confOf('ios');
    const android = confOf('android');
    const base = ['ts', 'js', 'mjs'].map((ext) => `wdio.conf.${ext}`).find((f) => existsSync(join(root, f))) ?? 'wdio.conf.ts';
    // wdio 的 junit reporter 要在設定檔中指定 outputDir，約定讀取 QA_JUNIT_DIR 環境變數
    const wdioLayer = (name, conf) => layer(name, `npx wdio run ${conf}`, { junit: `${JUNIT_DIR}/${name}` });
    const layers = isApp && (ios || android)
      ? [...(ios ? [wdioLayer('e2e-ios', ios)] : []), ...(android ? [wdioLayer('e2e-android', android)] : [])]
      : [wdioLayer(isApp ? 'e2e-app' : 'e2e', base)];
    profiles.push({
      id: isApp ? 'ts-webdriverio-appium' : 'ts-webdriverio', language: 'typescript', platforms: [isApp ? 'app' : 'web'],
      style: 'typescript-webdriverio.md',
      ...(cucumber ? { bdd: { framework: 'wdio-cucumber', featuresDir, stepsDir: firstExisting(root, ['tests/steps', 'features/step-definitions', 'steps']) ?? 'features/step-definitions' } } : {}),
      layers,
      reviewChecks: []
    });
  }

  // Python：pytest-bdd 或 behave，驅動 Playwright／Selenium（web）或 Appium（app）
  const py = pythonText(root);
  const platforms = pythonPlatforms(py);
  if (/pytest-bdd|pytest_bdd/i.test(py)) {
    const dir = firstExisting(root, FEATURE_DIRS) ?? 'tests/features';
    profiles.push({
      id: 'py-pytest-bdd', language: 'python', platforms: platforms.length ? platforms : ['web'], style: 'python-bdd.md',
      bdd: { framework: 'pytest-bdd', featuresDir: dir, stepsDir: firstExisting(root, ['tests/step_defs', 'tests/steps']) ?? 'tests/step_defs' },
      layers: [layer('e2e', `pytest --junitxml=${JUNIT_DIR}/e2e-junit.xml`)],
      reviewChecks: [{ name: 'bdd-steps', command: 'pytest --collect-only -q' }]
    });
  } else if (/\bbehave\b/i.test(py)) {
    profiles.push({
      id: 'py-behave', language: 'python', platforms: platforms.length ? platforms : ['web'], style: 'python-bdd.md',
      bdd: { framework: 'behave', featuresDir, stepsDir: `${featuresDir}/steps` },
      layers: [layer('e2e', `behave ${featuresDir} --junit --junit-directory ${JUNIT_DIR}/e2e`, { junit: `${JUNIT_DIR}/e2e` })],
      reviewChecks: [{ name: 'bdd-steps', command: `behave ${featuresDir} --dry-run` }]
    });
  } else if (/\bpytest\b/i.test(py) && platforms.length) {
    // 純 pytest（不用 BDD），驅動 Playwright／Selenium（web）或 Appium（app）。
    // 有獨立的 e2e 目錄時只跑那個目錄，單元測試另外成為 unit layer
    const dir = firstExisting(root, ['tests/e2e', 'tests/ui', 'tests/app', 'e2e']);
    profiles.push({
      id: 'py-pytest', language: 'python', platforms, style: 'python-pytest.md',
      layers: [layer('e2e', `pytest ${dir ? `${dir} ` : ''}--junitxml=${JUNIT_DIR}/e2e-junit.xml`, dir ? { dir } : {})],
      reviewChecks: [{ name: 'collect', command: `pytest ${dir ? `${dir} ` : ''}--collect-only -q` }],
      e2eDir: dir
    });
  }
  return profiles;
};

// 把 profile 轉成 config 的形狀：layers（以名稱為 key）、profiles（去掉執行細節）、bdd（相容舊設定：第一個有 BDD 的 profile）
export const profilesToConfig = (profiles) => ({
  layers: Object.fromEntries(profiles.flatMap((p) => p.layers).map(({ name, ...rest }) => [name, rest])),
  profiles: profiles.map((p) => ({
    id: p.id, language: p.language, platforms: p.platforms, style: p.style,
    layers: p.layers.map((l) => l.name), ...(p.bdd ? { bdd: p.bdd } : {})
  })),
  bdd: profiles.find((p) => p.bdd)?.bdd,
  reviewChecks: profiles.flatMap((p) => p.reviewChecks)
});
