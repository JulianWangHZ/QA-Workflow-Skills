import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chunkParts, scanFiles, splitLargePart } from '../lib/review-checks.mjs';

test('scanFiles：抓出固定等待、.only、skip、寫死的密碼（fail）與 console.log、結構性 selector（warn）', () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-scan-'));
  mkdirSync(join(root, 'tests'));
  writeFileSync(join(root, 'tests/a.steps.ts'), [
    "await page.waitForTimeout(3000);",
    "test.only('x', () => {});",
    "it.skip('y', () => {});",
    "const password = 'hunter22secret';",
    "console.log('debug');",
    "page.locator('//div[2]');",
    "await expect(loginPage.error()).toBeVisible();"
  ].join('\n'));
  const hits = scanFiles(root, ['tests/a.steps.ts']);
  const byRule = Object.fromEntries(hits.map((h) => [h.rule, h]));
  assert.equal(byRule['fixed-wait'].line, 1);
  assert.equal(byRule['focused-test'].level, 'fail');
  assert.equal(byRule['skipped-test'].level, 'fail');
  assert.equal(byRule['hardcoded-secret'].level, 'fail');
  assert.equal(byRule['console-log'].level, 'warn');
  assert.equal(byRule['structural-selector'].line, 6);
  assert.ok(!hits.some((h) => h.line === 7), '乾淨的一行不應該被標記');
});

const part = (file, lines) => ({ file, lines, text: Array.from({ length: lines }, (_, i) => `+${file} ${i}`).join('\n') });

test('chunkParts：小檔依行數裝箱', () => {
  const chunks = chunkParts([part('a', 300), part('b', 400), part('d', 200)], 800);
  assert.deepEqual(chunks.map((c) => c.parts.map((p) => p.file)), [['a', 'b'], ['d']]);
});

test('splitLargePart：超過上限的新檔依行數切成多個片段，每段不超過上限', () => {
  const big = { file: 'big.ts', text: ['--- /dev/null', '+++ b/big.ts', ...Array.from({ length: 2000 }, (_, i) => `+line ${i}`)].join('\n') };
  big.lines = big.text.split('\n').length;
  const pieces = splitLargePart(big, 800);
  assert.ok(pieces.length >= 3);
  assert.ok(pieces.every((p) => p.lines <= 801 && p.text.startsWith('--- /dev/null\n+++ b/big.ts')));
  assert.equal(pieces[0].segment, `1/${pieces.length}`);
  const chunks = chunkParts([big], 800);
  assert.ok(chunks.every((c) => c.lines <= 801));
});
