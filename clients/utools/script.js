/**
 * script.js - uTools 客户端入口脚本
 *
 * 职责：
 * 1. 构造平台适配器
 * 2. 注入到 core 层创建应用实例
 * 3. 初始化 UI 管理器
 * 4. 暴露全局对象供 HTML onclick 使用
 */

const { createApp } = require('../../core/core.js');
const UToolsStorageProvider = require('./adapters/UToolsStorageProvider.js');
const UToolsClipboardProvider = require('./adapters/UToolsClipboardProvider.js');
const UToolsFileProvider = require('./adapters/UToolsFileProvider.js');
const UToolsHttpProvider = require('./adapters/UToolsHttpProvider.js');
const UToolsNotificationProvider = require('./adapters/UToolsNotificationProvider.js');
const ThemeManager = require('./ui/ThemeManager.js');
const ChangelogManager = require('./ui/ChangelogManager.js');
const UIManager = require('./ui/UIManager.js');

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOutRight {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

function initUserInfo() {
  const userAvatar = document.getElementById('userAvatar');
  const userNickname = document.getElementById('userNickname');

  if (typeof utools !== 'undefined') {
    const user = utools.getUser();
    if (user) {
      userAvatar.src = user.avatar;
      userNickname.textContent = user.nickname;
    } else {
      userNickname.textContent = '未登录';
    }
  } else {
    userNickname.textContent = '表情罐头';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof utools !== 'undefined') {
    // 构造适配器
    const storageProvider = new UToolsStorageProvider();
    const clipboardProvider = new UToolsClipboardProvider();
    const fileProvider = new UToolsFileProvider();
    const httpProvider = new UToolsHttpProvider();

    // 先创建 ThemeManager（NotificationProvider 依赖它）
    const settingsService = new (require('../../core/services/SettingsService.js'))({
      storageProvider,
      fileProvider,
    });

    const themeManager = new ThemeManager({ settingsService });
    const notificationProvider = new UToolsNotificationProvider({ themeManager });

    // 创建 core 应用
    const app = createApp({
      storageProvider,
      httpProvider,
      fileProvider,
      clipboardProvider,
      notificationProvider,
    });

    // 创建 UI 管理器
    const uiManager = new UIManager({
      emotionService: app.emotionService,
      settingsService: app.settingsService,
      searchService: app.searchService,
      themeManager,
      notification: notificationProvider,
    });

    // 暴露全局对象供 HTML onclick 使用
    window._emotionApp = uiManager;
    window.emotionManager = uiManager;

    // 初始化更新日志
    window.changelogManager = new ChangelogManager();

    // 启动
    uiManager.init();
    initUserInfo();

    // 添加表情包弹窗的标签页切换
    const sourceTabs = document.querySelectorAll('.source-tab');
    sourceTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const source = tab.dataset.source;
        sourceTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.source-content').forEach(content => {
          content.style.display = 'none';
        });
        if (source === 'url') {
          document.querySelector('.url-source').style.display = 'block';
        } else {
          document.querySelector('.file-source').style.display = 'block';
        }
        if (uiManager && typeof uiManager.updateAddEmotionButtonText === 'function') {
          uiManager.updateAddEmotionButtonText(source);
        }
      });
    });
  } else {
    // 非 uTools 环境的模拟（开发调试用）
    console.warn('不在uTools环境中，使用localStorage模拟数据存储');

    window.utools = {
      db: {
        async get(key) {
          const value = localStorage.getItem(key);
          return value ? JSON.parse(value) : null;
        },
        async put(doc) {
          localStorage.setItem(doc._id, JSON.stringify(doc));
        },
        async remove(key) {
          localStorage.removeItem(key);
        }
      },
      dbStorage: {
        getItem(key) {
          const value = localStorage.getItem(key);
          return value ? JSON.parse(value) : null;
        },
        setItem(key, value) {
          localStorage.setItem(key, JSON.stringify(value));
        },
        removeItem(key) {
          localStorage.removeItem(key);
        }
      },
      copyImage(imageData) {
        console.log('模拟复制图片:', imageData);
        alert('复制成功！（这是模拟环境）');
      },
      getUser() {
        return null;
      },
      getNativeId() {
        return 'mock-device';
      },
      showOpenDialog() {
        return null;
      },
      shellOpenExternal(url) {
        window.open(url, '_blank');
      }
    };

    window.emotionCan = {
      selectFolder: async () => prompt('请输入本地存储路径（例如：C:/表情罐头）'),
      saveFile: async (fileData, targetPath) => { console.log('模拟保存文件到:', targetPath); return targetPath; },
      fileExists: () => false,
      deleteFile: () => false,
      readFile: () => null,
      getDefaultDir: () => 'C:/表情罐头',
      nodeFetch: async () => null,
      downloadImage: async () => null,
      uploadToS3Node: async () => { throw new Error('模拟环境不支持S3上传'); },
    };

    // 使用与上面相同的初始化流程
    const storageProvider = new UToolsStorageProvider();
    const clipboardProvider = new UToolsClipboardProvider();
    const fileProvider = new UToolsFileProvider();
    const httpProvider = new UToolsHttpProvider();

    const settingsService = new (require('../../core/services/SettingsService.js'))({
      storageProvider,
      fileProvider,
    });

    const themeManager = new ThemeManager({ settingsService });
    const notificationProvider = new UToolsNotificationProvider({ themeManager });

    const app = createApp({
      storageProvider,
      httpProvider,
      fileProvider,
      clipboardProvider,
      notificationProvider,
    });

    const uiManager = new UIManager({
      emotionService: app.emotionService,
      settingsService: app.settingsService,
      searchService: app.searchService,
      themeManager,
      notification: notificationProvider,
    });

    window._emotionApp = uiManager;
    window.emotionManager = uiManager;
    window.changelogManager = new ChangelogManager();

    uiManager.init();
    initUserInfo();
  }
});
