// CLI 各子指令的實作。每個指令回傳 exit code；錯誤以 QaError 拋出，由 bin/qa.mjs 統一輸出。
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { QaError, canonicalHash, readJson, readJsonIfExists, writeJson, writeText } from './io.mjs';
import { ARTIFACT_FILES, findRoot, projectPaths, readCurrentRunId, runPaths } from './paths.mjs';
import { ARTIFACTS, validateArtifact } from './schema.mjs';
import { STAGES, advanceState, createState, jumpState, rewindState, stageIndex } from './state.mjs';
import {
  DEFAULT_CASE_DESIGN, checkCases, checkConfirmation, checkContext, checkPlan, checkProjectFeatures, checkResults, checkReview, checkRisks, checkTasks
} from './gates.mjs';
import { loadDesign, loadFeatures } from './design.mjs';
import { detectStack } from './detect.mjs';
import { runLayers } from './runner.mjs';
import { summarize } from './verdict.mjs';
import { dictionary } from './i18n.mjs';
import { renderReportHtml, renderSummaryMarkdown } from './render.mjs';
import { buildDiff, chunkParts, collectScope, runCommandCheck, scanFiles } from './review-checks.mjs';
import { mergeReviewChunks, mergeTaskParts } from './merge.mjs';
import { checkMcp } from './mcp.mjs';
import { readdirSync } from 'node:fs';
import { renderCasesReview } from './render-review.mjs';

const now = () => new Date().toISOString();
const MODES = ['full', 'incremental', 'rerun'];
const LANGUAGES = ['zh-TW', 'en'];

const NEXT_ACTION = {
  context: '以 qa-context 收集上下文，完成後執行 qa gate context',
  risk: '以 qa-risk 分析風險，完成後執行 qa gate risk',
  cases: '以 qa-cases 產出測試矩陣、狀態機、原型與 BDD feature，完成後執行 qa gate cases',
  confirm: '請使用者開啟 cases-review.html 審閱；使用者明確同意後才執行 qa confirm --by <名字>',
  scripts: '以 qa-scripts 依序派 planner（實際操作、判定可行性 → qa plan-merge）與 generator（→ qa tasks-merge），完成後執行 qa gate scripts',
  run: '執行 qa run，以 qa-run 分類失敗、派 healer 修復並做防假綠檢查，完成後執行 qa gate run',
  review: '先執行 qa review-checks，再以 qa-code-review 依分塊派獨立 subagent 評分，完成後執行 qa gate review',
  report: '執行 qa report 產生最終報告',
  done: '流程已完成'
};

// ---------- 共用 ----------

const gitRoot = (cwd) => {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};

const loadProject = (cwd) => {
  const root = findRoot(cwd);
  if (!root) throw new QaError('找不到 .qa/config.json，請先在專案根目錄執行 qa init');
  const paths = projectPaths(root);
  const config = readJson(paths.config);
  const errors = validateArtifact('config', config);
  if (errors.length > 0) throw new QaError('.qa/config.json 格式錯誤', errors);
  return { root, paths, config };
};

const loadRun = (cwd) => {
  const project = loadProject(cwd);
  const runId = readCurrentRunId(project.root);
  if (!runId) throw new QaError('沒有進行中的 run，請先執行 qa start');
  const run = runPaths(project.root, runId);
  return { ...project, runId, run, state: readJson(run.state) };
};

const artifact = (ctx, name) => readJsonIfExists(ctx.run.artifact(name));

const rel = (ctx, file) => relative(ctx.root, file) || '.';

const printCheck = (out, { errors, warnings }) => {
  warnings.forEach((w) => out(`⚠ ${w}`));
  errors.forEach((e) => out(`✗ ${e}`));
};

const mergeChecks = (...checks) => ({
  errors: checks.flatMap((c) => c.errors),
  warnings: checks.flatMap((c) => c.warnings)
});

const confirmationStatus = (confirmation, designHash) => {
  if (!confirmation) return 'pending';
  return confirmation.designHash === designHash ? 'confirmed' : 'stale';
};

// 產生確認用的多頁審閱 HTML；設計有錯誤時不產生，避免審閱到殘缺內容。
const renderReview = (ctx, design, warnings = [], stage = ctx.state.stage) => {
  const confirmation = artifact(ctx, 'confirmation');
  writeText(ctx.run.reviewHtml, renderCasesReview({
    runId: ctx.runId,
    context: artifact(ctx, 'context'),
    risks: artifact(ctx, 'risks'),
    loaded: design,
    confirmation,
    confirmationStatus: confirmationStatus(confirmation, design.designHash),
    stage,
    warnings,
    minReviewScore: { ...DEFAULT_CASE_DESIGN, ...ctx.config.caseDesign }.minReviewScore,
    dict: dictionary(ctx.config.language),
    language: ctx.config.language
  }));
  return ctx.run.reviewHtml;
};

