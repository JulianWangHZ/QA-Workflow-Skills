// 產生確認階段的審閱頁：產生方式 → 測試矩陣 → 狀態機 → 互動原型 → 驗收清單（PM）→ BDD Feature（QA）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TYPES } from './gherkin.mjs';
import { countPrototypeScreens, readPrototypeScenarios } from './design.mjs';

const asset = (name) => readFileSync(fileURLToPath(new URL(`../assets/${name}`, import.meta.url)), 'utf8');
const PAGES = ['overview', 'matrix', 'state', 'prototype', 'acceptance', 'bdd'];

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- 共用片段 ----------

const row = ([title, desc], body) => (body
  ? `<section class="row"><div class="row-label"><h2>${escapeHtml(title)}</h2>${desc ? `<p>${escapeHtml(desc)}</p>` : ''}</div><div class="row-body">${body}</div></section>`
  : '');

const intro = (text) => `<p class="intro">${escapeHtml(text)}</p>`;

const table = (headers, rows, rowAttrs = () => '') => (rows.length === 0
  ? ''
  : `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${
      rows.map((cells, i) => `<tr${rowAttrs(i)}>${cells.join('')}</tr>`).join('')}</tbody></table>`);

const td = (html, cls = '') => `<td${cls ? ` class="${cls}"` : ''}>${html}</td>`;

const caseAnchor = (id) => `case-${id}`;
const refs = (ids) => (ids ?? []).map((id) => `<a class="ref" href="#acceptance/${caseAnchor(id)}">${escapeHtml(id)}</a>`).join(' ');

