#!/usr/bin/env node
// qa-workflow CLI：負責產物驗證、階段 gate、測試執行與報告渲染。判斷類工作交給各 skill。
import { QaError } from '../lib/io.mjs';
import * as commands from '../lib/commands.mjs';

const HELP = `qa-workflow CLI

用法：node <skill 目錄>/bin/qa.mjs <指令> [參數]

  init [--force] [--language zh-TW|en]   偵測技術棧並建立 .qa/config.json
  start [--scope 文字] [--mode full|incremental|rerun] [--from runId] [--name 名稱] [--force]
                                         開始新的 run
  status [--json]                        目前 run 的階段、產物與下一步
  validate <artifact|features> [--file 路徑] [--dir 目錄]
                                         只做格式驗證，不推進階段
  gate <stage> [--check]                 檢查放行條件，通過後推進到下一階段
  confirm --by <確認者> [--note 備註]    記錄使用者已確認用例（只能在使用者明確同意後執行）
  rewind <stage>                         退回到較早的階段
  run [--layer unit,api,e2e] [--force]   執行測試並寫入 results.json
  review-checks                          代碼審查的確定性檢查（靜態掃描、檢查指令、審查範圍與 diff 分塊）
  review-merge [--pending] [--summary 文字]
                                         合併各分塊的審查結果成 review.json；--pending 只列出待審分塊
  plan-merge                             合併 planner 產生的 plan/<feature>.json 成 plan.json
  tasks-merge                            合併並行產生的 tasks/<feature>.json 成 tasks.json
  report [--force]                       產生 report.html 與 summary.md
  render-review                          重新產生 cases-review.html
  path [artifact|design-dir|features|review-page|logs]
                                         印出 run 目錄或產物的絕對路徑
  doctor                                 檢查環境與設定
`;

const BOOLEAN_FLAGS = new Set(['force', 'check', 'json', 'help']);

const parseArgs = (argv) => argv.reduce((acc, token, i) => {
  if (acc.skip.has(i)) return acc;
  if (!token.startsWith('--')) return { ...acc, args: [...acc.args, token] };
  const key = token.slice(2);
  const value = argv[i + 1];
  if (BOOLEAN_FLAGS.has(key) || value === undefined || value.startsWith('--')) {
    return { ...acc, flags: { ...acc.flags, [key]: true } };
  }
  return { ...acc, flags: { ...acc.flags, [key]: value }, skip: new Set([...acc.skip, i + 1]) };
}, { args: [], flags: {}, skip: new Set() });

const COMMANDS = {
  init: commands.init,
  start: commands.start,
  status: commands.status,
  validate: commands.validate,
  gate: commands.gate,
  confirm: commands.confirm,
  rewind: commands.rewind,
  run: commands.run,
  report: commands.report,
  'review-checks': commands.reviewChecks,
  'review-merge': commands.reviewMerge,
  'tasks-merge': commands.tasksMerge,
  'plan-merge': commands.planMerge,
  'render-review': commands.renderReviewCommand,
  path: commands.path,
  doctor: commands.doctor
};

const main = (argv) => {
  const [name, ...rest] = argv;
  if (!name || name === 'help' || name === '--help') {
    console.log(HELP);
    return name ? 0 : 2;
  }
  const command = COMMANDS[name];
  if (!command) {
    console.error(`未知的指令：${name}\n\n${HELP}`);
    return 2;
  }
  const { args, flags } = parseArgs(rest);
  try {
    return command({ cwd: process.cwd(), args, flags, out: (line) => console.log(line) });
  } catch (err) {
    if (!(err instanceof QaError)) throw err;
    console.error(`✗ ${err.message}`);
    err.details.forEach((d) => console.error(`  - ${d}`));
    return 1;
  }
};

process.exitCode = main(process.argv.slice(2));