const writeDerivedCases = (ctx, design) => writeJson(ctx.run.artifact('cases'), { version: 1, cases: design.cases });

const timestampId = (date = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
};

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

const uniqueRunId = (root, name) => {
  const base = [timestampId(), name ? slug(name) : ''].filter(Boolean).join('-');
  const taken = (id) => existsSync(runPaths(root, id).dir);
  if (!taken(base)) return base;
  return Array.from({ length: 99 }, (_, i) => `${base}-${i + 2}`).find((id) => !taken(id));
};

// ---------- 指令 ----------

export const init = ({ cwd, flags, out }) => {
  const root = gitRoot(cwd) ?? cwd;
  const paths = projectPaths(root);
  if (existsSync(paths.config) && !flags.force) {
    out(`已存在 ${relative(root, paths.config)}，若要重新偵測請加 --force`);
    return 0;
  }
  const language = flags.language ?? 'zh-TW';
  if (!LANGUAGES.includes(language)) throw new QaError(`--language 只支援 ${LANGUAGES.join(', ')}`);

  const { stack, layers, bdd, profiles = [], reviewChecks: detectedChecks = [] } = detectStack(root);
  const dirs = Object.values(layers).map((l) => l.dir).filter(Boolean);
  const config = {
    version: 1,
    language,
    layers,
    repair: {
      maxLoops: 3,
      allowedPaths: dirs.length > 0 ? dirs.map((d) => `${d}/**`) : ['test/**', 'tests/**', 'e2e/**', '**/*.test.*', '**/*.spec.*']
    },
    caseDesign: DEFAULT_CASE_DESIGN,
    ...(profiles.length ? { profiles } : {}),
    ...(bdd ? { bdd } : {}),
    review: { checks: detectedChecks, maxChunkLines: 800 },
    integrations: { issueTracker: '', design: '', database: '' },
    report: { dir: '.qa/reports' }
  };
  writeJson(paths.config, config);
  writeText(join(paths.qa, '.gitignore'), 'runs/\ntmp/\ncurrent\n');

  out(`✓ 已建立 ${relative(root, paths.config)}`);
  out(`偵測到的技術棧：${stack.join(', ') || '（無）'}`);
  const layerNames = Object.keys(layers);
  if (layerNames.length === 0) out('⚠ 沒有偵測到測試指令，請手動填寫 layers.<unit|api|e2e>.command');
  layerNames.forEach((name) => out(`- ${name}：${layers[name].command}${layers[name].junit ? `（JUnit：${layers[name].junit}）` : '（無 JUnit，結果需對照 log 判定）'}`));
  if (detectedChecks.length) out(`代碼審查檢查：${detectedChecks.map((c) => c.command).join('、')}`);
  profiles.forEach((p) => out(`自動化框架：${p.id}（${p.platforms.join('、')}）→ layer ${p.layers.join('、')}，coding style：${p.style}`));
  if (bdd) out(`BDD：${bdd.framework}，feature 目錄 ${bdd.featuresDir}`);
  else out('BDD：未偵測到 BDD 框架；確認後的 .feature 仍會產出，腳本以一般測試實作（需要時可在 config.bdd 設定）');
  out('下一步：請使用者確認上述設定，再執行 qa start --scope "<驗收範圍>"');
  return 0;
};

const COPY_BY_MODE = {
  incremental: ['context', 'risks', 'design'],
  rerun: ['context', 'risks', 'design', 'cases', 'confirmation', 'tasks']
};

