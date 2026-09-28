import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJunit, matchTask } from '../lib/junit.mjs';

const xml = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="login">
    <testcase classname="login" name="rejects wrong password" time="0.012"/>
    <testcase classname="login" name="locks after 5 tries" time="1.5">
      <failure message="expected 423 &amp; got 200">stack</failure>
    </testcase>
    <testcase classname="login" name="sso flow"><skipped/></testcase>
    <testcase classname="login" name="db down"><error message="ECONNREFUSED"/></testcase>
  </testsuite>
</testsuites>`;

test('parseJunit 解析 passed / failed / skipped / error', () => {
  const cases = parseJunit(xml);
  assert.equal(cases.length, 4);
  assert.deepEqual(cases.map((c) => c.status), ['passed', 'failed', 'skipped', 'failed']);
  assert.equal(cases[1].message, 'expected 423 & got 200');
  assert.equal(cases[1].durationMs, 1500);
});

test('matchTask 以 testName 比對，多筆命中時任一失敗即失敗', () => {
  const cases = parseJunit(xml);
  assert.equal(matchTask({ testName: 'rejects wrong password' }, cases).status, 'passed');
  assert.equal(matchTask({ testName: 'locks after' }, cases).status, 'failed');
  assert.equal(matchTask({ testName: 'login' }, cases).status, 'failed');
  assert.equal(matchTask({ testName: 'sso flow' }, cases).status, 'skipped');
  assert.equal(matchTask({ testName: 'not exists' }, cases), null);
});
