// 偵測專案的測試技術棧，產生 config.layers 的建議值。只做建議，最後由使用者確認。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { detectProfiles, profilesToConfig, JUNIT_DIR } from './profiles.mjs';

const readText = (root, file) => {
  const path = join(root, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
};

const readPackage = (root) => {
  const text = readText(root, 'package.json');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const firstExisting = (root, dirs) => dirs.find((d) => existsSync(join(root, d)));

const withDir = (root, layer, dirs) => {
  const dir = firstExisting(root, dirs);
  return dir ? { ...layer, dir } : layer;
};

const nodeLayers = (root, pkg) => {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = pkg.scripts ?? {};
  const stack = [];
  const layers = {};

  // e2e 與 BDD 交給 profiles 判斷；這裡只處理單元測試
  const detected = profilesToConfig(detectProfiles(root, pkg));
  const bdd = detected.bdd;
  Object.assign(layers, detected.layers);
  stack.push(...detected.profiles.map((p) => p.id));
  if (!Object.keys(detected.layers).length && deps.cypress) {
    stack.push('cypress');
    layers.e2e = withDir(root, {
      command: `npx cypress run --reporter junit --reporter-options mochaFile=${JUNIT_DIR}/cypress/junit-[hash].xml`,
      junit: `${JUNIT_DIR}/cypress`
    }, ['cypress/e2e']);
  }

  const unitDirs = ['tests/unit', 'test/unit', '__tests__', 'test', 'tests'];
  if (deps.vitest) {
    stack.push('vitest');
    layers.unit = withDir(root, {
      command: `npx vitest run --reporter=default --reporter=junit --outputFile=${JUNIT_DIR}/unit-junit.xml`,
      junit: `${JUNIT_DIR}/unit-junit.xml`
    }, unitDirs);
  } else if (deps.jest) {
    stack.push('jest');
    const junit = deps['jest-junit'];
    layers.unit = withDir(root, junit
      ? {
          command: 'npx jest --reporters=default --reporters=jest-junit',
          junit: `${JUNIT_DIR}/unit-junit.xml`,
          env: { JEST_JUNIT_OUTPUT_DIR: JUNIT_DIR, JEST_JUNIT_OUTPUT_NAME: 'unit-junit.xml' }
        }
      : { command: 'npx jest' }, unitDirs);
  } else if (/^node\s+--test\b/.test(scripts.test ?? '')) {
    stack.push('node-test');
    const args = scripts.test.replace(/^node\s+--test\b/, '').trim();
    layers.unit = withDir(root, {
      command: ['node --test --test-reporter=spec --test-reporter-destination=stdout',
        `--test-reporter=junit --test-reporter-destination=${JUNIT_DIR}/unit-junit.xml`, args].filter(Boolean).join(' '),
      junit: `${JUNIT_DIR}/unit-junit.xml`
    }, unitDirs);
  } else if (scripts.test && !/no test specified/.test(scripts.test)) {
    stack.push('npm-test');
    layers.unit = withDir(root, { command: 'npm test' }, unitDirs);
  }
  // 代碼審查的確定性檢查：專案已有的型別、格式與 lint 指令，以及 BDD 步驟是否都有實作
  const reviewChecks = [
    ...detected.reviewChecks,
    ...(['check', 'typecheck', 'type-check', 'lint'].filter((name) => scripts[name]).slice(0, 2)
      .map((name) => ({ name, command: `npm run ${name}` })))
  ];
  return {
    stack: ['node', ...stack], layers, ...(bdd ? { bdd } : {}), ...(reviewChecks.length ? { reviewChecks } : {}),
    profiles: detected.profiles
  };
};

const DETECTORS = [
  (root) => {
    const pkg = readPackage(root);
    return pkg ? nodeLayers(root, pkg) : null;
  },
  (root) => {
    // Node 專案已經處理過 profiles；純 Python 專案在這裡偵測 BDD profile 與單元測試
    const hasNode = Boolean(readPackage(root));
    const profiles = hasNode ? [] : detectProfiles(root, null);
    const detected = profilesToConfig(profiles);
    const markers = ['pytest.ini', 'pyproject.toml', 'setup.cfg', 'tox.ini', 'requirements.txt', 'requirements-dev.txt'];
    const usesPytest = markers.some((m) => {
      const text = readText(root, m);
      return text !== null && (m === 'pytest.ini' || /pytest/.test(text));
    });
    if (!usesPytest && !profiles.length) return null;
    // pytest-bdd 或沒有獨立 e2e 目錄的純 pytest，已經在 e2e layer 跑全部測試，不另外建立 unit layer
    const plain = profiles.find((p) => p.id === 'py-pytest');
    const coveredByE2e = profiles.some((p) => p.id === 'py-pytest-bdd') || (plain && !plain.e2eDir);
    const unitCommand = coveredByE2e || !usesPytest
      ? null
      : { command: `pytest ${plain?.e2eDir ? `--ignore=${plain.e2eDir} ` : ''}--junitxml=${JUNIT_DIR}/unit-junit.xml`, junit: `${JUNIT_DIR}/unit-junit.xml` };
    return {
      stack: ['python', ...profiles.map((p) => p.id), ...(usesPytest ? ['pytest'] : [])],
      ...(detected.bdd ? { bdd: detected.bdd } : {}),
      ...(detected.reviewChecks.length ? { reviewChecks: detected.reviewChecks } : {}),
      profiles: detected.profiles,
      layers: { ...detected.layers, ...(unitCommand ? { unit: withDir(root, unitCommand, ['tests', 'test']) } : {}) }
    };
  },
  (root) => (existsSync(join(root, 'go.mod')) ? { stack: ['go'], layers: { unit: { command: 'go test ./...' } } } : null),
  (root) => (existsSync(join(root, 'Cargo.toml')) ? { stack: ['rust'], layers: { unit: { command: 'cargo test' } } } : null),
  (root) => (existsSync(join(root, 'pom.xml'))
    ? { stack: ['java', 'maven'], layers: { unit: { command: 'mvn -q test', junit: 'target/surefire-reports' } } }
    : null),
  (root) => (['build.gradle', 'build.gradle.kts'].some((f) => existsSync(join(root, f)))
    ? { stack: ['java', 'gradle'], layers: { unit: { command: './gradlew test', junit: 'build/test-results/test' } } }
    : null)
];

// 多種技術棧並存時（例如前端 Node + 後端 Python），先偵測到的 layer 優先。
export const detectStack = (root) =>
  DETECTORS.map((detect) => detect(root)).filter(Boolean).reduce(
    (acc, d) => ({
      stack: [...acc.stack, ...d.stack],
      layers: { ...d.layers, ...acc.layers },
      ...(acc.bdd ?? d.bdd ? { bdd: acc.bdd ?? d.bdd } : {}),
      ...(acc.reviewChecks || d.reviewChecks ? { reviewChecks: [...(acc.reviewChecks ?? []), ...(d.reviewChecks ?? [])] } : {}),
      profiles: [...acc.profiles, ...(d.profiles ?? [])]
    }),
    { stack: [], layers: {}, profiles: [] }
  );
