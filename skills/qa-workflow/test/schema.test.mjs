import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, validateArtifact } from '../lib/schema.mjs';
import * as fx from './fixtures.mjs';

test('type、required、enum、pattern、minItems 皆會回報錯誤', () => {
  const schema = {
    type: 'object',
    required: ['id', 'list'],
    properties: {
      id: { type: 'string', pattern: '^A-\\d+$' },
      level: { enum: ['x', 'y'] },
      list: { type: 'array', minItems: 1, items: { type: 'integer' } }
    }
  };
  assert.deepEqual(validate(schema, { id: 'A-1', list: [1] }), []);
  const errors = validate(schema, { id: 'B', level: 'z', list: [] });
  assert.equal(errors.length, 3);
  assert.ok(errors.some((e) => e.includes('$.id')));
  assert.ok(errors.some((e) => e.includes('$.level')));
  assert.ok(errors.some((e) => e.includes('$.list')));
  assert.match(validate(schema, {})[0], /缺少必填欄位/);
});

test('支援本地 $ref 與 const', () => {
  const schema = {
    $defs: { n: { type: 'integer', minimum: 1 } },
    type: 'object',
    properties: { a: { $ref: '#/$defs/n' }, v: { const: 1 } }
  };
  assert.deepEqual(validate(schema, { a: 2, v: 1 }), []);
  assert.equal(validate(schema, { a: 0, v: 2 }).length, 2);
});

test('fixture 產物全部符合 schema', () => {
  assert.deepEqual(validateArtifact('context', fx.context()), []);
  assert.deepEqual(validateArtifact('risks', fx.risks()), []);
  assert.deepEqual(validateArtifact('design', fx.design()), []);
  assert.deepEqual(validateArtifact('cases', { version: 1, cases: fx.cases() }), []);
  assert.deepEqual(validateArtifact('tasks', fx.tasks('a'.repeat(64))), []);
  assert.deepEqual(validateArtifact('results', fx.results()), []);
  assert.deepEqual(validateArtifact('review', fx.review()), []);
  assert.deepEqual(validateArtifact('review-checks', fx.reviewChecks()), []);
  assert.deepEqual(validateArtifact('config', fx.config()), []);
});
