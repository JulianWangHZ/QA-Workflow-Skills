import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const QA_DIR = '.qa';

export const ARTIFACT_FILES = {
  context: 'context.json',
  risks: 'risks.json',
  design: 'design.json',
  cases: 'cases.json',
  confirmation: 'confirmation.json',
  plan: 'plan.json',
  tasks: 'tasks.json',
  results: 'results.json',
  'review-checks': 'review-checks.json',
  review: 'review.json'
};

// 從 start 往上找含 .qa/config.json 的目錄；找不到回傳 null。
export const findRoot = (start = process.cwd()) => {
  const dir = resolve(start);
  if (existsSync(join(dir, QA_DIR, 'config.json'))) return dir;
  const parent = dirname(dir);
  return parent === dir ? null : findRoot(parent);
};

export const projectPaths = (root) => {
  const qa = join(root, QA_DIR);
  return {
    root,
    qa,
    config: join(qa, 'config.json'),
    current: join(qa, 'current'),
    runs: join(qa, 'runs'),
    tmp: join(qa, 'tmp')
  };
};

export const runPaths = (root, runId) => {
  const dir = join(projectPaths(root).runs, runId);
  return {
    dir,
    state: join(dir, 'state.json'),
    logs: join(dir, 'logs'),
    designDir: join(dir, 'design'),
    featuresDir: join(dir, 'design', 'features'),
    reviewHtml: join(dir, 'cases-review.html'),
    reportHtml: join(dir, 'report.html'),
    summaryMd: join(dir, 'summary.md'),
    artifact: (name) => join(dir, ARTIFACT_FILES[name])
  };
};

export const readCurrentRunId = (root) => {
  const file = projectPaths(root).current;
  return existsSync(file) ? readFileSync(file, 'utf8').trim() || null : null;
};