const priorityTag = (p) => `<span class="tag ${p === 'P0' ? 'p0' : p === 'P1' ? 'p1' : ''}">${escapeHtml(p)}</span>`;
const notes = (items, cls = '') => (items.length ? `<ul class="notes ${cls}">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '');

const isHigh = (level) => level === 'P0' || level === 'P1';

// ---------- 1. 產生方式 ----------

// 主流程：與 CLI 的 stage 一一對應
export const WORKFLOW = ['context', 'risk', 'cases', 'confirm', 'scripts', 'run', 'review', 'report'];
const DESIGN_STEPS = ['matrix', 'state', 'prototype', 'bdd', 'selfReview'];

// 依目前 stage 判斷每個主流程站點的狀態；確認失效時停在人工確認
const stationState = (key, stage, confirmationStatus) => {
  const current = confirmationStatus === 'stale' ? 'confirm' : stage;
  if (current === 'done') return 'done';
  const at = WORKFLOW.indexOf(current);
  const i = WORKFLOW.indexOf(key);
  if (at < 0 || i < at) return 'done';
  return i === at ? 'here' : 'todo';
};

const trackStations = ({ context, risks, design, cases, prototypeHtml, confirmationStatus, stage, r }) => {
  const rows = design.matrices.reduce((n, m) => n + m.rows.length, 0);
  const screens = countPrototypeScreens(prototypeHtml);
  const demos = readPrototypeScenarios(prototypeHtml).scenarios.length;
  const automated = cases.filter((c) => !c.manual).length;
  const outputs = {
    context: r.out.sources(context?.scope.sources.length ?? 0),
    risk: r.out.risks(risks?.risks.length ?? 0),
    cases: r.out.scenarios(cases.length),
    confirm: confirmationStatus === 'confirmed' ? r.out.confirmed : r.out.confirm,
    scripts: r.out.automated(automated),
    run: r.out.run,
    review: r.out.review,
    report: r.out.report
  };
  const steps = WORKFLOW.map((key, i) => {
    const state = stationState(key, stage, confirmationStatus);
    const gate = key === 'confirm' ? ' gate' : '';
    const star = key === 'confirm' ? '<span class="star" aria-hidden="true">★</span>' : '';
    return `<li class="step ${state}${gate}"><span class="no">${String(i + 1).padStart(2, '0')}${star}</span><span class="name">${escapeHtml(r.track[key])}</span><span class="out">${escapeHtml(outputs[key])}</span><span class="state">${escapeHtml(r.stepState[state])}</span></li>`;
  }).join('');

  const designOutputs = {
    matrix: r.out.matrices(design.matrices.length, rows),
    state: r.out.transitions(design.stateMachine.transitions.length),
    prototype: design.prototype.file ? `${r.out.screens(screens)}${demos ? ` · ${r.out.demos(demos)}` : ''}` : r.out.noPrototype,
    bdd: r.out.scenarios(cases.length),
    selfReview: r.out.score(design.selfReview.score)
  };
  const sub = DESIGN_STEPS.map((key) =>
    `<li><span class="name">${escapeHtml(r.designStep[key])}</span><span class="out">${escapeHtml(designOutputs[key])}</span></li>`).join('');

  return `<div class="flow" role="img" aria-label="${escapeHtml(WORKFLOW.map((k) => r.track[k]).join(' → '))}">
    <ol class="steps">${steps}</ol>
    <div class="design-branch">
      <span class="branch-label">${escapeHtml(r.designBranch)}</span>
      <ol class="substeps">${sub}</ol>
    </div>
    <p class="legend-line"><b>${escapeHtml(r.flowLegend[0])}</b>${escapeHtml(r.flowLegend[1])}</p>
  </div>`;
};

const figures = ({ risks, design, cases, r }) => {
  const high = (risks?.risks ?? []).filter((x) => isHigh(x.level));
  const covered = new Set(cases.flatMap((c) => c.riskIds));
  const allRows = design.matrices.flatMap((m) => m.rows);
  const items = [
    [cases.length, '', r.figures.scenarios],
    [cases.filter((c) => isHigh(c.priority)).length, '', r.figures.high],
    [high.filter((x) => covered.has(x.id)).length, `/${high.length}`, r.figures.riskCoverage],
    [allRows.filter((x) => x.caseIds?.length).length, `/${allRows.length}`, r.figures.matrixRows],
    [design.stateMachine.transitions.length, '', r.figures.transitions],
    [cases.filter((c) => c.manual).length, '', r.figures.manual]
  ];
  return `<div class="figures">${items.map(([v, suffix, label]) =>
    `<div><b>${escapeHtml(v)}${suffix ? `<small>${escapeHtml(suffix)}</small>` : ''}</b><span>${escapeHtml(label)}</span></div>`).join('')}</div>`;
};

const riskList = ({ risks, design, cases, r }) => {
  const deferred = new Map((design.coverage.deferredRisks ?? []).map((d) => [d.riskId, d.reason]));
  const items = (risks?.risks ?? []).map((x) => {
    const ids = cases.filter((c) => c.riskIds.includes(x.id)).map((c) => c.id);
    const state = ids.length
      ? `<span class="status-ok">${escapeHtml(r.covered)}</span>`
      : deferred.has(x.id)
        ? `<span class="status-bad">${escapeHtml(r.deferred)}</span>`
        : `<span class="${isHigh(x.level) ? 'status-bad' : 'status-na'}">${escapeHtml(r.uncovered)}</span>`;
    const why = !ids.length && deferred.has(x.id) ? `<span class="impact">${escapeHtml(deferred.get(x.id))}</span>` : '';
    return `<li><span class="rid">${escapeHtml(x.id)}</span>${priorityTag(x.level)}<span>${escapeHtml(x.title)}<span class="impact">${escapeHtml(x.impact)}</span>${why}</span><span>${refs(ids)}</span><span class="state">${state}</span></li>`;
  });
  return items.length ? `<ul class="risk-list">${items.join('')}</ul>` : '';
};

const techniqueGrid = ({ design, dict, r }) => `<div class="techniques">${design.coverage.techniques.map((t) => {
  const name = escapeHtml(dict.technique[t.technique] ?? t.technique);
  return t.applicable
    ? `<div><h3><span class="mark">${name}</span></h3><span class="en">${escapeHtml(t.technique)}</span><p>${refs(t.caseIds)}</p></div>`
    : `<div class="na"><h3>${name}</h3><span class="en">${escapeHtml(t.technique)} · ${escapeHtml(r.na)}</span><p>${escapeHtml(t.reason)}</p></div>`;
}).join('')}</div>`;

// 評分標準（review-rubric.md）各維度滿分；breakdown 可以直接寫 { score, max } 覆蓋
const RUBRIC_MAX = { 風險覆蓋: 20, 技法與矩陣: 20, 狀態機: 10, 預期可判定: 15, 依據真實: 10, BDD: 15, 精簡與原型: 10 };
const compact = (s) => String(s).replace(/\s+/g, '');

// 評審寫出的名稱常有空白或字尾差異（「BDD品質」「技法與矩陣完整」），忽略空白後用前綴比對
export const rubricMax = (name) => {
  const key = Object.keys(RUBRIC_MAX).find((k) => compact(name).startsWith(k));
  return key ? RUBRIC_MAX[key] : 100;
};

const scorecard = ({ design, minReviewScore, r }) => {
  const { selfReview } = design;
  const bars = Object.entries(selfReview.breakdown ?? {}).map(([name, value]) => {
    const score = typeof value === 'number' ? value : Number(value?.score ?? 0);
    const max = typeof value === 'object' && value?.max ? Number(value.max) : rubricMax(name);
    const pct = Math.max(0, Math.min(100, (score / max) * 100));
    return `<li><span>${escapeHtml(name)}</span><span class="bar"><i style="width:${pct}%"></i></span><span class="v">${escapeHtml(score)}/${escapeHtml(max)}</span></li>`;
  });
  const passed = selfReview.score >= minReviewScore;
  return `<div class="score">
    <div class="total"><b>${escapeHtml(selfReview.score)}</b><small>/100</small>
      <p>${escapeHtml(r.threshold(minReviewScore))} · ${escapeHtml(r.rounds(selfReview.rounds))}${passed ? '' : `<br><span class="status-bad">${escapeHtml(r.belowThreshold)}</span>`}</p></div>
    <div>${bars.length ? `<ul class="bars">${bars.join('')}</ul>` : ''}${
      (selfReview.notes ?? []).length ? `<div class="review-notes">${notes(selfReview.notes, 'neutral')}</div>` : ''}</div>
  </div>`;
};

const overviewPage = (data) => {
  const { context, design, warnings, r } = data;
  const sources = context
    ? `<ul class="sources">${context.scope.sources.map((s) => `<li><span>${escapeHtml(s.type)}</span><span>${escapeHtml(s.ref)}</span></li>`).join('')}</ul>`
    : '';
  return [
    intro(r.intro.overview),
    trackStations(data),
    row(r.rows.figures, figures(data)),
    row(r.rows.scope, sources),
    row(r.rows.risks, riskList(data)),
    row(r.rows.techniques, techniqueGrid(data)),
    row(r.rows.review, scorecard(data)),
    row(r.rows.questions, notes(design.openQuestions ?? [])),
    row(r.rows.warnings, notes(warnings))
  ].join('\n');
};

// ---------- 2. 測試矩陣 ----------

const matrixPage = ({ design, dict, r }) => {
  if (design.matrices.length === 0) return intro(r.intro.matrix) + `<p class="muted">${escapeHtml(r.noMatrix)}</p>`;
  const body = design.matrices.map((m) => {
    const covered = m.rows.filter((x) => x.caseIds?.length).length;
    const rows = m.rows.map((x) => [
      ...x.cells.map((c) => td(escapeHtml(c))),
      x.caseIds?.length ? td(refs(x.caseIds)) : td(`<em>${escapeHtml(r.skipped)}</em>${escapeHtml(x.skipReason)}`, 'skipped')
    ]);
    return `<div class="matrix" id="${escapeHtml(m.id)}">
      <div class="matrix-head"><h3>${escapeHtml(m.title)}</h3><span class="meta"><span class="mono">${escapeHtml(m.id)}</span> · ${escapeHtml(dict.technique[m.technique] ?? m.technique)} · ${escapeHtml(r.matrixMeta(covered, m.rows.length))}</span></div>
      ${m.description ? `<p class="matrix-desc">${escapeHtml(m.description)}</p>` : ''}
      ${table([...m.columns, r.col.cases], rows, (i) => (m.rows[i].caseIds?.length ? '' : ' class="skip"'))}
    </div>`;
  }).join('\n');
  return intro(r.intro.matrix) + body;
};

// ---------- 3. 狀態機 ----------

const mermaidLabel = (text) => String(text).replace(/[":;#{}<>]/g, ' ').replace(/\s+/g, ' ').trim();

// 用由左到右的流程圖畫狀態圖：中文標籤的寬度計算比 stateDiagram 準確，不會互相重疊或被截斷
export const mermaidSource = (machine) => {
  const states = [...new Set([...machine.states, ...machine.transitions.flatMap((t) => [t.from, t.to])])];
  const id = (name) => `s${states.indexOf(name)}`;
  return [
    'flowchart LR',
    ...(machine.initial ? ['  start(("·")):::start'] : []),
    ...states.map((s) => `  ${id(s)}("${mermaidLabel(s)}")`),
    ...(machine.initial ? [`  start --> ${id(machine.initial)}`] : []),
    ...machine.transitions.filter((t) => t.valid).map((t) => `  ${id(t.from)} -->|"${mermaidLabel(t.trigger)}"| ${id(t.to)}`),
    '  classDef start fill:#16191a,stroke:#16191a'
  ].join('\n');
};

const statePage = ({ design, r }) => {
  const machine = design.stateMachine;
  if (machine.transitions.length === 0) return intro(r.intro.state) + `<p class="muted">${escapeHtml(r.noMachine)}</p>`;
  const ordered = [...machine.transitions.filter((t) => t.valid), ...machine.transitions.filter((t) => !t.valid)];
  const rows = ordered.map((t) => [
    td(escapeHtml(t.from)),
    td(escapeHtml(t.trigger)),
    td(t.valid ? escapeHtml(t.to) : '<span class="faint">—</span>'),
    td(t.valid ? `<span class="status-ok">${escapeHtml(r.allowed)}</span>` : `<span class="status-bad">${escapeHtml(r.blocked)}</span>${t.reason ? `<span class="muted"> · ${escapeHtml(t.reason)}</span>` : ''}`),
    td(refs(t.caseIds))
  ]);
  const label = [machine.entity ?? r.rows.diagram[0], r.rows.diagram[1]];
  return [
    intro(r.intro.state),
    row(label, `<div class="diagram"><pre class="mermaid">${escapeHtml(mermaidSource(machine))}</pre></div><p class="diagram-note muted" hidden>${escapeHtml(r.diagramOffline)}</p>`),
    row(r.rows.transitions, table([r.col.from, r.col.trigger, r.col.to, r.col.result, r.col.cases], rows))
  ].join('\n');
};

// ---------- 4. 互動原型 ----------

const prototypePage = ({ design, r }) => {
  const proto = design.prototype;
  if (!proto.file) return intro(r.intro.prototype) + `<p class="muted">${escapeHtml(r.noPrototype)}${escapeHtml(proto.skipReason)}</p>`;
  const src = `design/${proto.file.split('/').map(encodeURIComponent).join('/')}`;
  return [
    `<p class="intro">${escapeHtml(r.intro.prototype)} <a class="proto-open" href="${src}" target="_blank" rel="noopener">${escapeHtml(r.openPrototype)} ↗</a></p>`,
    `<iframe class="proto-frame" src="${src}" title="prototype"></iframe>`
  ].join('\n');
};

// ---------- 5. 驗收清單（PM） ----------

const bullets = (items) => `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('') || '<li class="faint">—</li>'}</ul>`;

const scenarioBlock = (c, dict, r) => {
  const tags = [
    ...(c.labels ?? []).map((l) => `<span class="tag label">${escapeHtml(l.slice(1))}</span>`),
    `<span class="tag">${escapeHtml(dict.type[c.type] ?? c.type)}</span>`,
    c.boundary ? `<span class="tag boundary">${escapeHtml(r.boundaryTag)}</span>` : '',
    c.smoke ? `<span class="tag smoke">${escapeHtml(r.smoke)}</span>` : '',
    c.manual ? `<span class="tag manual">${escapeHtml(r.manualTag)}</span>` : '',
    priorityTag(c.priority)
  ].join('');
  return `<article class="scenario" id="${caseAnchor(c.id)}" data-case="${escapeHtml(c.id)}" data-priority="${escapeHtml(c.priority)}" data-type="${escapeHtml(c.type)}">
    <label class="check"><input type="checkbox" aria-label="${escapeHtml(c.id)}"></label>
    <div class="head"><span class="sid">${escapeHtml(c.id)}</span><h3><span class="t">${escapeHtml(c.title)}</span></h3><span class="tags">${tags}</span></div>
    <div class="gwt">
      <div><h4>${escapeHtml(r.given)}</h4>${bullets(c.preconditions)}</div>
      <div><h4>${escapeHtml(r.when)}</h4>${bullets(c.steps)}</div>
      <div class="then"><h4>${escapeHtml(r.then)}</h4>${bullets(c.expected)}</div>
    </div>
  </article>`;
};

const acceptancePage = ({ features, cases, dict, r }) => {
  const usedTypes = TYPES.filter((t) => cases.some((c) => c.type === t));
  const toolbar = `<div class="toolbar">
    <input type="search" id="ac-search" placeholder="${escapeHtml(r.search)}" aria-label="${escapeHtml(r.search)}">
    <select id="ac-priority" aria-label="${escapeHtml(r.allPriorities)}"><option value="">${escapeHtml(r.allPriorities)}</option>${['P0', 'P1', 'P2', 'P3'].map((p) => `<option>${p}</option>`).join('')}</select>
    <select id="ac-type" aria-label="${escapeHtml(r.allTypes)}"><option value="">${escapeHtml(r.allTypes)}</option>${usedTypes.map((t) => `<option value="${t}">${escapeHtml(dict.type[t])}</option>`).join('')}</select>
    <span class="progress"><span class="meter"><i id="ac-meter"></i></span><span id="ac-progress" data-label="${escapeHtml(r.progress)}"></span></span>
  </div>`;

  const sections = features.map(({ feature, file }) => {
    const own = cases.filter((c) => c.file === file);
    // 依 feature 中的段落（# #### 名稱 ####）或 Rule 分組，維持檔案中的順序
    const groupOf = (c) => c.section ?? c.rule ?? '';
    const ordered = [...own].sort((a, b) => a.line - b.line);
    const groups = [...new Set(ordered.map(groupOf))];
    const body = groups.map((group) => {
      const members = ordered.filter((c) => groupOf(c) === group);
      const head = group ? `<h3 class="rule-head">${escapeHtml(group)}<span class="count">${members.length}</span></h3>` : '';
      return head + members.map((c) => scenarioBlock(c, dict, r)).join('');
    }).join('');
    const story = feature.description.length
      ? `<p class="story">${feature.description.map((l) => `<span>${escapeHtml(l)}</span>`).join('')}</p>`
      : '';
    return `<section class="feature" data-feature="${escapeHtml(file)}"><div class="feature-head"><span class="file">${escapeHtml(file)}</span><h2>${escapeHtml(feature.name)}</h2></div>${story}${body}</section>`;
  }).join('\n');

  return intro(r.intro.acceptance) + toolbar + sections + `<p class="empty-filter" id="ac-empty">${escapeHtml(r.noMatch)}</p>`;
};

// ---------- 6. BDD Feature（QA） ----------

const KEYWORD = /^(\s*)(Feature|Background|Rule|Scenario Outline|Scenario Template|Scenario|Example|Examples|Scenarios)(\s*:)/;
const STEP = /^(\s*)(Given|When|Then|And|But|\*)(?=\s)/;
const STEP_KIND = { Given: 'given', When: 'when', Then: 'then' };

// 逐行上色；And / But / * 沿用前一個步驟（Given / When / Then）的顏色，所以需要帶著狀態
export const highlightFeature = (text) => {
  let kind = null;
  const strings = (html) => html.replace(/(&quot;[^&]*?&quot;|「[^」]*」|&lt;[^&\s]+&gt;)/g, '<span class="g-str">$1</span>');
  return text.replace(/\n$/, '').split('\n').map((raw) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('#')) return `<span class="g-cmt">${escapeHtml(raw)}</span>`;
    if (trimmed.startsWith('@')) {
      return escapeHtml(raw).replace(/(@[^\s]+)/g, (tag) => `<span class="${/^@TC-\d+$/.test(tag) ? 'g-tc' : 'g-tag'}">${tag}</span>`);
    }
    const kw = raw.match(KEYWORD);
    if (kw) {
      kind = null;
      return `${escapeHtml(kw[1])}<span class="g-kw">${escapeHtml(kw[2] + kw[3])}</span>${strings(escapeHtml(raw.slice(kw[0].length)))}`;
    }
    const step = raw.match(STEP);
    if (step) {
      kind = STEP_KIND[step[2]] ?? kind;
      return `${escapeHtml(step[1])}<span class="g-step g-${kind ?? 'given'}">${escapeHtml(step[2])}</span>${strings(escapeHtml(raw.slice(step[0].length)))}`;
    }
    return strings(escapeHtml(raw));
  });
};

const bddPage = ({ files, r }) => {
  const legend = `<table><tbody>${Object.values(r.legend).map(([name, text]) =>
    `<tr><td style="width:88px"><b>${escapeHtml(name)}</b></td><td>${escapeHtml(text)}</td></tr>`).join('')}</tbody></table>`;
  const stepLegend = `<div class="step-legend">${['given', 'when', 'then'].map((k) =>
    `<span><span class="g-step g-${k}">${k[0].toUpperCase() + k.slice(1)}</span>${escapeHtml(r.stepLegend[k])}</span>`).join('')}<span class="muted">${escapeHtml(r.stepLegend.and)}</span></div>`;
  const blocks = files.map(({ file, text }, i) => {
    const lines = highlightFeature(text).map((html, n) => `<span class="ln" data-n="${n + 1}">${html || ' '}</span>`).join('');
    return `<div class="file-block"><div class="file-head"><span class="mono">design/features/${escapeHtml(file)}</span>
      <button class="copy" type="button" data-src="raw-${i}" data-label="${escapeHtml(r.copy)}" data-done="${escapeHtml(r.copied)}">${escapeHtml(r.copy)}</button></div>
      <pre class="code">${lines}</pre><textarea id="raw-${i}" hidden>${escapeHtml(text)}</textarea></div>`;
  }).join('\n');
  return intro(r.intro.bdd) + row(r.rows.steps, stepLegend) + row(r.rows.legend, legend) + blocks;
};

// ---------- 組裝 ----------

export const themeToggle = (label) => `<button type="button" class="theme-toggle" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
  <svg class="moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z"/></svg>
  <svg class="sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1"/></svg>