export const start = ({ cwd, flags, out }) => {
  const project = loadProject(cwd);
  const mode = flags.mode ?? 'full';
  if (!MODES.includes(mode)) throw new QaError(`--mode 只支援 ${MODES.join(', ')}`);

  const currentId = readCurrentRunId(project.root);
  const currentState = currentId ? readJsonIfExists(runPaths(project.root, currentId).state) : null;
  if (currentState && currentState.stage !== 'done' && !flags.force) {
    throw new QaError(`run ${currentId} 仍在 ${currentState.stage} 階段；用 qa status 查看，或加 --force 另開新 run`);
  }

  const runId = uniqueRunId(project.root, flags.name);
  const run = runPaths(project.root, runId);
  mkdirSync(run.dir, { recursive: true });

  if (mode !== 'full') {
    const sourceId = flags.from ?? currentId;
    if (!sourceId) throw new QaError(`${mode} 模式需要既有的 run，請用 --from <runId> 指定`);
    const source = runPaths(project.root, sourceId);
    COPY_BY_MODE[mode].forEach((name) => {
      if (!existsSync(source.artifact(name))) throw new QaError(`來源 run ${sourceId} 缺少 ${ARTIFACT_FILES[name]}`);
      copyFileSync(source.artifact(name), run.artifact(name));
    });
    if (existsSync(source.designDir)) cpSync(source.designDir, run.designDir, { recursive: true });
    if (mode === 'rerun') {
      const confirmed = checkConfirmation(readJson(run.artifact('confirmation')), loadDesign(run).designHash);
      if (confirmed.errors.length > 0) throw new QaError('來源 run 的用例確認已失效，無法直接重跑', confirmed.errors);
    }
  }

  const stage = mode === 'rerun' ? 'run' : 'context';
  writeJson(run.state, { ...createState({ runId, mode, stage, now: now() }), scope: flags.scope ?? '' });
  writeFileSync(project.paths.current, `${runId}\n`);

  out(`✓ 已建立 run ${runId}（${mode}）`);
  out(`產物目錄：${relative(project.root, run.dir)}`);
  out(`目前階段：${stage}`);
  out(`下一步：${NEXT_ACTION[stage]}`);
  return 0;
};

export const status = ({ cwd, flags, out }) => {
  const ctx = loadRun(cwd);
  const artifacts = Object.fromEntries(Object.keys(ARTIFACT_FILES).map((name) => [name, existsSync(ctx.run.artifact(name))]));
  const info = {
    runId: ctx.runId,
    mode: ctx.state.mode,
    stage: ctx.state.stage,
    scope: ctx.state.scope ?? '',
    runDir: rel(ctx, ctx.run.dir),
    artifacts,
    next: NEXT_ACTION[ctx.state.stage]
  };
  if (flags.json) {
    out(JSON.stringify(info, null, 2));
    return 0;
  }
  out(`Run：${info.runId}（${info.mode}）`);
  if (info.scope) out(`範圍：${info.scope}`);
  out(`階段：${STAGES.map((s) => (s === info.stage ? `[${s}]` : s)).join(' → ')}`);
  out(`產物：${Object.entries(artifacts).map(([k, v]) => `${v ? '✓' : '·'} ${k}`).join('  ')}`);
  out(`產物目錄：${info.runDir}`);
  out(`下一步：${info.next}`);
  return 0;
};

const validateFeatures = (cwd, flags, out) => {
  const ctx = loadRun(cwd);
  const dir = flags.dir ? resolve(cwd, flags.dir) : ctx.run.featuresDir;
  const loaded = flags.dir ? loadFeatures(dir) : loadDesign(ctx.run);
  if (loaded.files.length === 0) {
    out(`✗ ${rel(ctx, dir)} 下沒有任何 .feature 檔`);
    return 1;
  }
  if (loaded.errors.length > 0) {
    loaded.errors.forEach((e) => out(`✗ ${e}`));
    return 1;
  }
  const count = flags.dir ? loaded.scenarios.length : loaded.cases.length;
  out(`✓ ${loaded.files.length} 個 feature、${count} 個 Scenario 格式正確${flags.dir ? '' : '，並與 design.json 的 scenarios 對應'}`);
  return 0;
};

export const validate = ({ cwd, args, flags, out }) => {
  const [name] = args;
  if (name === 'features') return validateFeatures(cwd, flags, out);
  if (!ARTIFACTS.includes(name)) throw new QaError(`用法：qa validate <${[...ARTIFACTS, 'features'].join('|')}> [--file 路徑 | --dir 目錄]`);
  const file = flags.file
    ? resolve(cwd, flags.file)
    : name === 'config' ? loadProject(cwd).paths.config : loadRun(cwd).run.artifact(name);
  const errors = validateArtifact(name, readJson(file));
  if (errors.length > 0) {
    errors.forEach((e) => out(`✗ ${e}`));
    return 1;
  }
  out(`✓ ${name} 格式正確`);
  return 0;
};

const fileExistsIn = (root) => (file) => existsSync(resolve(root, file));

