/**
 * UToolsClipboardProvider - uTools 剪贴板适配器
 *
 * 实现 ClipboardProvider 接口，封装 utools.copyImage。
 */

const ClipboardProvider = require('../../../core/interfaces/ClipboardProvider.js');

class UToolsClipboardProvider extends ClipboardProvider {
  copyImage(imageData) {
    utools.copyImage(imageData);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UToolsClipboardProvider;
}
