// 依 config.layers 執行測試指令，保存 log，並用 JUnit 結果對應回 task。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { writeText } from './io.mjs';
import { parseJunit, matchTask } from './junit.mjs';

const MAX_BUFFER = 512 * 1024 * 1024;
const DEFAULT_TIMEOUT_SEC = 1800;

// 只讀取本次執行開始後才寫出的 XML，避免拿到上一次殘留的報告。
const freshJunitFiles = (root, junitPath, since) => {
  const abs = isAbsolute(junitPath) ? junitPath : join(root, junitPath);
  if (!existsSync(abs)) return [];
  const files = statSync(abs).isDirectory()
    ? readdirSync(abs).filter((f) => f.endsWith('.xml')).map((f) => join(abs, f))
    : [abs];
  return files.filter((f) => statSync(f).mtimeMs >= since - 1000);
};

const executeLayer = ({ root, layer, layerConfig, attempt, logsDir }) => {
  const started = Date.now();
  const proc = spawnSync(layerConfig.command, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    timeout: (layerConfig.timeoutSec ?? DEFAULT_TIMEOUT_SEC) * 1000,
    env: { ...process.env, ...layerConfig.env }
  });
  const durationMs = Date.now() - started;
  const log = join(logsDir, `attempt-${attempt}-${layer}.log`);
  const timedOut = proc.error?.code === 'ETIMEDOUT';
  writeText(log, [
    `$ ${layerConfig.command}`,
    `exit: ${proc.status}${timedOut ? '（逾時）' : ''}  duration: ${durationMs}ms`,
    proc.error && !timedOut ? `spawn error: ${proc.error.message}` : '',
    '----- stdout -----',
    proc.stdout ?? '',
    '----- stderr -----',
    proc.stderr ?? ''
  ].join('\n'));

  const junitFiles = layerConfig.junit ? freshJunitFiles(root, layerConfig.junit, started) : [];
  const testcases = junitFiles.flatMap((f) => parseJunit(readFileSync(f, 'utf8')));
  return {
    execution: {
      attempt,
      layer,
      command: layerConfig.command,
      exitCode: proc.status,
      durationMs,
      log: relative(root, log),
      junit: junitFiles.length > 0 ? junitFiles.map((f) => relative(root, f)).join(', ') : null
    },
    testcases,
    hasJunit: junitFiles.length > 0,
    timedOut
  };
};

const notRun = (taskId, reason, evidence = []) => ({ taskId, status: 'not-run', reason, evidence });

const resultsForLayer = (tasks, outcome) => tasks.map((task) => {
  const evidence = [outcome.execution.log];
  if (outcome.timedOut) return notRun(task.id, '測試指令逾時，請檢查 log 或調高 timeoutSec', evidence);
  if (!outcome.hasJunit) {
    return notRun(task.id, `沒有取得 JUnit 報告（exit ${outcome.execution.exitCode}），請對照 log 判定結果`, evidence);
  }
  const hit = matchTask(task, outcome.testcases);
  if (!hit) return notRun(task.id, `JUnit 報告中找不到名稱包含「${task.testName}」的測試`, evidence);
  return {
    taskId: task.id,
    status: hit.status,
    durationMs: hit.durationMs,
    ...(hit.message ? { message: hit.message } : {}),
    evidence
  };
});

// 回傳新的 results 物件；沒有執行到的 layer 保留上一次的結果。
export const runLayers = ({ root, config, tasks, previous, layers, logsDir, tmpDir, log = () => {} }) => {
  mkdirSync(tmpDir, { recursive: true });
  const attempt = (previous?.attempts ?? 0) + 1;
  const outcomes = layers.map((layer) => {
    const layerTasks = tasks.filter((t) => t.layer === layer);
    const layerConfig = config.layers?.[layer];
    if (!layerConfig?.command?.trim()) {
      log(`- ${layer}：未設定 config.layers.${layer}.command，略過`);
      return { execution: null, results: layerTasks.map((t) => notRun(t.id, `config.layers.${layer}.command 未設定`)) };
    }
    log(`- ${layer}：${layerConfig.command}`);
    const outcome = executeLayer({ root, layer, layerConfig, attempt, logsDir });
    log(`  exit ${outcome.execution.exitCode}，log：${outcome.execution.log}`);
    return { execution: outcome.execution, results: resultsForLayer(layerTasks, outcome) };
  });

  const fresh = new Map(outcomes.flatMap((o) => o.results).map((r) => [r.taskId, r]));
  const previousById = new Map((previous?.results ?? []).map((r) => [r.taskId, r]));
  return {
    version: 1,
    attempts: attempt,
    executions: [...(previous?.executions ?? []), ...outcomes.map((o) => o.execution).filter(Boolean)],
    results: tasks.map((t) => fresh.get(t.id) ?? previousById.get(t.id) ?? notRun(t.id, '本次未執行此 layer')),
    repairs: previous?.repairs ?? []
  };
};
