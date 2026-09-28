import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkMcp, requiredMcpTools } from '../lib/mcp.mjs';

const dir = () => mkdtempSync(join(tmpdir(), 'qa-mcp-'));

test('requiredMcpTools：app 需要 Appium，web 或 Playwright 類 e2e 需要 Playwright', () => {
  assert.deepEqual(requiredMcpTools({ platform: 'app' }), ['appium']);
  assert.deepEqual(requiredMcpTools({ platform: 'web' }), ['playwright']);
  assert.deepEqual(requiredMcpTools({ config: { layers: { e2e: { command: 'npx bddgen && npx playwright test' } } } }), ['playwright']);
  assert.deepEqual(requiredMcpTools({ config: { layers: { unit: { command: 'pytest' } } } }), []);
  const mixed = { profiles: [{ platforms: ['web'] }, { platforms: ['app'] }] };
  assert.deepEqual(requiredMcpTools({ config: mixed }), ['playwright', 'appium']);
});

test('checkMcp：從專案 .mcp.json、使用者設定、已啟用 plugin 找到設定', () => {
  const root = dir();
  const home = dir();
  assert.equal(checkMcp({ root, home, platform: 'web' })[0].configured, false);

  writeFileSync(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { 'playwright-test': {} } }));
  assert.equal(checkMcp({ root, home, platform: 'web' })[0].configured, true);

  mkdirSync(join(home, '.claude'));
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [root]: { mcpServers: { 'appium-mcp': {} } } } }));
  assert.equal(checkMcp({ root, home, platform: 'app' })[0].configured, true);

  const other = dir();
  writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'playwright@official': true } }));
  assert.equal(checkMcp({ root: other, home, platform: 'web' })[0].configured, true);
});
