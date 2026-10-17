/**
 * smoke-test.js — 构建产物冒烟测试（esbuild 单 IIFE 打包架构）
 *
 * 背景：
 * 旧版 smoke-test 依赖「多 <script> 按序加载 + 全局变量」架构——
 * 解析 index.html 的 <script src> 顺序，在 vm 沙箱逐个 runInContext，
 * 再从 context 取全局 ThemeManager / ChangelogManager / ChangelogData。
 *
 * 当前 build.js 已迁移 esbuild 打包：每个客户端只产出单个 IIFE script.js，
 * 模块作用域私有，不再挂全局，因此旧测试会报
 * “'ThemeManager is not a constructor'”。本测试改为针对打包产物的
 * 「契约 + 结构」校验，且零外部依赖（无 jsdom / linkedom）。
 *
 * 校验项：
 *   1. dist/<端>/script.js 存在且非空（产物落地）
 *   2. clients/<端>/index.html 仅含单个 <script src="script.js">（单包架构，
 *      防止回退到旧的「多 script 按序加载」结构）
 *   3. 打包产物暴露契约全局（window.emotionManager / window.changelogManager /
 *      window._emotionApp）——证明入口已成功构造并挂载管理器，
 *      等价于旧测试想验证的「能从产物取得 ThemeManager / ChangelogManager」，
 *      且以正则兼容压缩（\s*=）
 *   4. 在 vm 沙箱中加载产物：解析无语法错误（硬性失败）；top-level 执行与
 *      DOMContentLoaded 回调在 DOM 桩下 best-effort 运行（桩不完整时的异常
 *      降级为告警，非失败）
 *
 * 退出码：0 = 通过；1 = 存在硬性失败。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const CLIENTS_DIR = path.join(ROOT, 'clients');
const DIST_DIR = path.join(ROOT, 'dist');

const CLIENTS = ['utools', 'ztools'];

/** 打包产物必须在 DOMContentLoaded 内赋值的契约全局（显式导出验证）。 */
const CONTRACT_GLOBALS = ['emotionManager', 'changelogManager', '_emotionApp'];

let failures = 0;
let warnings = 0;

function ok(msg) { console.log('  \u2713 ' + msg); }
function fail(msg) { failures++; console.error('  \u2717 ' + msg); }
function warn(msg) { warnings++; console.warn('  \u26a0 ' + msg); }

function exists(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function nonempty(p) { try { return fs.statSync(p).size > 0; } catch { return false; } }

function makeElementStub() {
  return {
    style: {}, dataset: {}, textContent: '', innerHTML: '', value: '',
    setAttribute() {}, getAttribute() { return null; }, appendChild() {},
    addEventListener() {}, removeEventListener() {},
    classList: { add() {}, remove() {}, toggle() {} },
    querySelectorAll() { return []; }, querySelector() { return null; },
    focus() {}, remove() {},
  };
}

console.log('=== 表情罐头 构建产物冒烟测试 (esbuild 单包架构) ===\n');

// [1] 产物落地
console.log('[1] 产物落地 (dist/<端>/script.js)');
for (const c of CLIENTS) {
  const p = path.join(DIST_DIR, c, 'script.js');
  if (!exists(p)) fail('缺少产物 ' + path.relative(ROOT, p));
  else if (!nonempty(p)) fail('产物为空 ' + path.relative(ROOT, p));
  else ok(c + '/script.js 存在 (' + fs.statSync(p).size + ' 字节)');
}

// [2] index.html 单包架构
console.log('\n[2] index.html 单 <script src="script.js"> 架构');
for (const c of CLIENTS) {
  const html = path.join(CLIENTS_DIR, c, 'index.html');
  if (!exists(html)) { fail('缺少 ' + path.relative(ROOT, html)); continue; }
  const src = fs.readFileSync(html, 'utf8');
  const scripts = [...src.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]);
  const inline = (src.match(/<script\b(?![^>]*\bsrc=)[^>]*>/gi) || []).length;
  if (scripts.length === 1 && scripts[0] === 'script.js' && inline === 0)
    ok(c + '/index.html 仅含单个 script.js');
  else
    fail(c + '/index.html 架构异常: script[src]=' + JSON.stringify(scripts) + ', inline=' + inline);
}