// BDD 專案（config.bdd.featuresDir）：專案內的 feature 必須與確認的內容一致。
// 多個 profile 各有自己的 feature 目錄時，全部合起來比對
const checkBddProject = (ctx, design) => {
  const dirs = [...new Set([ctx.config.bdd?.featuresDir, ...(ctx.config.profiles ?? []).map((p) => p.bdd?.featuresDir)].filter(Boolean))];
  if (dirs.length === 0) return { errors: [], warnings: [] };
  const loaded = dirs.map((dir) => loadFeatures(resolve(ctx.root, dir)));
  const merged = { scenarios: loaded.flatMap((l) => l.scenarios), errors: loaded.flatMap((l) => l.errors) };
  return checkProjectFeatures(merged, design.cases, dirs.join('、'));
};

const GATES = {
  context: (ctx) => checkContext(artifact(ctx, 'context')),
  risk: (ctx) => checkRisks(artifact(ctx, 'risks')),
  cases: (ctx, design) => checkCases(design, artifact(ctx, 'risks'), ctx.config),
  scripts: (ctx, design) => {
    const confirmation = artifact(ctx, 'confirmation');
    const confirmed = checkConfirmation(confirmation, design.designHash);
    if (confirmed.errors.length > 0) return confirmed;
    const plan = checkPlan(artifact(ctx, 'plan'), design.cases, confirmation, fileExistsIn(ctx.root));
    if (plan.errors.length > 0) return plan;
    const tasks = checkTasks(artifact(ctx, 'tasks'), design.cases, confirmation, design.designHash, fileExistsIn(ctx.root), artifact(ctx, 'plan'));
    const unknownLayers = [...new Set((artifact(ctx, 'tasks')?.tasks ?? []).map((t) => t.layer))].filter((l) => !ctx.config.layers?.[l]);
    unknownLayers.forEach((l) => tasks.errors.push(`task 使用的 layer「${l}」沒有在 config.layers 中設定執行指令`));
    return tasks.errors.length > 0 ? mergeChecks(plan, tasks) : mergeChecks(plan, tasks, checkBddProject(ctx, design));
  },
  run: (ctx, design) => mergeChecks(
    checkConfirmation(artifact(ctx, 'confirmation'), design.designHash),
    checkResults(artifact(ctx, 'results'), artifact(ctx, 'tasks'), ctx.config)
  ),
  review: (ctx, design) => mergeChecks(
    checkConfirmation(artifact(ctx, 'confirmation'), design.designHash),
    checkReview(artifact(ctx, 'review'), artifact(ctx, 'review-checks'))
  )
};

export const gate = ({ cwd, args, flags, out }) => {
  const [stage] = args;
  if (stage === 'confirm') throw new QaError('確認階段沒有 gate：使用者明確同意後執行 qa confirm --by <名字>');
  if (stage === 'report') throw new QaError('報告階段請執行 qa report');
  if (!GATES[stage]) throw new QaError(`用法：qa gate <${Object.keys(GATES).join('|')}> [--check]`);

  const ctx = loadRun(cwd);
  if (stage !== ctx.state.stage) {
    throw new QaError(`目前在 ${ctx.state.stage} 階段，不能對 ${stage} 執行 gate。下一步：${NEXT_ACTION[ctx.state.stage]}`);
  }
  const design = ['context', 'risk'].includes(stage) ? null : loadDesign(ctx.run);
  const check = GATES[stage](ctx, design);
  printCheck(out, check);
  if (check.errors.length > 0) {
    out(`✗ ${stage} gate 未通過（${check.errors.length} 個錯誤）`);
    return 1;
  }
  if (stage === 'cases') {
    writeDerivedCases(ctx, design);
    out(`✓ 已產生 ${rel(ctx, renderReview(ctx, design, check.warnings, flags.check ? ctx.state.stage : 'confirm'))}`);
  }
  if (flags.check) {
    out(`✓ ${stage} gate 檢查通過（--check，未推進階段）`);
    return 0;
  }
  const next = advanceState(ctx.state, 'gate', now());
  writeJson(ctx.run.state, next);
  out(`✓ ${stage} gate 通過 → ${next.stage}`);
  out(`下一步：${NEXT_ACTION[next.stage]}`);
  return 0;
};

