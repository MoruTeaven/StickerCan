#!/usr/bin/env node
/**
 * check-changelog.js - 更新日志数据防漂移校验
 *
 * 背景：ztools 侧的 ChangelogManager 曾出现 1.2.0 的 changes 对象中
 * `added` 键书写两次的问题。JS 对象字面量重复键以后者覆盖前者，
 * 语法完全合法、不报错，导致「支持分别删除本地或云端的表情包」
 * 条目被静默丢弃。
 *
 * 现在版本数据已单源化到 core/ui/ChangelogData.js，本脚本负责：
 *   1. 扫描源码文本，拦截重复分类键（即使语法合法）；
 *   2. 校验版本号唯一、分类键合法、日期格式；
 *   3. 校验两端不再各自持有 ChangelogManager / ThemeManager 副本。
 *
 * 用法：
 *   node tools/check-changelog.js
 * 退出码 0 = 通过，1 = 发现问题。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'core', 'ui', 'ChangelogData.js');
const SHARED_UI_DIR = path.join(ROOT, 'core', 'ui');
const CLIENTS_DIR = path.join(ROOT, 'clients');

// 共享模块不允许在客户端侧再次出现副本
const SHARED_MODULES = ['ThemeManager.js', 'ChangelogManager.js', 'ChangelogData.js'];

const ALLOWED_CATEGORIES = ['added', 'adjusted', 'fixed', 'improved', 'removed'];

const errors = [];

function fail(msg) {
  errors.push(msg);
}

/**
 * 从源码文本中提取每个版本块内出现的分类键，用于检测重复键。
 * 按对象层级解析：定位到 `changes: {` 后，统计同层级的顶层键。
 */
function detectDuplicateCategoryKeys(source) {
  const lines = source.split(/\r?\n/);
  let inChanges = false;
  let braceDepth = 0;
  let currentVersion = '(未知版本)';
  let keys = [];

  const flush = () => {
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
    [...new Set(duplicates)].forEach(k => {
      fail(
        `版本 ${currentVersion} 的 changes 中存在重复分类键 "${k}" —— ` +
        `后者会静默覆盖前者，导致更新条目丢失。`
      );
    });
    keys = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\/\/.*$/, '');

    const verMatch = line.match(/version:\s*['"]([^'"]+)['"]/);
    if (verMatch) currentVersion = verMatch[1];

    if (!inChanges && /changes:\s*\{/.test(line)) {
      inChanges = true;
      braceDepth = 1;
      keys = [];
      continue;
    }

    if (!inChanges) continue;

    // 只统计 changes 的直接子键（depth === 1）
    const keyMatch = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*/);
    if (keyMatch && braceDepth === 1) {
      keys.push(keyMatch[1]);
    }

    braceDepth += (line.match(/\{/g) || []).length;
    braceDepth -= (line.match(/\}/g) || []).length;

    if (braceDepth <= 0) {
      inChanges = false;
      flush();
    }
  }

  if (inChanges) flush(); // 文件意外结束时也校验已收集内容
}

function checkDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fail(`缺少共享版本数据文件: ${path.relative(ROOT, DATA_FILE)}`);
    return;
  }

  const source = fs.readFileSync(DATA_FILE, 'utf-8');

  // 1. 文本级重复键检测（对象解析后无法发现，必须在源码层做）
  detectDuplicateCategoryKeys(source);

  // 2. 结构级校验
  let data;
  try {
    delete require.cache[require.resolve(DATA_FILE)];
    data = require(DATA_FILE);
  } catch (err) {
    fail(`ChangelogData.js 无法加载: ${err.message}`);
    return;
  }

  const versions = data && data.versions;
  if (!Array.isArray(versions) || versions.length === 0) {
    fail('ChangelogData.versions 必须是非空数组');
    return;
  }

  const seen = new Set();
  versions.forEach((v, i) => {
    const label = v.version || `#${i}`;

    if (!v.version) fail(`第 ${i + 1} 条记录缺少 version`);
    if (!v.date) fail(`版本 ${label} 缺少 date`);
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) {
      fail(`版本 ${label} 的 date "${v.date}" 不是 YYYY-MM-DD 格式`);
    }

    if (seen.has(v.version)) fail(`版本号重复: ${label}`);
    seen.add(v.version);

    if (!v.changes || typeof v.changes !== 'object') {
      fail(`版本 ${label} 缺少 changes 对象`);
      return;
    }

    Object.keys(v.changes).forEach(key => {
      if (!ALLOWED_CATEGORIES.includes(key)) {
        fail(`版本 ${label} 存在未知分类 "${key}"（允许: ${ALLOWED_CATEGORIES.join(', ')}）`);
      }
      if (!Array.isArray(v.changes[key])) {
        fail(`版本 ${label} 的 ${key} 必须是数组`);
      }
    });
  });
}

function checkNoClientCopies() {
  if (!fs.existsSync(CLIENTS_DIR)) return;

  const clients = fs.readdirSync(CLIENTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  for (const client of clients) {
    for (const mod of SHARED_MODULES) {
      const p = path.join(CLIENTS_DIR, client, 'ui', mod);
      if (fs.existsSync(p)) {
        fail(
          `${client} 侧仍存在共享模块副本: clients/${client}/ui/${mod}\n` +
          `        → 共享实现位于 core/ui/${mod}，请删除副本并改为引用共享实现。`
        );
      }
    }
  }
}

// ponytail: build.js 已迁 esbuild 打包，模块依赖图由 bundler 解析保证，
// 旧版手工 <script> 顺序检查（checkBuildScriptOrder）已无意义且报假错，已删除。
// 升级路径：若需等价的 require 完整性校验（防 script.js 漏 require 共享 UI），后续可补。

// ── 执行 ──

console.log('===== 校验更新日志与共享模块 =====');
checkDataFile();
checkNoClientCopies();

if (errors.length > 0) {
  console.error(`\n✗ 发现 ${errors.length} 个问题:\n`);
  errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}\n`));
  process.exit(1);
}

console.log('✓ 版本数据单源一致，无重复分类键');
console.log('✓ 两端无共享模块副本');
console.log('===== 校验通过 =====');
