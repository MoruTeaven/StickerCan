/**
 * UToolsStorageProvider - uTools 存储适配器
 *
 * 实现 StorageProvider 接口，封装 uTools 的 db / dbStorage API。
 */

const StorageProvider = require('../core/interfaces/StorageProvider.js');

class UToolsStorageProvider extends StorageProvider {
  getNativeId() {
    return utools.getNativeId();
  }

  getItem(key) {
    return utools.dbStorage.getItem(key);
  }

  setItem(key, value) {
    utools.dbStorage.setItem(key, value);
  }

  removeItem(key) {
    utools.dbStorage.removeItem(key);
  }

  async getDoc(id) {
    return await utools.db.promises.get(id);
  }

  async putDoc(doc) {
    const result = await utools.db.promises.put(doc);
    return !!(result && result.ok !== false);
  }

  async removeDoc(id) {
    try {
      const doc = await utools.db.promises.get(id);
      if (doc && doc._rev) {
        await utools.db.promises.remove(doc._id, doc._rev);
      }
    } catch (e) {
      // 忽略
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UToolsStorageProvider;
}
