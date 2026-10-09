/**
 * build.js - 多客户端构建脚本（esbuild 版）
 *
 * 以 clients/<平台>/script.js 为入口，esbuild 把 core/ 与 adapters/ui 通过
 * 显式 require 构成的依赖图打包成单个 dist/<平台>/script.js（IIFE）。
 * 不再需要手工维护加载顺序，也不再复制散落的模块文件。
 *
 * 构建流水线：
 *   1. 前置校验：node tools/check-changelog.js（防漂移）
 *   2. 整目录复制 clients/<平台>/ → dist/<平台>/（静态资源原样保留）
 *   3. esbuild 打包 → dist/<平台>/script.js（覆盖入口）
 *   4. 删除产物中已内联的 adapters/、ui/ 目录
 *   5. 修复 materialdesignicons.min.css 缺失字体引用
 *
 * preload.js 运行在 Node.js（uTools 预加载），不参与打包，原样复制。
 * index.html 只保留 <script src="script.js">，指向打包后的单文件。
 *
 * 用法:
 *   node build.js              构建所有客户端
 *   node build.js utools       仅构建指定客户端
 *   node build.js --minify     压缩产物（可与客户端名组合）
 */

const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname);
const CLIENTS_DIR = path.join(ROOT, 'clients');
const DIST_DIR = path.join(ROOT, 'dist');

/**
 * 定位 esbuild 平台二进制。
 *
 * 通过 spawnSync(…, { stdio: 'inherit' }) 直接调 CLI，而不是 esbuild 的 JS API：
 *   - JS API 需要服务进程 + 管道通信，部分受限沙箱环境禁止命名管道；
 *   - pnpm isolated 布局下，JS API 的裸 require.resolve 在个别 Windows
 *     符号链接环境会解析不到平台二进制，本函数显式定位后直调，规避两者。
 */
function findEsbuildBinary() {
  const fromEnv = process.env.ESBUILD_BINARY_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const subpath = process.platform === 'win32' ? 'esbuild.exe' : path.join('bin', 'esbuild');
  const pkg = `@esbuild/${process.platform}-${process.arch}`;

  const roots = [];
  try {
    const esbuildRoot = path.dirname(require.resolve('esbuild/package.json'));
    roots.push(esbuildRoot);
    try {
      // 真实路径：pnpm 下 esbuild/ 是符号链接，兄弟目录 @esbuild 在真实路径下
      roots.push(fs.realpathSync(esbuildRoot));
    } catch { /* 符号链接解析失败则仅用链接路径 */ }
  } catch { /* esbuild 未安装，落到下方友好报错 */ }

  for (const root of roots) {
    const candidate = path.join(path.dirname(root), pkg, subpath);
    if (fs.existsSync(candidate)) return candidate;
  }

  console.error(`✗ 未找到 esbuild 平台二进制 (${pkg})，请先执行: pnpm install`);
  process.exit(1);
}

// ── 工具函数 ──

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function listFiles(dir, prefix = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      console.log(`${prefix}${entry.name}/`);
      listFiles(fullPath, prefix + '  ');
    } else {
      console.log(`${prefix}${entry.name}`);
    }
  }
}

/**
 * 修复 materialdesignicons.min.css：
 * - 直接重写 @font-face 的 src 属性，只保留存在的 woff2 和 woff 字体
 * - 移除不存在的 .eot 和 .ttf 引用
 * - 移除 source map 引用
 */
