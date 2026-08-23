/**
 * build.js - 多客户端构建脚本
 *
 * 遍历 clients/ 下的每个客户端目录，将其与 core/ 合并构建到 dist/ 下。
 * 例如：clients/utools/ → dist/utools/
 *
 * 构建时会自动重写 require 路径，使产物可独立运行：
 *   - 客户端根目录的 .js:  ../../core/  → ./core/
 *   - 客户端一级子目录的 .js: ../../../core/  → ../core/
 *   - 客户端二级子目录的 .js: ../../../../core/ → ../../core/
 *
 * 构建后还会进行浏览器兼容性处理：
 *   - 移除前端 JS 文件中的 require() 调用（浏览器不支持 CommonJS）
 *   - 在 index.html 中按依赖顺序注入 <script> 标签
 *   - 修复 materialdesignicons.min.css 中缺失字体文件和 source map 的引用
 *
 * 用法:
 *   node build.js           构建所有客户端
 *   node build.js utools    仅构建指定客户端
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const CLIENTS_DIR = path.join(ROOT, 'clients');
const SRC_CORE = path.join(ROOT, 'core');
const DIST_DIR = path.join(ROOT, 'dist');

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

function rewriteRequires(filePath, from, to) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf-8');
  content = content.split(from).join(to);
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * 递归处理目录下所有 .js 文件的 require 路径
 * 根据文件相对于客户端根目录的深度，自动计算路径映射
 */
