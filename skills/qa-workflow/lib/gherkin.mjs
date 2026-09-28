// Gherkin 子集解析器：Feature、描述、Background、Rule、Scenario、tags、doc string、data table，
// 以及段落分隔註解（# ####…）。關鍵字只接受英文，步驟與內容可以是任何語言。
const HEADERS = [
  ['outline', ['Scenario Outline', 'Scenario Template']],
  ['feature', ['Feature']],
  ['background', ['Background']],
  ['rule', ['Rule']],
  ['scenario', ['Scenario', 'Example']],
  ['examples', ['Examples', 'Scenarios']]
];

const STEPS = [['given', ['Given']], ['when', ['When']], ['then', ['Then']], ['and', ['And', '*']], ['but', ['But']]];

// 常見的非英文關鍵字：給出明確的錯誤訊息，而不是「無法解析」
const LOCALIZED_KEYWORD = /^(功能|背景|規則|場景大綱|劇本大綱|場景|劇本|例子|假如|假設|假定|當|那麼|而且|並且|同時|但是)\s*[:：]?/;

const matchHeader = (line) => {
  for (const [kind, words] of HEADERS) {
    for (const word of words) {
      const m = line.match(new RegExp(`^${word}\\s*:\\s*(.*)$`));
      if (m) return { kind, name: m[1].trim() };
    }
  }
  return null;
};

const matchStep = (line) => {
  for (const [kind, words] of STEPS) {
    for (const word of words) {
      if (line.startsWith(word) && /^\s+\S/.test(line.slice(word.length))) return { kind, text: line.slice(word.length).trim() };
    }
  }
  return null;
};

const DIVIDER = /^#\s*#{6,}\s*$/;

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export const parseGherkin = (text, file = '<feature>') => {
  const errors = [];
  const err = (lineNo, message) => errors.push(`${file}:${lineNo} ${message}`);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  let feature = null;
  let pendingTags = [];
  let rule = null;
  let block = null;         // 目前的 background 或 scenario
  let examples = null;      // 目前的 Examples
  let lastStep = null;
  let lastType = null;
  let inDescription = false;
  let docString = null;     // { fence, indent, lines, step }
  let section = null;       // 目前的段落名稱（# #### 名稱 #### 之間）
  let dividerOpen = false;

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    if (docString) {
      if (raw.trim() === docString.fence) {
        docString.step.docString = docString.lines.join('\n');
        docString = null;
      } else {
        docString.lines.push(raw.slice(Math.min(docString.indent, raw.length - raw.trimStart().length)));
      }
      return;
    }

    const line = raw.trim();
    if (line === '') return;
    if (line.startsWith('#')) {
      if (/^#\s*language\s*:/.test(line)) return err(lineNo, '請使用英文關鍵字（Feature / Scenario / Given / When / Then），不要加 # language');
      if (DIVIDER.test(line)) {
        dividerOpen = !dividerOpen;
      } else if (dividerOpen && feature) {
        section = line.replace(/^#\s*/, '').trim();
      }
      return;
    }
    if (LOCALIZED_KEYWORD.test(line)) {
      return err(lineNo, `關鍵字請用英文（Feature / Background / Scenario / Given / When / Then / And），步驟內容可以用中文：${line.slice(0, 30)}`);
    }

    if (line.startsWith('@')) {
      pendingTags = [...pendingTags, ...line.split(/\s+/).filter((t) => t.startsWith('@'))];
      inDescription = false;
      return;
    }

    const header = matchHeader(line);
    if (header) {
      inDescription = false;
      const tags = pendingTags;
      pendingTags = [];
      if (header.kind === 'feature') {
        if (feature) return err(lineNo, '一個檔案只能有一個 Feature');
        feature = { name: header.name, tags, description: [], background: null, scenarios: [], line: lineNo };
        inDescription = true;
        return;
      }
      if (!feature) return err(lineNo, `${header.kind} 必須在 Feature 之下`);
      examples = null;
      lastStep = null;
      lastType = null;
      if (header.kind === 'background') {
        block = { steps: [], line: lineNo };
        feature.background = block;
      } else if (header.kind === 'rule') {
        rule = { name: header.name, tags };
        block = null;
      } else if (header.kind === 'scenario' || header.kind === 'outline') {
        block = {
          name: header.name,
          tags: [...feature.tags, ...(rule?.tags ?? []), ...tags],
          ownTags: tags,
          rule: rule?.name ?? null,
          section,
          outline: header.kind === 'outline',
          steps: [],
          examples: [],
          line: lineNo
        };
        feature.scenarios.push(block);
      } else if (header.kind === 'examples') {
        if (!block?.outline) return err(lineNo, 'Examples 只能出現在 Scenario Outline 之下');
        examples = { name: header.name, tags, header: null, rows: [], line: lineNo };
        block.examples.push(examples);
      }
      return;
    }

    if (inDescription && feature && !block) {
      feature.description.push(line);
      return;
    }

    if (line.startsWith('|')) {
      if (examples) {
        if (!examples.header) examples.header = splitRow(line);
        else examples.rows.push(splitRow(line));
      } else if (lastStep) {
        lastStep.table = [...(lastStep.table ?? []), splitRow(line)];
      } else {
        err(lineNo, '表格必須接在步驟或 Examples 之後');
      }
      return;
    }

    if (line.startsWith('"""') || line.startsWith('```')) {
      if (!lastStep) return err(lineNo, 'doc string 必須接在步驟之後');
      docString = { fence: line.slice(0, 3), indent: raw.length - raw.trimStart().length, lines: [], step: lastStep };
      return;
    }

    const step = matchStep(line);
    if (step) {
      if (!block) return err(lineNo, '步驟必須在 Background 或 Scenario 之下');
      if (examples) return err(lineNo, 'Examples 之後不能再有步驟');
      const type = step.kind === 'and' || step.kind === 'but' ? lastType : step.kind;
      if (!type) return err(lineNo, `第一個步驟不能是 ${line.split(/\s/)[0]}`);
      lastStep = { type, keyword: step.kind, text: step.text, line: lineNo };
      lastType = type;
      block.steps.push(lastStep);
      return;
    }

    err(lineNo, `無法解析：${line.slice(0, 60)}`);
  });

  if (docString) err(lines.length, 'doc string 沒有結束');
  if (!feature && errors.length === 0) err(1, '找不到 Feature');
  return { feature, errors };
};

