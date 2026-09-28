// 零依賴的 JSON Schema 子集驗證器：
// type、required、properties、items、enum、const、minItems、minLength、pattern、minimum、maximum、本地 $ref。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCHEMA_DIR = new URL('../schemas/', import.meta.url);

const typeOf = (v) => {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
};

const matchesType = (value, type) => {
  const actual = typeOf(value);
  return [].concat(type).some((t) => t === actual || (t === 'number' && actual === 'integer'));
};

const resolveRef = (root, ref) => {
  if (!ref.startsWith('#/')) throw new Error(`只支援本地 $ref：${ref}`);
  return ref.slice(2).split('/').reduce((node, key) => node?.[key], root);
};

const validateNode = (root, schema, value, path) => {
  if (schema.$ref) return validateNode(root, resolveRef(root, schema.$ref), value, path);
  if ('const' in schema && value !== schema.const) {
    return [`${path}：必須是 ${JSON.stringify(schema.const)}`];
  }
  if (schema.enum && !schema.enum.includes(value)) {
    return [`${path}：必須是 ${schema.enum.join(' | ')} 之一，實際為 ${JSON.stringify(value)}`];
  }
  if (schema.type && !matchesType(value, schema.type)) {
    return [`${path}：型別應為 ${[].concat(schema.type).join('|')}，實際為 ${typeOf(value)}`];
  }

  const errors = [];
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) {
      errors.push(`${path}：不可為空字串`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}：格式不符 ${schema.pattern}，實際為 ${JSON.stringify(value)}`);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}：不可小於 ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}：不可大於 ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}：至少需要 ${schema.minItems} 項`);
    }
    if (schema.items) {
      value.forEach((item, i) => errors.push(...validateNode(root, schema.items, item, `${path}[${i}]`)));
    }
  }
  if (typeOf(value) === 'object') {
    (schema.required ?? [])
      .filter((key) => !(key in value))
      .forEach((key) => errors.push(`${path}：缺少必填欄位 ${key}`));
    Object.entries(schema.properties ?? {})
      .filter(([key]) => key in value)
      .forEach(([key, sub]) => errors.push(...validateNode(root, sub, value[key], `${path}.${key}`)));
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      Object.keys(value).filter((key) => !(key in (schema.properties ?? {})))
        .forEach((key) => errors.push(...validateNode(root, schema.additionalProperties, value[key], `${path}.${key}`)));
    }
  }
  return errors;
};

export const validate = (schema, value, path = '$') => validateNode(schema, schema, value, path);

const cache = new Map();

export const loadSchema = (name) => {
  if (!cache.has(name)) {
    const file = fileURLToPath(new URL(`${name}.schema.json`, SCHEMA_DIR));
    cache.set(name, JSON.parse(readFileSync(file, 'utf8')));
  }
  return cache.get(name);
};

export const ARTIFACTS = ['context', 'risks', 'design', 'cases', 'confirmation', 'plan-part', 'plan', 'tasks', 'tasks-part', 'results', 'review-checks', 'review-chunk', 'review', 'config'];

export const validateArtifact = (name, value) => validate(loadSchema(name), value);
