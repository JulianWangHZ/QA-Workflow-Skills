// 讀取用例設計產物：design.json、design/features/*.feature、原型；
// 把 feature 中的 Scenario 與 design.json 的 scenarios 索引（編號、優先級、風險、類型）對應起來，並計算 designHash。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { canonicalHash, readJsonIfExists } from './io.mjs';
import { parseGherkin, toCases } from './gherkin.mjs';

const listFeatureFiles = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listFeatureFiles(path);
    return name.endsWith('.feature') ? [path] : [];
  }).sort();
};

const normalize = (text) => text.replace(/\r\n?/g, '\n');

const duplicates = (values) => [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];

// 讀取目錄下所有 feature；file 為相對 dir 的 POSIX 路徑。
export const loadFeatures = (dir) => {
  const parsed = listFeatureFiles(dir).map((path) => {
    const file = relative(dir, path).split(sep).join('/');
    const text = normalize(readFileSync(path, 'utf8'));
    const { feature, errors } = parseGherkin(text, file);
    const derived = toCases(feature, file);
    return { file, text, feature, cases: derived.cases, errors: [...errors, ...derived.errors] };
  });
  const scenarios = parsed.flatMap((p) => p.cases);
  const titleErrors = duplicates(scenarios.map((c) => c.title))
    .map((t) => `Scenario 標題重複：「${t}」（標題必須唯一，用來對應編號與自動化測試）`);
  return {
    files: parsed,
    scenarios,
    errors: [...parsed.flatMap((p) => p.errors), ...titleErrors]
  };
};

// 以（檔案、標題）對應索引；索引與 feature 必須一一對應。
export const joinIndex = (scenarios, index) => {
  const errors = [];
  const key = (file, title) => `${file}\u0000${title}`;
  const byKey = new Map((index ?? []).map((entry) => [key(entry.file, entry.title), entry]));
  duplicates((index ?? []).map((e) => e.id)).forEach((id) => errors.push(`design.json scenarios 的編號重複：${id}`));

  const cases = scenarios.flatMap((s) => {
    const entry = byKey.get(key(s.file, s.title));
    if (!entry) {
      errors.push(`${s.file}:${s.line} Scenario「${s.title}」沒有出現在 design.json 的 scenarios（需要 id、priority、riskIds、type）`);
      return [];
    }
    return [{ id: entry.id, title: s.title, priority: entry.priority, riskIds: entry.riskIds, type: entry.type, ...s }];
  });
  const found = new Set(scenarios.map((s) => key(s.file, s.title)));
  (index ?? []).filter((e) => !found.has(key(e.file, e.title)))
    .forEach((e) => errors.push(`design.json scenarios 的 ${e.id}「${e.title}」在 ${e.file} 中找不到同名 Scenario`));
  const order = (c) => Number(c.id.slice(3));
  return { cases: [...cases].sort((a, b) => order(a) - order(b)), errors };
};

export const prototypePath = (run, design) =>
  design?.prototype?.file ? join(run.designDir, design.prototype.file) : null;

// 原型內的情境示範腳本：<script type="application/json" id="qa-scenarios">[…]</script>
export const readPrototypeScenarios = (html) => {
  const m = html?.match(/<script\s+type="application\/json"\s+id="qa-scenarios"\s*>([\s\S]*?)<\/script>/);
  if (!m) return { scenarios: [], error: null };
  try {
    const value = JSON.parse(m[1]);
    return Array.isArray(value) ? { scenarios: value, error: null } : { scenarios: [], error: 'qa-scenarios 必須是陣列' };
  } catch (err) {
    return { scenarios: [], error: `qa-scenarios 不是合法的 JSON：${err.message}` };
  }
};

export const countPrototypeScreens = (html) => (html?.match(/<section[^>]*class="[^"]*\bscreen\b[^"]*"/g) ?? []).length;

// 把審閱時看到的全部內容納入 hash：design.json、所有 feature 原文、原型 HTML。
export const loadDesign = (run) => {
  const design = readJsonIfExists(run.artifact('design'));
  const loaded = loadFeatures(run.featuresDir);
  const joined = joinIndex(loaded.scenarios, design?.scenarios);
  const protoPath = prototypePath(run, design);
  const prototypeHtml = protoPath && existsSync(protoPath) ? normalize(readFileSync(protoPath, 'utf8')) : null;
  const designHash = canonicalHash({
    design,
    features: loaded.files.map(({ file, text }) => ({ file, text })),
    prototype: prototypeHtml
  });
  return {
    design,
    files: loaded.files,
    cases: joined.cases,
    errors: loaded.errors.length > 0 ? loaded.errors : joined.errors,
    prototypeHtml,
    prototypeExists: prototypeHtml !== null,
    designHash
  };
};