// ---------- 從 Scenario 推導情境 ----------
// Tag 採三軸：套件（@smoke ⊂ @regression）、執行（@auto；沒有代表人工）、性質（@邊界）。
// 其餘 tag 是描述性 tag（頁面、情境條件）。編號、優先級、風險寫在 design.json 的 scenarios 索引，不放在 tag。

export const TYPES = [
  'positive', 'negative', 'boundary', 'error', 'permission', 'state',
  'concurrency', 'integration', 'ui', 'performance', 'security', 'regression'
];

export const RESERVED_TAGS = ['@smoke', '@regression', '@auto', '@邊界', '@boundary'];
const FORBIDDEN_TAG = /^@(P[0-3]|TC-\d+|R-\d+|v?\d+(\.\d+)+)$/i;

const stepText = (step) => step.text;

export const toCases = (feature, file) => {
  const errors = [];
  if (!feature) return { cases: [], errors };
  const background = (feature.background?.steps ?? []).map(stepText);
  if (feature.description.length === 0) {
    errors.push(`${file}:${feature.line} Feature「${feature.name}」下方需要三行說明：角色、目標、價值`);
  }

  const cases = feature.scenarios.map((s) => {
    const where = `${file}:${s.line} Scenario「${s.name}」`;
    const tags = [...new Set(s.tags)];
    if (s.outline) errors.push(`${where} 不使用 Scenario Outline，請把每組資料拆成獨立的 Scenario`);
    if (!tags.includes('@regression')) errors.push(`${where} 缺少 @regression（@smoke 也必須同時標 @regression）`);
    tags.filter((t) => FORBIDDEN_TAG.test(t))
      .forEach((t) => errors.push(`${where} 不使用 ${t} 這類 tag；編號、優先級、風險請寫在 design.json 的 scenarios`));
    const descriptive = tags.filter((t) => !RESERVED_TAGS.includes(t) && !FORBIDDEN_TAG.test(t));
    if (descriptive.length === 0) errors.push(`${where} 需要至少一個描述性 tag（頁面或情境條件，例如 @登入頁面 @密碼錯誤）`);

    const byType = (t) => s.steps.filter((st) => st.type === t).map(stepText);
    const steps = byType('when');
    const expected = byType('then');
    if (!s.name) errors.push(`${where} Scenario 需要標題`);
    if (steps.length === 0) errors.push(`${where} 至少需要一個 When`);
    if (expected.length === 0) errors.push(`${where} 至少需要一個 Then`);

    return {
      title: s.name,
      manual: !tags.includes('@auto'),
      smoke: tags.includes('@smoke'),
      boundary: tags.includes('@邊界') || tags.includes('@boundary'),
      tags,
      labels: descriptive,
      feature: feature.name,
      ...(s.section ? { section: s.section } : {}),
      ...(s.rule ? { rule: s.rule } : {}),
      file,
      line: s.line,
      preconditions: [...background, ...byType('given')],
      steps,
      expected
    };
  });
  return { cases, errors };
};