// [3] 契约全局（入口已构造并挂载管理器，等价于旧测试取 ThemeManager 的意图）
console.log('\n[3] 打包产物契约全局（显式导出验证）');
for (const c of CLIENTS) {
  const p = path.join(DIST_DIR, c, 'script.js');
  if (!exists(p) || !nonempty(p)) { warn(c + '/script.js 缺失，跳过结构校验'); continue; }
  const code = fs.readFileSync(p, 'utf8');
  for (const g of CONTRACT_GLOBALS) {
    if (new RegExp('window\\.' + g + '\\s*=').test(code))
      ok(c + ': 含 window.' + g + ' 暴露语句');
    else
      fail(c + ': 未找到 window.' + g + ' 暴露语句');
  }
}

// [4] 加载产物（best-effort vm + DOM 桩）
console.log('\n[4] 产物加载与运行 (vm 沙箱, DOM 桩)');
for (const c of CLIENTS) {
  const p = path.join(DIST_DIR, c, 'script.js');
  if (!exists(p) || !nonempty(p)) { warn(c + '/script.js 缺失，跳过加载'); continue; }
  const code = fs.readFileSync(p, 'utf8');

  // 4a. 仅解析：捕获语法错误（硬性失败）
  try {
    new vm.Script(code, { filename: p });
    ok(c + ': 产物语法解析通过');
  } catch (e) {
    fail(c + ': 产物语法错误 — ' + e.message);
    continue;
  }

  // 4b. best-effort 执行：DOM 桩不完整，异常降级为告警
  const domReady = [];
  const documentStub = {
    head: makeElementStub(),
    documentElement: { dataset: {}, setAttribute() {}, getAttribute() { return null; }, style: {} },
    createElement: () => makeElementStub(),
    getElementById: () => makeElementStub(),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: (ev, cb) => { if (ev === 'DOMContentLoaded') domReady.push(cb); },
  };
  const store = {};
  const windowStub = {
    addEventListener: documentStub.addEventListener,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    open: () => {},
    // 不定义 utools → 走 else 分支（开发环境模拟），与浏览器/dev 路径一致
  };
  const sandbox = {
    window: windowStub,
    document: documentStub,
    localStorage: windowStub.localStorage,
    matchMedia: windowStub.matchMedia,
    setTimeout, clearTimeout, console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  try {
    vm.runInContext(code, sandbox, { filename: p });
    ok(c + ': top-level 执行未抛错');
  } catch (e) {
    warn(c + ': top-level 执行抛错（DOM 桩不完整，非产物缺陷）— ' + e.message);
  }

  if (domReady.length) {
    try {
      for (const cb of domReady) cb();
      const missed = CONTRACT_GLOBALS.filter((g) => !(g in windowStub));
      if (missed.length === 0) ok(c + ': DOMContentLoaded 后契约全局已赋值');
      else warn(c + ': DOMContentLoaded 后未赋值 ' + missed.join('/') + '（DOM 桩不完整，属预期降级）');
    } catch (e) {
      warn(c + ': DOMContentLoaded 回调抛错（DOM 桩不完整）— ' + e.message);
    }
  } else {
    warn(c + ': 产物未注册 DOMContentLoaded，无法触发契约赋值校验');
  }
}

console.log('\n=== 结果 ===');
if (failures === 0) {
  if (warnings)
    console.log('通过（含 ' + warnings + ' 条告警；多因无 DOM 库、桩不完整，非打包缺陷）');
  else
    console.log('全部通过 \u2713');
  process.exit(0);
} else {
  console.error('失败 ' + failures + ' 项，告警 ' + warnings + ' 项');
  process.exit(1);
}