</button>`;

export const renderCasesReview = ({
  runId, context, risks, loaded, confirmationStatus, confirmation, stage = 'confirm', warnings = [], minReviewScore = 85, dict, language
}) => {
  const r = dict.review;
  const { design, cases, files, prototypeHtml } = loaded;
  // 依檔案中最小的情境編號排序，讓驗收清單與 BDD 分頁的順序和情境編號一致
  const firstCase = (file) => Math.min(...cases.filter((c) => c.file === file).map((c) => Number(c.id.slice(3))), Infinity);
  const ordered = [...files].filter((f) => f.feature).sort((a, b) => firstCase(a.file) - firstCase(b.file));
  const features = ordered.map((f) => ({ feature: f.feature, file: f.file }));
  const data = { context, risks, design, cases, files: ordered, features, warnings, minReviewScore, confirmationStatus, stage, prototypeHtml, dict, r };

  const builders = { overview: overviewPage, matrix: matrixPage, state: statePage, prototype: prototypePage, acceptance: acceptancePage, bdd: bddPage };
  // 分頁元素 id 加前綴，避免瀏覽器依網址 hash 自動捲動到分頁位置
  const pages = PAGES.map((id) => `<div class="page" id="page-${id}" data-page="${id}">${builders[id](data)}</div>`).join('\n');
  const tabs = PAGES.map((id, i) => `<a href="#${id}"><span class="n">${i + 1}</span>${escapeHtml(r.tabs[id])}</a>`).join('');

  const statusLabel = confirmationStatus === 'confirmed'
    ? `${r.confirmed} · ${confirmation.confirmedBy} · ${confirmation.confirmedAt.slice(0, 16).replace('T', ' ')}`
    : r[confirmationStatus];
  const replacements = {
    lang: language,
    title: `${r.kicker} · ${context?.scope.summary ?? runId}`,
    kicker: `${r.kicker} · ${runId}`,
    heading: context?.scope.summary ?? runId,
    meta: `Run ${runId} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · design ${loaded.designHash.slice(0, 12)}`,
    statusClass: confirmationStatus,
    statusLabel,
    statusTip: r.statusTip[confirmationStatus],
    runId
  };
  const html = Object.entries(replacements).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, escapeHtml(value)),
    asset('cases-review.html')
  );
  return html.replace('{{theme}}', asset('theme.css')).replace('{{themeToggle}}', themeToggle(r.themeLabel))
    .replace('{{tabs}}', tabs).replace('{{pages}}', pages);
};
