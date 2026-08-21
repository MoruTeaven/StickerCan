/**
 * core.js - 核心层入口
 *
 * 聚合所有核心模块，提供统一的初始化入口。
 * 客户端通过 createApp(deps) 注入平台适配器，获取完整的业务服务实例。
 *
 * 用法：
 *   const { createApp } = require('./core/core.js');
 *   const app = createApp({
 *     storageProvider: uToolsStorageProvider,
 *     httpProvider: uToolsHttpProvider,
 *     fileProvider: uToolsFileProvider,
 *     clipboardProvider: uToolsClipboardProvider,
 *     notificationProvider: uToolsNotificationProvider,
 *   });
 *   await app.emotionService.loadData();
 *   await app.settingsService.loadSettings();
 */

const SettingsService = require('./services/SettingsService.js');
const EmotionService = require('./services/EmotionService.js');
const SearchService = require('./services/SearchService.js');

/**
 * 创建应用实例
 * @param {object} deps - 平台适配器依赖
 * @param {object} deps.storageProvider - 存储适配器
 * @param {object} deps.httpProvider - HTTP 适配器
 * @param {object} deps.fileProvider - 文件适配器
 * @param {object} deps.clipboardProvider - 剪贴板适配器
 * @param {object} deps.notificationProvider - 通知适配器
 * @returns {object} { emotionService, settingsService, searchService }
 */
function createApp(deps = {}) {
  const settingsService = new SettingsService({
    storageProvider: deps.storageProvider,
    fileProvider: deps.fileProvider,
  });

  const emotionService = new EmotionService({
    storageProvider: deps.storageProvider,
    httpProvider: deps.httpProvider,
    fileProvider: deps.fileProvider,
    clipboardProvider: deps.clipboardProvider,
    notificationProvider: deps.notificationProvider,
    settingsService,
  });

  const searchService = new SearchService({
    httpProvider: deps.httpProvider,
    emotionService,
    notificationProvider: deps.notificationProvider,
  });

  return {
    settingsService,
    emotionService,
    searchService,
  };
}

// 导出所有模块
module.exports = {
  createApp,

  // 接口
  StorageProvider: require('./interfaces/StorageProvider.js'),
  ClipboardProvider: require('./interfaces/ClipboardProvider.js'),
  FileProvider: require('./interfaces/FileProvider.js'),
  HttpProvider: require('./interfaces/HttpProvider.js'),
  NotificationProvider: require('./interfaces/NotificationProvider.js'),
  SearchProvider: require('./interfaces/SearchProvider.js'),

  // 模型
  Emotion: require('./models/Emotion.js'),
  Settings: require('./models/Settings.js'),

  // 工具
  CryptoUtils: require('./utils/CryptoUtils.js'),
  MimeUtils: require('./utils/MimeUtils.js'),
  HtmlUtils: require('./utils/HtmlUtils.js'),

  // 搜索源
  SearchSourceBase: require('./search/SearchSourceBase.js'),
  ApiHzSearchSource: require('./search/ApiHzSearchSource.js'),
  BaiduSearchSource: require('./search/BaiduSearchSource.js'),
  SogouSearchSource: require('./search/SogouSearchSource.js'),
  TangdouziSearchSource: require('./search/TangdouziSearchSource.js'),
  YujianSearchSource: require('./search/YujianSearchSource.js'),

  // 服务
  SettingsService,
  EmotionService,
  SearchService,
};