export const confirm = ({ cwd, flags, out }) => {
  const by = typeof flags.by === 'string' ? flags.by.trim() : '';
  if (!by) throw new QaError('用法：qa confirm --by <確認者> [--note 備註]（只能在使用者明確同意後執行）');
  const ctx = loadRun(cwd);
  if (stageIndex(ctx.state.stage) < stageIndex('confirm')) {
    throw new QaError(`用例 gate 尚未通過（目前在 ${ctx.state.stage} 階段）`);
  }
  const design = loadDesign(ctx.run);
  const check = checkCases(design, artifact(ctx, 'risks'), ctx.config);
  if (check.errors.length > 0) {
    printCheck(out, check);
    throw new QaError('用例設計不符合 gate 條件，不能確認');
  }
  writeDerivedCases(ctx, design);
  writeJson(ctx.run.artifact('confirmation'), {
    version: 1,
    confirmedAt: now(),
    confirmedBy: by,
    ...(flags.note ? { note: String(flags.note) } : {}),
    designHash: design.designHash,
    caseIds: design.cases.map((c) => c.id)
  });
  renderReview(ctx, design, check.warnings, 'scripts');
  writeJson(ctx.run.state, jumpState(ctx.state, 'scripts', `confirm by ${by}`, now()));
  out(`✓ ${by} 已確認 ${design.cases.length} 個情境 → scripts`);
  out(`下一步：${NEXT_ACTION.scripts}`);
  return 0;
};

export const rewind = ({ cwd, args, out }) => {
  const [target] = args;
  if (!target) throw new QaError('用法：qa rewind <stage>');
  const ctx = loadRun(cwd);
  const next = rewindState(ctx.state, target, now());
  writeJson(ctx.run.state, next);
  out(`✓ 已退回 ${target}`);
  if (stageIndex(target) <= stageIndex('cases')) out('⚠ 用例若有修改，需要重新給使用者確認（qa confirm）');
  out(`下一步：${NEXT_ACTION[target]}`);
  return 0;
};

export const run = ({ cwd, flags, out }) => {
  const ctx = loadRun(cwd);
  if (ctx.state.stage !== 'run') {
    throw new QaError(`qa run 只能在 run 階段執行（目前 ${ctx.state.stage}）；需要重跑請先 qa rewind run`);
  }
  const tasks = artifact(ctx, 'tasks');
  const design = loadDesign(ctx.run);
  const ready = checkTasks(tasks, design.cases, artifact(ctx, 'confirmation'), design.designHash, fileExistsIn(ctx.root), artifact(ctx, 'plan'));
  if (ready.errors.length > 0) {
    printCheck(out, ready);
    throw new QaError('tasks 或用例確認狀態不正確，無法執行');
  }

  const previous = artifact(ctx, 'results');
  const maxAttempts = ctx.config.repair.maxLoops + 1;
  if ((previous?.attempts ?? 0) >= maxAttempts && !flags.force) {
    throw new QaError(`已執行 ${previous.attempts} 次，達到上限（repair.maxLoops=${ctx.config.repair.maxLoops}）；如確定要再跑請加 --force`);
  }
  const wanted = typeof flags.layer === 'string' ? flags.layer.split(',').map((s) => s.trim()) : null;
  const layers = [...new Set(tasks.tasks.map((t) => t.layer))].filter((l) => !wanted || wanted.includes(l));
  if (layers.length === 0) throw new QaError('沒有可執行的 layer');

  out(`第 ${(previous?.attempts ?? 0) + 1} 次執行（上限 ${maxAttempts}）`);
  const results = runLayers({
    root: ctx.root, config: ctx.config, tasks: tasks.tasks, previous, layers,
    logsDir: ctx.run.logs, tmpDir: ctx.paths.tmp, log: out
  });
  writeJson(ctx.run.artifact('results'), results);

  const counts = results.results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  out(`結果：${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join('，')}`);
  results.results.filter((r) => r.status !== 'passed')
    .forEach((r) => out(`- ${r.taskId} ${r.status}：${r.reason ?? r.message ?? ''}`));
  out('下一步：失敗或 not-run 的項目需以 qa-run 補上分類/判定，再執行 qa gate run');
  return 0;
};

