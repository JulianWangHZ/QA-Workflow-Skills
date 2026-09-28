// plugin 打包層面的檢查：範例設定合法、每個 skill 的 frontmatter 正確、文件引用的檔案存在。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validateArtifact } from '../lib/schema.mjs';

const SKILLS_DIR = fileURLToPath(new URL('../../', import.meta.url));
const skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

test('config.example.json 符合 schema', () => {
  const example = JSON.parse(readFileSync(new URL('../assets/config.example.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateArtifact('config', example), []);
});

test('8 個 skill 都存在，frontmatter 的 name 與目錄一致且有 description', () => {
  assert.deepEqual(skillDirs.sort(), ['qa-cases', 'qa-code-review', 'qa-context', 'qa-report', 'qa-risk', 'qa-run', 'qa-scripts', 'qa-workflow']);
  skillDirs.forEach((dir) => {
    const text = readFileSync(join(SKILLS_DIR, dir, 'SKILL.md'), 'utf8');
    const front = text.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(front, `${dir} 缺少 frontmatter`);
    assert.match(front[1], new RegExp(`^name: ${dir}$`, 'm'), `${dir} 的 name 不一致`);
    assert.match(front[1], /^description:/m, `${dir} 缺少 description`);
  });
});

test('SKILL.md 中引用的 references / schemas 檔案都存在', () => {
  skillDirs.forEach((dir) => {
    const text = readFileSync(join(SKILLS_DIR, dir, 'SKILL.md'), 'utf8');
    const refs = [...text.matchAll(/`((?:\.\.\/qa-workflow\/)?(?:references|schemas|assets)\/[\w.-]+\.(?:md|json|html))`/g)].map((m) => m[1]);
    refs.forEach((ref) => assert.ok(existsSync(join(SKILLS_DIR, dir, ref)), `${dir}/SKILL.md 引用的 ${ref} 不存在`));
  });
});

test('每個 profile 指定的 coding style 範例檔都存在', async () => {
  const { detectProfiles } = await import('../lib/profiles.mjs');
  const source = readFileSync(new URL('../lib/profiles.mjs', import.meta.url), 'utf8');
  const styles = [...new Set([...source.matchAll(/style: '([\w.-]+\.md)'/g)].map((m) => m[1]))];
  assert.ok(styles.length >= 3);
  styles.forEach((style) => assert.ok(existsSync(join(SKILLS_DIR, 'qa-scripts/references/styles', style)), `缺少 ${style}`));
  assert.equal(typeof detectProfiles, 'function');
});
