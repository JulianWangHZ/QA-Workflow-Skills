// 檢查 Playwright MCP／Appium MCP 是否已設定。只看設定檔，不代表伺服器一定連得上；
// 實際能不能用，由 planner 第一次呼叫工具時確認。
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const readJson = (file) => {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  } catch {
    return null;
  }
};

export const MCP_TOOLS = {
  playwright: {
    pattern: /playwright/i,
    label: 'Playwright MCP',
    setup: 'claude mcp add playwright -- npx @playwright/mcp@latest（或安裝 Claude Code 的 Playwright plugin）'
  },
  appium: {
    pattern: /appium/i,
    label: 'Appium MCP',
    setup: '依 Appium MCP 的說明加入 MCP 設定，並啟動 Appium server、開啟模擬器或實機、安裝 App'
  }
};

// 蒐集已設定的 MCP 名稱：專案 .mcp.json、使用者設定（全域與此專案）、已啟用的 plugin
export const configuredMcpNames = (root, home = homedir()) => {
  const project = readJson(join(root, '.mcp.json'));
  const user = readJson(join(home, '.claude.json'));
  const settings = readJson(join(home, '.claude', 'settings.json'));
  return [
    ...Object.keys(project?.mcpServers ?? {}),
    ...Object.keys(user?.mcpServers ?? {}),
    ...Object.keys(user?.projects?.[root]?.mcpServers ?? {}),
    ...Object.entries(settings?.enabledPlugins ?? {}).filter(([, on]) => on).map(([name]) => name)
  ];
};

// 依產品平台決定需要哪個工具：app → Appium；web（或有 Playwright／Cypress 的 e2e）→ Playwright
export const requiredMcpTools = ({ platform, config }) => {
  const platforms = new Set([
    ...(platform ? [platform] : []),
    ...(config?.profiles ?? []).flatMap((p) => p.platforms)
  ]);
  if (platforms.size === 0) {
    const e2e = config?.layers?.e2e?.command ?? '';
    if (/playwright|cypress|bddgen|cucumber/.test(e2e)) platforms.add('web');
  }
  return [...(platforms.has('web') ? ['playwright'] : []), ...(platforms.has('app') ? ['appium'] : [])];
};

export const checkMcp = ({ root, platform, config, home }) => {
  const names = configuredMcpNames(root, home);
  return requiredMcpTools({ platform, config }).map((key) => {
    const tool = MCP_TOOLS[key];
    return { key, label: tool.label, configured: names.some((n) => tool.pattern.test(n)), setup: tool.setup };
  });
};