export const report = ({ cwd, flags, out }) => {
  const ctx = loadRun(cwd);
  if (ctx.state.stage !== 'report' && !flags.force) {
    throw new QaError(`目前在 ${ctx.state.stage} 階段，尚不能產生正式報告（加 --force 可產生未完成報告）`);
  }
  const data = Object.fromEntries(['context', 'risks', 'cases', 'plan', 'tasks', 'results', 'review'].map((n) => [n, artifact(ctx, n)]));
  data.reviewChecks = artifact(ctx, 'review-checks');
  const summary = summarize(data);
  const dict = dictionary(ctx.config.language);
  const finalState = ctx.state.stage === 'report' ? advanceState(ctx.state, 'report', now()) : ctx.state;

  const reviewUrl = existsSync(ctx.run.reviewHtml) ? pathToFileURL(ctx.run.reviewHtml).href : null;
  writeText(ctx.run.reportHtml, renderReportHtml({ ...data, state: finalState, summary, reviewUrl, dict, language: ctx.config.language }));
  writeText(ctx.run.summaryMd, renderSummaryMarkdown({ state: finalState, summary, dict }));
  const reportDir = resolve(ctx.root, ctx.config.report.dir);
  mkdirSync(reportDir, { recursive: true });
  copyFileSync(ctx.run.reportHtml, join(reportDir, `${ctx.runId}.html`));
  copyFileSync(ctx.run.reportHtml, join(reportDir, 'latest.html'));
  writeJson(ctx.run.state, finalState);

  out(`結論：${dict.verdict[summary.verdict]}`);
  summary.reasons.forEach((r) => out(`- ${r}`));
  out(`報告：${rel(ctx, ctx.run.reportHtml)}`);
  out(`摘要：${rel(ctx, ctx.run.summaryMd)}`);
  return 0;
};

// 代碼審查的確定性檢查：不耗用模型 context，只輸出精簡結果；完整 log 與 diff 存檔供審查 subagent 分塊讀取
export const reviewChecks = ({ cwd, out }) => {
  const ctx = loadRun(cwd);
  if (ctx.state.stage !== 'review') throw new QaError(`qa review-checks 只能在 review 階段執行（目前 ${ctx.state.stage}）`);
  const design = loadDesign(ctx.run);
  const tasks = artifact(ctx, 'tasks');
  const checkDir = join(ctx.run.dir, 'review');

  const confirmed = checkConfirmation(artifact(ctx, 'confirmation'), design.designHash);
  const bdd = checkBddProject(ctx, design);
  const featureErrors = [...confirmed.errors, ...bdd.errors];
  const featureCheck = {
    name: 'features',
    status: featureErrors.length === 0 ? 'pass' : 'fail',
    ...(featureErrors.length ? { detail: featureErrors.slice(0, 10).join('\n') } : {})
  };
  const commandChecks = (ctx.config.review?.checks ?? []).map((check, i) =>
    runCommandCheck(ctx.root, check, join(checkDir, `check-${i + 1}.log`), writeText));

  const scope = collectScope({ root: ctx.root, config: ctx.config, tasks, context: artifact(ctx, 'context') });
  const hits = scanFiles(ctx.root, scope.tests);
  const failHits = hits.filter((h) => h.level === 'fail');
  const scanCheck = {
    name: 'coding-style-scan',
    status: failHits.length ? 'fail' : 'pass',
    ...(hits.length ? { detail: `${failHits.length} 個 fail、${hits.length - failHits.length} 個 warn` } : {})
  };

  const parts = buildDiff(ctx.root, [...scope.tests, ...scope.products]);
  const diffFile = join(checkDir, 'review.diff');
  writeText(diffFile, parts.map((p) => p.text).join('\n'));
  const lineCount = new Map(parts.map((p) => [p.file, p.lines]));
  // 每塊寫成獨立的 diff 檔，並附上相關的 feature（從 tasks 反查），審查 subagent 只需要讀這些
  const featuresOf = (files) => [...new Set((tasks?.tasks ?? [])
    .filter((t) => files.includes(t.file))
    .map((t) => design.cases.find((c) => c.id === t.caseId)?.file)
    .filter(Boolean))].map((f) => `${rel(ctx, ctx.run.featuresDir)}/${f}`);
  const chunks = chunkParts(parts, ctx.config.review?.maxChunkLines).map((chunk, i) => {
    const file = join(checkDir, `chunk-${i + 1}.diff`);
    writeText(file, chunk.parts.map((p) => p.text).join('\n'));
    const files = [...new Set(chunk.parts.map((p) => p.file))];
    return { id: i + 1, diffFile: rel(ctx, file), lines: chunk.lines, files, features: featuresOf(files) };
  });
  const checks = [featureCheck, scanCheck, ...commandChecks];
  const record = {
    version: 1,
    ranAt: now(),
    passed: checks.every((c) => c.status !== 'fail'),
    checks,
    scan: { files: scope.tests, hits },
    scope: {
      files: [
        ...scope.tests.map((path) => ({ path, kind: 'test', lines: lineCount.get(path) ?? 0 })),
        ...scope.products.map((path) => ({ path, kind: 'product', lines: lineCount.get(path) ?? 0 }))
      ],
      diffFile: rel(ctx, diffFile),
      diffLines: parts.reduce((n, p) => n + p.lines, 0),
      chunks
    }
  };
  writeJson(ctx.run.artifact('review-checks'), record);

  checks.forEach((c) => out(`${c.status === 'pass' ? '✓' : c.status === 'skip' ? '·' : '✗'} ${c.name}${c.detail ? `：${c.detail.split('\n')[0]}` : ''}`));
  failHits.slice(0, 10).forEach((h) => out(`  - ${h.file}:${h.line} ${h.text}`));
  out(`審查範圍：測試檔 ${scope.tests.length} 個、產品檔 ${scope.products.length} 個，diff ${record.scope.diffLines} 行，分成 ${record.scope.chunks.length} 塊`);
  out(`checksHash：${canonicalHash(record)}（寫入 review.json 的 checksHash）`);
  out(record.passed ? '✓ 確定性檢查全部通過' : '✗ 確定性檢查未通過：代碼審查結論必須是 BLOCK');
  return 0;
};

