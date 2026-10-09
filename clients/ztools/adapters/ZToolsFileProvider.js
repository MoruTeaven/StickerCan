/**
 * ZToolsFileProvider - ZTools 文件适配器（薄包装）
 *
 * 实际实现位于 core/adapters/SharedFileProvider.js，
 * 此处仅注入 zTools 平台全局对象。
 */

const SharedFileProvider = require('@moruteaven/sticker-core/adapters/SharedFileProvider.js');

class ZToolsFileProvider extends SharedFileProvider {
  constructor() {
    super(typeof ztools !== 'undefined' ? ztools : null);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZToolsFileProvider;
}
