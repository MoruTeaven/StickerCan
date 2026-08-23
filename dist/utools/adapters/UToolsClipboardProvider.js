/**
 * UToolsClipboardProvider - uTools 剪贴板适配器
 *
 * 实现 ClipboardProvider 接口，封装 utools.copyImage。
 */

// [browser] 上述模块已通过 <script> 标签全局加载
class UToolsClipboardProvider extends ClipboardProvider {
  copyImage(imageData) {
    utools.copyImage(imageData);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UToolsClipboardProvider;
}