const readValidated = (name, file) => {
  const value = readJson(file);
  const errors = validateArtifact(name, value);
  if (errors.length > 0) throw new QaError(`${relative(process.cwd(), file)} 格式錯誤`, errors);
  return value;
};

// 列出尚未完成的分塊（中斷後只需要補審這些）；全部完成才合併成 review.json
export const reviewMerge = ({ cwd, flags, out }) => {
  const ctx = loadRun(cwd);
  const checks = artifact(ctx, 'review-checks');
  if (!checks) throw new QaError('尚未執行 qa review-checks');
  const checksHash = canonicalHash(checks);
  const dir = join(ctx.run.dir, 'review');
  const status = checks.scope.chunks.map((chunk) => {
    const file = join(dir, `chunk-${chunk.id}.json`);
    if (!existsSync(file)) return { chunk, state: 'missing' };
    const value = readValidated('review-chunk', file);
    return { chunk, value, state: value.checksHash === checksHash && value.chunk === chunk.id ? 'done' : 'stale' };
  });
  const pending = status.filter((s) => s.state !== 'done');
  if (flags.pending || pending.length > 0) {
    out(`分塊：共 ${status.length}，完成 ${status.length - pending.length}`);
    pending.forEach((s) => out(`- 待審 chunk ${s.chunk.id}（${s.state === 'stale' ? '確定性檢查已重跑，需要重審' : '尚未審查'}）：${s.chunk.diffFile}`));
    if (pending.length > 0) return flags.pending ? 0 : 1;
  }
  const review = mergeReviewChunks({ chunks: status.map((s) => s.value), checks, checksHash, summary: flags.summary });
  writeJson(ctx.run.artifact('review'), review);
  out(`✓ 已合併 ${status.length} 塊 → review.json：${review.verdict} ${review.score}/100，問題 ${review.findings.length} 個`);
  return 0;
};

// 合併 planner 並行產生的 plan/<feature>.json；列出可行性統計與不可行的情境
export const planMerge = ({ cwd, out }) => {
  const ctx = loadRun(cwd);
  const confirmation = artifact(ctx, 'confirmation');
  if (!confirmation) throw new QaError('用例尚未確認');
  const dir = join(ctx.run.dir, 'plan');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  if (files.length === 0) throw new QaError(`${rel(ctx, dir)} 下沒有任何計畫分檔`);
  const parts = files.map((f) => readValidated('plan-part', join(dir, f)));
  const entries = [...parts].sort((a, b) => a.feature.localeCompare(b.feature)).flatMap((p) => p.entries);
  writeJson(ctx.run.artifact('plan'), { version: 1, designHash: confirmation.designHash, entries });
  const count = (f) => entries.filter((e) => e.feasibility === f).length;
  out(`✓ 已合併 ${parts.length} 個計畫分檔 → plan.json：可自動化 ${count('AUTOMATABLE')}、需要 API 建資料 ${count('NEEDS_API_SETUP')}、無法自動化 ${count('NOT_FEASIBLE')}`);
  entries.filter((e) => e.feasibility === 'NOT_FEASIBLE').forEach((e) => out(`- ${e.caseId} 無法自動化：${e.reason}`));
  return 0;
};

// 合併並行產生的 tasks/<feature>.json；共用檔案的修改需求列出來，交由整合步驟處理
export const tasksMerge = ({ cwd, out }) => {
  const ctx = loadRun(cwd);
  const confirmation = artifact(ctx, 'confirmation');
  if (!confirmation) throw new QaError('用例尚未確認');
  const dir = join(ctx.run.dir, 'tasks');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  if (files.length === 0) throw new QaError(`${rel(ctx, dir)} 下沒有任何 tasks 分檔`);
  const parts = files.map((f) => readValidated('tasks-part', join(dir, f)));
  const { tasks, sharedRequests } = mergeTaskParts({ parts, designHash: confirmation.designHash });
  writeJson(ctx.run.artifact('tasks'), tasks);
  out(`✓ 已合併 ${parts.length} 個分檔 → tasks.json（${tasks.tasks.length} 個 task）`);
  sharedRequests.forEach((r) => out(`- 共用檔案修改需求：${r}`));
  return 0;
};

