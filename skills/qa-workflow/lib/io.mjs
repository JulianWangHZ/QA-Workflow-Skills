import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

export class QaError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'QaError';
    this.details = details;
  }
}

export const readJson = (file) => {
  if (!existsSync(file)) throw new QaError(`找不到檔案：${file}`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new QaError(`JSON 解析失敗：${file}（${err.message}）`);
  }
};

export const readJsonIfExists = (file) => (existsSync(file) ? readJson(file) : null);

// 先寫暫存檔再 rename，避免中斷時留下半個檔案。
export const writeText = (file, text) => {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
};

export const writeJson = (file, data) => writeText(file, `${JSON.stringify(data, null, 2)}\n`);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonicalize(value[k])]));
  }
  return value;
};

// 與格式、key 順序無關的內容 hash，用來判斷用例是否在確認後被修改。
export const canonicalHash = (value) =>
  createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
