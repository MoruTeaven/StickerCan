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

  // 4. 列出产物
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
