/**
 * ZToolsClipboardProvider - ZTools 剪贴板适配器
 *
 * 实现 ClipboardProvider 接口，封装 ztools.copyImage。
 */

const ClipboardProvider = require('../../../core/interfaces/ClipboardProvider.js');

class ZToolsClipboardProvider extends ClipboardProvider {
  copyImage(imageData) {
    ztools.copyImage(imageData);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZToolsClipboardProvider;
}
