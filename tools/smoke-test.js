/**
 * smoke-test.js - 构建产物功能冒烟测试
 *
 * 验证 dist/ 下两端产物在「浏览器式 <script> 顺序加载」环境下可正常运行：
 * 共享 UI 模块全局可用、加载顺序正确、ThemeManager 主题切换生效、
 * ChangelogManager 正常渲染全部版本，并确认两端共享产物逐字节一致。
 *
 * 注意：运行前需先执行 `node build.js`（本脚本读取 dist/ 产物，而非源码）。
 *
 * 用法: node tools/smoke-test.js [项目根目录]
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || path.resolve(__dirname, '..');

// class 声明不会挂到 context 对象上，需通过 runInContext 求值取得
function get(ctx, expr) {
  try { return vm.runInContext(expr, ctx); } catch (e) { return undefined; }
}

function makeSandbox() {
  const document = {
    documentElement: { dataset: {} },
    head: { appendChild() {} },
    querySelector: () => null,
    addEventListener: () => {},
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document,
    window: { matchMedia: () => ({ matches: false, addEventListener: () => {} }) },
    localStorage: (() => {
      const s = {};
      return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } };
    })(),
  };
  sandbox.window.document = document;
  return sandbox;
}

function testClient(name) {
  const dir = path.join(ROOT, 'dist', name);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf-8');
  const order = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

  const ctx = vm.createContext(makeSandbox());
  const loaded = [];
  for (const src of order) {
    const file = path.join(dir, src);
    if (!fs.existsSync(file)) throw new Error(`${name}: 缺少脚本 ${src}`);
    vm.runInContext(fs.readFileSync(file, 'utf-8'), ctx, { filename: src });
    loaded.push(src);
  }

  const ThemeManager = get(ctx, 'ThemeManager');
  const ChangelogManager = get(ctx, 'ChangelogManager');
  const ChangelogData = get(ctx, 'ChangelogData');

  const checks = [];
  checks.push(['ThemeManager 全局可用', typeof ThemeManager === 'function']);
  checks.push(['ChangelogManager 全局可用', typeof ChangelogManager === 'function']);
  checks.push(['ChangelogData 全局可用', !!(ChangelogData && Array.isArray(ChangelogData.versions))]);
  checks.push(['ChangelogData 先于 ChangelogManager',
    order.indexOf('core/ui/ChangelogData.js') < order.indexOf('core/ui/ChangelogManager.js')]);
  checks.push(['ThemeManager 先于 UIManager',
    order.indexOf('core/ui/ThemeManager.js') < order.indexOf('ui/UIManager.js')]);

  // 默认偏好为 system，沙箱 matchMedia 返回 matches:false（系统为浅色），
  // 因此初始化后应进入浅色模式，且 documentElement 上应写入 data-theme=light
  get(ctx, 'document.documentElement.dataset.theme = undefined');
  const tm = new ThemeManager({});
  checks.push(['ThemeManager 跟随系统：浅色系统 → light',
    tm.isLightMode === true && get(ctx, 'document.documentElement.dataset.theme') === 'light']);
  tm.setUserPreference('light');
  checks.push(['setUserPreference(light) 生效', tm.isLightMode === true]);
  tm.setUserPreference('dark');
  checks.push(['setUserPreference(dark) 生效', tm.isLightMode === false]);
  checks.push(['applyTheme 写入 data-theme', get(ctx, 'document.documentElement.dataset.theme') === 'dark']);

  const cm = new ChangelogManager();
  const out = cm.renderAll();
  const rendered = (out.match(/changelog-version/g) || []).length;
  checks.push([`渲染版本数 ${rendered} == 数据 ${ChangelogData.versions.length}`,
    rendered === ChangelogData.versions.length]);
  checks.push(['渲染含 版本 1.2.2', out.includes('版本 1.2.2')]);
  checks.push(['历史丢失的 1.2.0 条目已恢复',
    out.includes('支持分别删除本地或云端的表情包')
    && out.includes('增加了表情详情中点击图片放大查看的功能')]);

  let rejected = false;
  try {
    new ChangelogManager([
      { version: '1', date: '2026-01-01', changes: {} },
      { version: '1', date: '2026-01-02', changes: {} },
    ]);
  } catch (e) { rejected = true; }
  checks.push(['重复版本号被 validate() 拒绝', rejected]);

  let unknownRejected = false;
  try { new ChangelogManager([{ version: '1', date: '2026-01-01', changes: { typo: [] } }]); }
  catch (e) { unknownRejected = true; }
  checks.push(['未知分类键被 validate() 拒绝', unknownRejected]);

  console.log(`\n--- ${name} (${loaded.length} 个脚本全部执行成功) ---`);
  let ok = true;
  for (const [label, pass] of checks) {
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}`);
    if (!pass) ok = false;
  }
  return ok;
}

const a = testClient('utools');
const b = testClient('ztools');

const shared = ['core/ui/ThemeManager.js', 'core/ui/ChangelogManager.js', 'core/ui/ChangelogData.js'];
console.log('\n--- 两端共享产物一致性 ---');
let same = true;
for (const rel of shared) {
  const x = fs.readFileSync(path.join(ROOT, 'dist', 'utools', rel), 'utf-8');
  const y = fs.readFileSync(path.join(ROOT, 'dist', 'ztools', rel), 'utf-8');
  const eq = x === y;
  console.log(`  ${eq ? 'PASS' : 'FAIL'}  ${rel} 两端一致`);
  if (!eq) same = false;
}

const allOk = a && b && same;
console.log(`\n${allOk ? 'ALL PASS' : 'SOME FAILED'}`);
process.exit(allOk ? 0 : 1);
