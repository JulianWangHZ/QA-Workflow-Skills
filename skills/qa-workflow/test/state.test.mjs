import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, createState, advanceState, rewindState } from '../lib/state.mjs';

test('stage 依序推進，不會就地修改原物件', () => {
  const s0 = createState({ runId: 'r1', mode: 'full', stage: 'context', now: 't0' });
  const s1 = advanceState(s0, 'gate', 't1');
  assert.equal(s0.stage, 'context');
  assert.equal(s1.stage, 'risk');
  assert.equal(s1.history.length, 2);
  assert.equal(STAGES.at(-1), 'done');
});

test('rewind 只能往回', () => {
  const s = { ...createState({ runId: 'r', mode: 'full', stage: 'context', now: 't' }), stage: 'run' };
  assert.equal(rewindState(s, 'cases', 't2').stage, 'cases');
  assert.throws(() => rewindState(s, 'report', 't2'), /只能退回/);
});