export const renderReviewCommand = ({ cwd, out }) => {
  const ctx = loadRun(cwd);
  const design = loadDesign(ctx.run);
  const check = checkCases(design, artifact(ctx, 'risks'), ctx.config);
  if (check.errors.length > 0) {
    printCheck(out, check);
    throw new QaError('用例設計有錯誤，無法產生審閱頁');
  }
  out(`✓ 已產生 ${rel(ctx, renderReview(ctx, design, check.warnings))}`);
  return 0;
};

const EXTRA_PATHS = {
  'design-dir': (run) => run.designDir,
  features: (run) => run.featuresDir,
  'review-page': (run) => run.reviewHtml,
  logs: (run) => run.logs
};

export const path = ({ cwd, args, out }) => {
  const [name] = args;
  const ctx = loadRun(cwd);
  if (!name) out(ctx.run.dir);
  else if (ARTIFACT_FILES[name]) out(ctx.run.artifact(name));
  else if (EXTRA_PATHS[name]) out(EXTRA_PATHS[name](ctx.run));
  else throw new QaError(`用法：qa path [${[...Object.keys(ARTIFACT_FILES), ...Object.keys(EXTRA_PATHS)].join('|')}]`);
  return 0;
};

const commandExists = (command) => {
  const bin = command.trim().split(/\s+/)[0];
  if (process.platform === 'win32' || bin.startsWith('.') || bin.includes('=')) return true;
  return spawnSync('sh', ['-c', `command -v "${bin}"`], { encoding: 'utf8' }).status === 0;
};

export const doctor = ({ cwd, out }) => {
  const checks = [];
  const add = (ok, message) => checks.push({ level: ok ? 'ok' : 'fail', message });
  const warn = (message) => checks.push({ level: 'warn', message });

  const major = Number(process.versions.node.split('.')[0]);
  add(major >= 20, `Node.js ${process.versions.node}（需要 >= 20）`);

  const root = findRoot(cwd);
  add(Boolean(root), root ? `專案根目錄：${root}` : '找不到 .qa/config.json（請執行 qa init）');
  if (root) {
    const config = readJsonIfExists(projectPaths(root).config);
    const configErrors = validateArtifact('config', config);
    add(configErrors.length === 0, configErrors.length === 0 ? 'config.json 格式正確' : `config.json：${configErrors.join('；')}`);
    Object.entries(config?.layers ?? {}).forEach(([name, layer]) => {
      if (!layer.command?.trim()) return add(false, `layers.${name}.command 是空的`);
      add(commandExists(layer.command), `layers.${name}：${layer.command}`);
      if (!layer.junit) warn(`layers.${name} 沒有設定 junit，結果需對照 log 判定`);
    });
    const runId = readCurrentRunId(root);
    const platform = runId ? readJsonIfExists(runPaths(root, runId).artifact('design'))?.prototype?.platform : undefined;
    checkMcp({ root, platform, config }).forEach((tool) => {
      if (tool.configured) add(true, `${tool.label} 已設定（腳本生成的 planner 與 healer 會實際操作畫面）`);
      else add(false, `${tool.label} 尚未設定：腳本生成需要它實際操作畫面，不會用猜的。設定方式：${tool.setup}；設定後重新啟動 Claude Code`);
    });
    if (runId) {
      const run = runPaths(root, runId);
      const state = readJsonIfExists(run.state);
      add(Boolean(state), state ? `目前 run：${runId}（${state.stage}）` : `run ${runId} 缺少 state.json`);
      const confirmation = readJsonIfExists(run.artifact('confirmation'));
      if (confirmation) {
        const c = checkConfirmation(confirmation, loadDesign(run).designHash);
        add(c.errors.length === 0, c.errors.length === 0 ? '用例確認紀錄有效' : c.errors.join('；'));
      }
    }
  }
  const icon = { ok: '✓', warn: '⚠', fail: '✗' };
  checks.forEach((c) => out(`${icon[c.level]} ${c.message}`));
  return checks.some((c) => c.level === 'fail') ? 1 : 0;
};
