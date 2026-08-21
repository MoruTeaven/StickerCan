/**
 * UToolsFileProvider - uTools 文件适配器
 *
 * 实现 FileProvider 接口，封装 Node.js fs / path / os 模块。
 * 利用 uTools 的 preload 环境（Node.js）操作本地文件系统。
 */

const FileProvider = require('../../../core/interfaces/FileProvider.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

class UToolsFileProvider extends FileProvider {
  async selectFolder() {
    try {
      // 方式1: utools.showOpenDialog
      if (typeof utools !== 'undefined' && utools.showOpenDialog) {
        try {
          const result = await utools.showOpenDialog({
            properties: ['openDirectory', 'createDirectory']
          });
          if (Array.isArray(result) && result.length > 0) {
            return result[0];
          }
        } catch (e) {
          // 继续尝试其他方式
        }
      }

      // 方式2: electron remote
      try {
        const electron = require('electron');
        if (electron && electron.remote) {
          const dialog = electron.remote.dialog;
          if (dialog) {
            const result = await dialog.showOpenDialog({
              properties: ['openDirectory', 'createDirectory']
            });
            if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
              return result.filePaths[0];
            }
          }
        }
      } catch (e) {
        // 继续尝试
      }

      // 方式3: 返回默认目录
      return this.getDefaultDir();
    } catch (error) {
      return this.getDefaultDir();
    }
  }

  async saveFile(fileData, targetPath) {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (typeof fileData === 'string' && fileData.startsWith('data:')) {
      const base64Data = fileData.replace(/^data:\w+\/\w+;base64,/, '');
      fs.writeFileSync(targetPath, base64Data, 'base64');
    } else if (Buffer.isBuffer(fileData)) {
      fs.writeFileSync(targetPath, fileData);
    } else {
      throw new Error('不支持的文件数据格式');
    }

    return targetPath;
  }

  fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  deleteFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('删除文件失败:', error);
      return false;
    }
  }

  async readFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      const fileName = path.basename(filePath);

      return { base64, fileName };
    } catch (error) {
      console.error('读取文件失败:', error);
      return null;
    }
  }

  getDefaultDir() {
    return path.join(os.homedir(), '表情罐头');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UToolsFileProvider;
}
