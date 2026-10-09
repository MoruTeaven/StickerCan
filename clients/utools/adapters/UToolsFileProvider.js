/**
 * UToolsFileProvider - uTools 文件适配器（薄包装）
 *
 * 实际实现位于 core/adapters/SharedFileProvider.js，
 * 此处仅注入 uTools 平台全局对象。
 */

const SharedFileProvider = require('@moruteaven/sticker-core/adapters/SharedFileProvider.js');

class UToolsFileProvider extends SharedFileProvider {
  constructor() {
    super(typeof utools !== 'undefined' ? utools : null);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UToolsFileProvider;
}
