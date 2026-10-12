#!/usr/bin/env node
/**
 * smoke-test.js - 构建产物功能冒烟测试（esbuild 打包架构版）
 *
 * build.js 迁到 esbuild 后产物是单 IIFE script.js，模块作用域私有，
 * 旧版「vm 加载多 <script> + 取全局类」的测法已失效。本版改为：
 *   1. stub 浏览器全局（document/window/localStorage），直接 require
 *      共享源码测 ThemeManager 主题切换 + ChangelogManager 渲染/校验；
 *   2. 校验 dist/<端>/script.js 产物存在且非空（构建成功凭据）。
 * esbuild 打包保证源码→产物逻辑保真，故测源码等价于测产物的逻辑层。
 *
 * 运行前需先执行 `node build.js`。用法: node tools/smoke-test.js [项目根目录]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.resolve(__dirname, '..');

// ── 浏览器全局 stub（ThemeManager 访问 document/matchMedia/localStorage）──
const documentStub = {
  documentElement: { dataset: {} },
  head: { appendChild() {} },
  querySelector: () => null,
  addEventListener: () => {},
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
};
global.document = documentStub;
global.window = {
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  document: documentStub,
};
global.localStorage = (() => {
  const s = {};
  return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } };
})();

// ── 加载共享模块（core 包，workspace 链接）──
const ThemeManager = require('@moruteaven/sticker-core/ui/ThemeManager.js');
const ChangelogManager = require('@moruteaven/sticker-core/ui/ChangelogManager.js');
const ChangelogData = require('@moruteaven/sticker-core/ui/ChangelogData.js');

const checks = [];
function check(label, pass) { checks.push([label, pass]); }
function throws(fn) { try { fn(); return false; } catch { return true; } }

// ── ThemeManager 主题切换 ──
documentStub.documentElement.dataset.theme = undefined;
const tm = new ThemeManager({});
// 默认 system + 沙箱 matchMedia matches:false（浅色）→ light
check('ThemeManager 跟随系统：浅色 → light',
  tm.isLightMode === true && documentStub.documentElement.dataset.theme === 'light');
tm.setUserPreference('light');
check('setUserPreference(light) 生效', tm.isLightMode === true);
tm.setUserPreference('dark');
check('setUserPreference(dark) 生效', tm.isLightMode === false);
check('applyTheme 写入 data-theme=dark', documentStub.documentElement.dataset.theme === 'dark');

// ── ChangelogManager 渲染与校验 ──
const cm = new ChangelogManager();
const out = cm.renderAll();
const rendered = (out.match(/changelog-version/g) || []).length;
check(`渲染版本数 ${rendered} == 数据 ${ChangelogData.versions.length}`,
  rendered === ChangelogData.versions.length);
const latest = ChangelogData.versions[0];
check(`渲染含最新版本 ${latest.version}`, out.includes(`版本 ${latest.version}`));
check('历史丢失的 1.2.0 条目仍存在',
  out.includes('支持分别删除本地或云端的表情包')
  && out.includes('增加了表情详情中点击图片放大查看的功能'));
check('重复版本号被 validate() 拒绝', throws(() =>
  new ChangelogManager([
    { version: '1', date: '2026-01-01', changes: {} },
    { version: '1', date: '2026-01-02', changes: {} },
  ])));
check('未知分类键被 validate() 拒绝', throws(() =>
  new ChangelogManager([{ version: '1', date: '2026-01-01', changes: { typo: [] } }])));

// ── 两端构建产物存在性 ──
for (const name of ['utools', 'ztools']) {
  const f = path.join(ROOT, 'dist', name, 'script.js');
  check(`${name}/script.js 产物存在且非空`, fs.existsSync(f) && fs.statSync(f).size > 0);
}

// ── 汇总 ──
let allOk = true;
for (const [label, pass] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) allOk = false;
}
console.log(`\n${allOk ? 'ALL PASS' : 'SOME FAILED'}`);
process.exit(allOk ? 0 : 1);
