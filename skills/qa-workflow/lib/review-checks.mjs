// 代碼審查的確定性部分：靜態掃描、設定的檢查指令、審查範圍與 diff 分塊。
// 全部在 CLI 內完成，不耗用模型的 context；模型只讀取精簡的結果與分塊後的 diff。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// 與 qa-scripts/references/coding-style.md 的禁止清單對應；fail 會讓確定性檢查失敗
export const SCAN_RULES = [
  { rule: 'fixed-wait', level: 'fail', pattern: /\bwaitForTimeout\s*\(|\bsleep\s*\(\s*\d|time\.sleep\s*\(/, text: '固定秒數等待' },
  { rule: 'focused-test', level: 'fail', pattern: /\b(?:it|test|describe)\.only\s*\(|\bfit\s*\(|\bfdescribe\s*\(/, text: '只跑單一測試（.only）' },
  { rule: 'skipped-test', level: 'fail', pattern: /\b(?:it|test|describe)\.skip\s*\(|\bxit\s*\(|\bxdescribe\s*\(|@pytest\.mark\.skip\b/, text: '被跳過的測試' },
  { rule: 'console-log', level: 'warn', pattern: /\bconsole\.(?:log|debug)\s*\(|^\s*print\s*\(/, text: '使用 console.log／print，應改用 logger' },
  { rule: 'implicit-pause', level: 'fail', pattern: /\bbrowser\.pause\s*\(|\bdriver\.implicitly_wait\s*\(/, text: '固定秒數等待（pause／implicitly_wait）' },
  { rule: 'structural-selector', level: 'warn', pattern: /xpath=|["'`]\/\/[a-z*]|:nth-child\(|\.nth\(\d+\)/i, text: '結構性 selector（XPath、nth-child、索引）' },
  { rule: 'hardcoded-secret', level: 'fail', pattern: /(?:password|passwd|token|secret|api[_-]?key)\s*[:=]\s*["'`][^"'`$\s]{6,}["'`]/i, text: '疑似寫死的密碼或 token' }
];

const DEFAULT_CHUNK_LINES = 800;

const git = (root, args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : '';
};

const globToRegex = (glob) => new RegExp(`^${glob
  .replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*\/?/g, '\u0000')
  .replace(/\*/g, '[^/]*')
  .replace(/\?/g, '[^/]')
  .replace(/\u0000/g, '.*')}$`);

const changedFiles = (root) => [...new Set([
  ...git(root, ['diff', '--name-only', 'HEAD']).split('\n'),
  ...git(root, ['ls-files', '--others', '--exclude-standard']).split('\n')
].map((f) => f.trim()).filter(Boolean))];

// 審查範圍：本次產生或修改的測試檔 + context 中列出的產品變更檔
export const collectScope = ({ root, config, tasks, context }) => {
  const allowed = (config.repair?.allowedPaths ?? []).map(globToRegex);
  const isTestPath = (file) => allowed.some((re) => re.test(file));
  const fromTasks = (tasks?.tasks ?? []).map((t) => t.file);
  const tests = [...new Set([...fromTasks, ...changedFiles(root).filter(isTestPath)])]
    .filter((f) => existsSync(join(root, f)) && statSync(join(root, f)).isFile());
  const products = [...new Set((context?.changes ?? []).filter((c) => c.kind !== 'deleted').map((c) => c.path))]
    .filter((f) => !tests.includes(f) && existsSync(join(root, f)));
  return { tests, products };
};

export const scanFiles = (root, files) => files.flatMap((file) => {
  const lines = readFileSync(join(root, file), 'utf8').split('\n');
  return lines.flatMap((text, i) => SCAN_RULES
    .filter((r) => r.pattern.test(text))
    .map((r) => ({ rule: r.rule, level: r.level, file, line: i + 1, text: `${r.text}：${text.trim().slice(0, 120)}` })));
});

// 產生審查用 diff：已追蹤的檔案只取變更片段（-U3），新檔案取全文；依行數切成分塊，交給不同的審查 subagent
export const buildDiff = (root, files) => {
  const tracked = new Set(git(root, ['ls-files', '--', ...files]).split('\n').filter(Boolean));
  const parts = files.map((file) => {
    const text = tracked.has(file)
      ? git(root, ['diff', '--no-color', '-U3', 'HEAD', '--', file])
      : `--- /dev/null\n+++ b/${file}\n${readFileSync(join(root, file), 'utf8').split('\n').map((l) => `+${l}`).join('\n')}\n`;
    return { file, text, lines: text ? text.split('\n').length : 0 };
  }).filter((p) => p.lines > 0);
  return parts;
};

// 超過上限的單一檔案：先依 hunk（@@）切，單一 hunk 仍太長（例如整個新檔）再依行數切
export const splitLargePart = (part, maxLines = DEFAULT_CHUNK_LINES) => {
  if (part.lines <= maxLines) return [part];
  const lines = part.text.split('\n');
  const header = lines.slice(0, lines.findIndex((l) => l.startsWith('@@')) >= 0 ? lines.findIndex((l) => l.startsWith('@@')) : 2);
  const body = lines.slice(header.length);
  const hunks = body.reduce((acc, line) => {
    if (line.startsWith('@@') || acc.length === 0) return [...acc, [line]];
    return [...acc.slice(0, -1), [...acc.at(-1), line]];
  }, []);
  const windows = hunks.flatMap((hunk) => (hunk.length <= maxLines - header.length
    ? [hunk]
    : Array.from({ length: Math.ceil(hunk.length / (maxLines - header.length)) },
      (_, i) => hunk.slice(i * (maxLines - header.length), (i + 1) * (maxLines - header.length)))));
  const groups = windows.reduce((acc, win) => {
    const last = acc.at(-1);
    if (last && last.length + win.length + header.length <= maxLines) return [...acc.slice(0, -1), [...last, ...win]];
    return [...acc, win];
  }, []);
  return groups.map((group, i) => {
    const text = [...header, `# 片段 ${i + 1}/${groups.length}`, ...group].join('\n');
    return { file: part.file, segment: `${i + 1}/${groups.length}`, text, lines: text.split('\n').length };
  });
};

// 依行數上限把 diff 片段裝箱成分塊；每塊之後會寫成獨立的 diff 檔，交給一個審查 subagent
export const chunkParts = (parts, maxLines = DEFAULT_CHUNK_LINES) => parts
  .flatMap((part) => splitLargePart(part, maxLines))
  .reduce((chunks, part) => {
    const last = chunks.at(-1);
    if (last && last.lines + part.lines <= maxLines) return [...chunks.slice(0, -1), { parts: [...last.parts, part], lines: last.lines + part.lines }];
    return [...chunks, { parts: [part], lines: part.lines }];
  }, []);

const tail = (text, lines = 40) => text.split('\n').slice(-lines).join('\n');

export const runCommandCheck = (root, check, logFile, writeLog) => {
  const r = spawnSync(check.command, {
    cwd: root, shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: (check.timeoutSec ?? 600) * 1000
  });
  writeLog(logFile, `$ ${check.command}\nexit: ${r.status}\n----- stdout -----\n${r.stdout ?? ''}\n----- stderr -----\n${r.stderr ?? ''}`);
  const ok = r.status === 0;
  return {
    name: check.name,
    command: check.command,
    status: ok ? 'pass' : 'fail',
    // 失敗時只保留最後 40 行，完整內容在 log 檔
    ...(ok ? {} : { detail: tail(`${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim()) || `exit ${r.status}` }),
    log: relative(root, logFile)
  };
};

export const resolveRoot = (root, file) => resolve(root, file);
