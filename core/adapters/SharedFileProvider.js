/**
 * SharedFileProvider - 跨平台文件适配器共享实现
 *
 * 继承 FileProvider 接口，将平台全局对象（utools / ztools）作为构造参数注入，
 * 消除两端适配器的逐字节重复。客户端适配器只需一行薄包装：
 *
 *   class UToolsFileProvider extends SharedFileProvider {
 *     constructor() { super(typeof utools !== 'undefined' ? utools : null); }
 *   }
 *
 * 所有 Node.js 能力仍通过 preload.js（window.emotionCan）桥接。
 */

const FileProvider = require('../interfaces/FileProvider.js');

class SharedFileProvider extends FileProvider {
  constructor(platform = null) {
    super();
    this.platform = platform;
  }

  async selectFolder() {
    // 优先使用 window.emotionCan（preload.js 暴露）
    if (window.emotionCan && typeof window.emotionCan.selectFolder === 'function') {
      return await window.emotionCan.selectFolder();
    }

    // 回退: 平台原生 showOpenDialog
    if (this.platform && this.platform.showOpenDialog) {
      try {
        const result = await this.platform.showOpenDialog({
          properties: ['openDirectory', 'createDirectory']
        });
        if (Array.isArray(result) && result.length > 0) {
          return result[0];
        }
      } catch (e) {
        // 继续尝试
      }
    }

    // 最终回退: 返回默认目录
    return this.getDefaultDir();
  }

  async saveFile(fileData, targetPath) {
    if (window.emotionCan && typeof window.emotionCan.saveFile === 'function') {
      return await window.emotionCan.saveFile(fileData, targetPath);
    }
    throw new Error('文件保存功能不可用（preload.js 未加载）');
  }

  fileExists(filePath) {
    if (window.emotionCan && typeof window.emotionCan.fileExists === 'function') {
      return window.emotionCan.fileExists(filePath);
    }
    return false;
  }

  deleteFile(filePath) {
    if (window.emotionCan && typeof window.emotionCan.deleteFile === 'function') {
      return window.emotionCan.deleteFile(filePath);
    }
    return false;
  }

  async readFile(filePath) {
    if (window.emotionCan && typeof window.emotionCan.readFile === 'function') {
      return window.emotionCan.readFile(filePath);
    }
    return null;
  }

  getDefaultDir() {
    if (window.emotionCan && typeof window.emotionCan.getDefaultDir === 'function') {
      return window.emotionCan.getDefaultDir();
    }
    return '';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SharedFileProvider;
}