function rewriteRequirePaths(clientDir, clientRoot) {
  if (!fs.existsSync(clientDir)) return;
  const entries = fs.readdirSync(clientDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(clientDir, entry.name);
    if (entry.isDirectory()) {
      rewriteRequirePaths(fullPath, clientRoot);
    } else if (entry.name.endsWith('.js')) {
      // 计算文件相对于客户端根目录的深度
      const rel = path.relative(clientRoot, path.dirname(fullPath));
      const depth = rel === '' ? 0 : rel.split(path.sep).length;

      // 源码中的 require 路径: 从 depth 层目录引用 core
      //   depth 0 (根目录):  ../../core/  → ./core/
      //   depth 1 (子目录):  ../../../core/ → ../core/
      //   depth 2 (孙目录):  ../../../../core/ → ../../core/
      const fromPrefix = '../'.repeat(depth + 2);  // depth 0 → ../../, depth 1 → ../../../, ...
      const toPrefix = depth === 0 ? './' : '../'.repeat(depth);
      const from = fromPrefix + 'core/';
      const to = toPrefix + 'core/';
      rewriteRequires(fullPath, from, to);
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

// ── 浏览器兼容性后处理 ──

/**
 * 需要在浏览器中按顺序加载的前端 JS 文件列表（不含 preload.js）。
 * 顺序按照依赖关系拓扑排序：被依赖的文件先加载。
 */
const FRONTEND_SCRIPT_ORDER = [
  // Layer 0: 接口和模型（无依赖）
  'core/interfaces/StorageProvider.js',
  'core/interfaces/ClipboardProvider.js',
  'core/interfaces/FileProvider.js',
  'core/interfaces/HttpProvider.js',
  'core/interfaces/NotificationProvider.js',
  'core/interfaces/SearchProvider.js',
  'core/models/Emotion.js',
  'core/models/Settings.js',
  'core/utils/CryptoUtils.js',
  'core/utils/MimeUtils.js',
  'core/utils/HtmlUtils.js',

  // Layer 1: 基类和服务（依赖接口/模型/工具）
  'core/search/SearchSourceBase.js',
  'core/services/SettingsService.js',
  'core/services/EmotionService.js',

  // Layer 2: 搜索源和搜索服务（依赖基类）
  'core/search/ApiHzSearchSource.js',
  'core/search/BaiduSearchSource.js',
  'core/search/SogouSearchSource.js',
  'core/search/TangdouziSearchSource.js',
  'core/search/YujianSearchSource.js',
  'core/services/SearchService.js',

  // Layer 3: 核心入口（聚合所有核心模块）
  'core/core.js',

  // Layer 4: 适配器（依赖接口）
  'adapters/UToolsStorageProvider.js',
  'adapters/UToolsClipboardProvider.js',
  'adapters/UToolsFileProvider.js',
  'adapters/UToolsHttpProvider.js',
  'adapters/UToolsNotificationProvider.js',

  // Layer 5: UI 管理器
  'ui/ThemeManager.js',
  'ui/ChangelogManager.js',
  'ui/UIManager.js',
];

/**
 * 从 require 调用中提取模块名（取文件名不含扩展名，首字母大写作为全局类名）
 * 例如：require('../core/interfaces/StorageProvider.js') → StorageProvider
 *       require('./core/core.js') → { createApp } (特殊处理)
 */
function getGlobalNameFromRequire(requirePath) {
  const basename = path.basename(requirePath, '.js');
  return basename;
}

/**
 * 移除前端 JS 文件中的 require() 调用
 *
 * 在浏览器环境中，所有 class 定义在全局作用域中会自动成为全局变量，
 * 不需要 require 来加载。此函数将 require 行替换为注释。
 *
 * 处理模式：
 *   const XXX = require('...');        → 删除（类已全局可用）
 *   const { createApp } = require('...'); → 删除（createApp 已全局可用）
 *   require('...')  (内联调用)         → 删除或替换
 */
function stripRequireCalls(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf-8');

  // 1. 移除顶层 const XXX = require('...'); 行
  //    匹配: const XxxProvider = require('../core/interfaces/XxxProvider.js');
  content = content.replace(
    /^const\s+\w+\s*=\s*require\(['"][^'"]+[']\);?\s*$/gm,
    '// [browser] 上述模块已通过 <script> 标签全局加载'
  );

  // 2. 移除顶层 const { createApp } = require('...'); 行
  content = content.replace(
    /^const\s+\{\s*\w+\s*\}\s*=\s*require\(['"][^'"]+[']\);?\s*$/gm,
    '// [browser] 上述模块已通过 <script> 标签全局加载'
  );

  // 3. 移除顶层 const { createApp } = require('...'); 行（无分号）
  content = content.replace(
    /^const\s+\{\s*\w+\s*\}\s*=\s*require\(['"][^'"]+[']\)\s*$/gm,
    '// [browser] 上述模块已通过 <script> 标签全局加载'
  );

  // 4. 处理内联 require 调用，如: new (require('./core/services/SettingsService.js'))({...})
  //    替换为直接使用全局类名
  content = content.replace(
    /require\(['"](?:\.\/)?(?:\.\.\/)*(?:core\/(?:services\/|search\/|utils\/|models\/|interfaces\/))?(\w+)\.js['"]\)/g,
    (match, className) => className
  );

  // 5. 处理 require('electron') 等内联 Node.js 模块调用
  //    在浏览器环境中用 try-catch 包裹的 require('electron') 需要特殊处理
  //    将 require('electron') 替换为 undefined（外层已有 try-catch）
  content = content.replace(
    /require\(['"]electron['"]\)/g,
    'undefined'
  );

  // 6. 移除对 Node.js 内置模块的 require（fs, path, os, https, http）
  //    这些在 UToolsFileProvider/UToolsHttpProvider 中被 import 但实际通过 window.emotionCan 使用
  content = content.replace(
    /^const\s+(fs|path|os|https|http)\s*=\s*require\(['"](fs|path|os|https|http)[']\);?\s*$/gm,
    '// [browser] Node.js 模块 "$1" 在浏览器中不可用，相关功能通过 preload.js (window.emotionCan) 提供'
  );

  // 7. 处理 core.js 中的 module.exports 块
  //    源码已改为条件导出（if typeof module !== 'undefined'），
  //    在浏览器中会安全跳过，但块内仍含 require() 调用。
  //    如果存在旧的无保护格式，也一并处理。
  //    a) 移除旧格式：无保护的 module.exports = {...};
  content = content.replace(
    /\/\/ 导出所有模块\nmodule\.exports\s*=\s*\{[\s\S]*?\};/g,
    `// 导出所有模块（浏览器兼容）
// 在浏览器环境中，所有类已经是全局变量，只需暴露 createApp
if (typeof window !== 'undefined') {
  window.createApp = createApp;
}`
  );
  //    b) 新格式已有条件检查，浏览器中安全跳过，无需额外处理

  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * 递归处理所有前端 JS 文件（排除 preload.js）
 */
function processFrontendJs(clientDir) {
  for (const relPath of FRONTEND_SCRIPT_ORDER) {
    const fullPath = path.join(clientDir, relPath);
    stripRequireCalls(fullPath);
  }
  // 处理 script.js
  stripRequireCalls(path.join(clientDir, 'script.js'));
}

/**
 * 修改 index.html：移除旧的 <script src="script.js">，
 * 替换为按依赖顺序加载所有前端 JS 文件的 <script> 标签
 */
function injectScriptTags(clientDir) {
  const htmlPath = path.join(clientDir, 'index.html');
  if (!fs.existsSync(htmlPath)) return;

  let html = fs.readFileSync(htmlPath, 'utf-8');

  // 构建 <script> 标签
  const scriptTags = FRONTEND_SCRIPT_ORDER
    .map(p => `    <script src="${p}"></script>`)
    .join('\n');

  // 替换原来的 <script src="script.js"></script>
  const oldScriptTag = '<script src="script.js"></script>';
  const newScriptTags = `${scriptTags}\n    <script src="script.js"></script>`;

  if (html.includes(oldScriptTag)) {
    html = html.replace(oldScriptTag, newScriptTags);
  } else {
    // 如果没找到，在 </body> 前注入
    html = html.replace('</body>', `${newScriptTags}\n</body>`);
  }

  fs.writeFileSync(htmlPath, html, 'utf-8');
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

  // 直接替换整个 @font-face 的 src 块
  // 原始格式：
  //   src:url("./fonts/materialdesignicons-webfont.eot?v=7.4.47");
  //   src:url("./fonts/materialdesignicons-webfont.eot?#iefix&v=7.4.47") format("embedded-opentype"),
  //       url("./fonts/materialdesignicons-webfont.woff2?v=7.4.47") format("woff2"),
  //       url("./fonts/materialdesignicons-webfont.woff?v=7.4.47") format("woff"),
  //       url("./fonts/materialdesignicons-webfont.ttf?v=7.4.47") format("truetype");
  // 替换为只含 woff2 和 woff 的版本：
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

function buildClient(clientName) {
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

  // 1. 复制客户端文件
  console.log('  复制客户端文件...');
  copyDir(srcClient, distClient);

  // 2. 复制 core/ 到产物目录下
  console.log('  复制 core 核心层...');
  copyDir(SRC_CORE, path.join(distClient, 'core'));

  // 3. 重写 require 路径
  console.log('  重写 require 路径...');
  rewriteRequirePaths(distClient, distClient);

  // 4. 浏览器兼容性后处理
  console.log('  执行浏览器兼容性处理...');
  processFrontendJs(distClient);
  injectScriptTags(distClient);
  fixMaterialIconsCss(distClient);

  // 5. 列出产物
  console.log('  产物文件:');
  listFiles(distClient, '    ');

  console.log(`  ✓ ${clientName} 构建完成 → ${distClient}`);
  return true;
}

function main() {
  console.log('===== 开始构建 =====');

  // 获取要构建的客户端列表
  const target = process.argv[2]; // 可选参数: 指定客户端名
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

  console.log(`待构建客户端: ${clients.join(', ')}`);

  let allOk = true;
  for (const name of clients) {
    if (!buildClient(name)) allOk = false;
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
