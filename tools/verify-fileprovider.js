/**
 * verify-fileprovider.js - FileProvider 抽取后的功能验证
 *
 * 在 vm sandbox 中按构建产物的 <script> 顺序加载全部脚本，
 * 实例化两端 FileProvider，验证继承链与平台对象注入。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function makeSandbox() {
  const document = {
    documentElement: { dataset: {} },
    head: { appendChild() {} },
    querySelector: () => null,
    addEventListener: () => {},
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  };
  const sandbox = {
    console,
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

function loadScripts(ctx, dir, htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const order = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  for (const src of order) {
    const file = path.join(dir, src);
    if (!fs.existsSync(file)) throw new Error(`缺少脚本 ${src}`);
    vm.runInContext(fs.readFileSync(file, 'utf-8'), ctx, { filename: src });
  }
  return order.length;
}

function testClient(name) {
  const dir = path.join(ROOT, 'dist', name);
  const ctx = vm.createContext(makeSandbox());
  const count = loadScripts(ctx, dir, path.join(dir, 'index.html'));

  // 注入模拟平台对象
  const platformGlobal = name === 'utools' ? 'utools' : 'ztools';
  const mockPlatform = {
    showOpenDialog: async () => null,
    copyImage: () => {},
    getNativeId: () => 'test-device',
    getUser: () => null,
    db: { promises: { get: async () => null, put: async () => ({ ok: true }), remove: async () => {} } },
    dbStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setSubInput: () => {},
    setSubInputValue: () => {},
    shellOpenExternal: () => {},
    onPluginEnter: null,
  };
  // ponytail: 适配器构造时读全局 utools/ztools，sandbox 中直接设为上下文属性即可
  ctx[platformGlobal] = mockPlatform;

  const providerName = name === 'utools' ? 'UToolsFileProvider' : 'ZToolsFileProvider';
  const ProviderClass = vm.runInContext(providerName, ctx);
  const SharedClass = vm.runInContext('SharedFileProvider', ctx);
  const InterfaceClass = vm.runInContext('FileProvider', ctx);
  const instance = new ProviderClass();

  const checks = [
    [`${providerName} 是构造函数`, typeof ProviderClass === 'function'],
    ['继承自 SharedFileProvider', instance instanceof SharedClass],
    ['继承自 FileProvider（接口）', instance instanceof InterfaceClass],
    ['platform 已注入', instance.platform === mockPlatform],
    ['platform.showOpenDialog 可用', typeof instance.platform.showOpenDialog === 'function'],
    ['selectFolder 是函数', typeof instance.selectFolder === 'function'],
    ['saveFile 是函数', typeof instance.saveFile === 'function'],
    ['fileExists 是函数', typeof instance.fileExists === 'function'],
    ['deleteFile 是函数', typeof instance.deleteFile === 'function'],
    ['readFile 是函数', typeof instance.readFile === 'function'],
    ['getDefaultDir 是函数', typeof instance.getDefaultDir === 'function'],
    ['getDefaultDir 回退空串（无 emotionCan）', instance.getDefaultDir() === ''],
  ];

  // 异步验证 selectFolder 回退路径
  const promise = instance.selectFolder();
  const isPromise = promise && typeof promise.then === 'function';
  checks.push(['selectFolder 返回 Promise', isPromise]);

  console.log(`\n--- ${name} (${count} 个脚本加载成功) ---`);
  let ok = true;
  for (const [label, pass] of checks) {
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}`);
    if (!pass) ok = false;
  }
  return ok;
}

const a = testClient('utools');
const b = testClient('ztools');

const allOk = a && b;
console.log(`\n${allOk ? 'ALL PASS' : 'SOME FAILED'}`);
process.exit(allOk ? 0 : 1);