function fixMaterialIconsCss(clientDir) {
  const cssPath = path.join(clientDir, 'lib', 'materialdesignicons.min.css');
  if (!fs.existsSync(cssPath)) return;

  let content = fs.readFileSync(cssPath, 'utf-8');

  // 只含 woff2 和 woff 的版本：
  const newSrc = 'src:url("./fonts/materialdesignicons-webfont.woff2?v=7.4.47") format("woff2"),url("./fonts/materialdesignicons-webfont.woff?v=7.4.47") format("woff")';

  // 匹配从第一个 src: 开始到 format("truetype") 结束的整个块
  content = content.replace(
    /src:url\(["']?\.\/fonts\/materialdesignicons-webfont\.eot[^;]*;\s*src:[^;]*format\("truetype"\)/g,
    newSrc
  );

  // 移除 source map 引用
  content = content.replace(
    /\/\*# sourceMappingURL=materialdesignicons\.css\.map \*\//g,
    ''
  );

  fs.writeFileSync(cssPath, content, 'utf-8');
}

// ── 构建 ──

function buildClient(esbuildBin, clientName, minify) {
  const srcClient = path.join(CLIENTS_DIR, clientName);
  if (!fs.existsSync(srcClient)) {
    console.error(`✘ 客户端不存在: ${clientName}`);
    return false;
  }

  const distClient = path.join(DIST_DIR, clientName);

  console.log(`\n──── 构建客户端: ${clientName} ────`);

  // 清理旧产物
  if (fs.existsSync(distClient)) {
    fs.rmSync(distClient, { recursive: true, force: true });
    console.log('  已清理旧构建产物');
  }
  fs.mkdirSync(distClient, { recursive: true });

  // 1. 整目录复制（index.html / styles.css / plugin.json / logo.png / lib / preload.js 原样保留）
  console.log('  复制客户端静态资源...');
  copyDir(srcClient, distClient);

  // 2. esbuild 打包（覆盖 dist/<client>/script.js）
  console.log('  esbuild 打包...');
  const outfile = path.join(distClient, 'script.js');
  const args = [
    path.join(srcClient, 'script.js'),
    '--bundle',
    `--outfile=${outfile}`,
    '--format=iife',
    '--platform=browser',
    '--legal-comments=none',
    '--log-level=warning',
  ];
  if (minify) args.push('--minify');
  const result = spawnSync(esbuildBin, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`  ✘ ${clientName} 打包失败（esbuild 退出码 ${result.status}）`);
    return false;
  }

  // 3. 模块源码已内联进 bundle，删除产物中不需要的副本
  for (const leftover of ['adapters', 'ui']) {
    fs.rmSync(path.join(distClient, leftover), { recursive: true, force: true });
  }

  // 4. 图标 CSS 后处理
  console.log('  修复图标 CSS...');
  fixMaterialIconsCss(distClient);

  // 5. 列出产物
  console.log('  产物文件:');
  listFiles(distClient, '    ');

  console.log(`  ✓ ${clientName} 构建完成 → ${distClient}`);
  return true;
}

function main() {
  console.log('===== 开始构建 =====');

  const esbuildBin = findEsbuildBinary();

  // 构建前置校验：拦截更新日志数据漂移与共享模块副本
  // （历史上 ChangelogManager 双副本曾因 changes 重复键静默丢失更新条目）
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'check-changelog.js')], {
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('\n✗ 前置校验失败，构建中止');
    process.exit(1);
  }

  // 解析参数: 可选客户端名 + 可选 --minify
  const cliArgs = process.argv.slice(2);
  const minify = cliArgs.includes('--minify');
  const target = cliArgs.find(a => !a.startsWith('--'));

  let clients;
  if (target) {
    clients = [target];
  } else {
    clients = fs.readdirSync(CLIENTS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  }

  if (clients.length === 0) {
    console.log('未找到任何客户端目录');
    return;
  }

  console.log(`待构建客户端: ${clients.join(', ')}${minify ? '（minify）' : ''}`);

  let allOk = true;
  for (const name of clients) {
    if (!buildClient(esbuildBin, name, minify)) allOk = false;
  }

  console.log('\n===== 构建结束 =====');
  if (allOk) {
    console.log('✓ 全部构建成功');
  } else {
    console.log('✗ 部分构建失败');
    process.exit(1);
  }
}

main();
