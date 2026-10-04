/**
 * ChangelogManager - 更新日志管理器（共享实现）
 *
 * 本文件为 uTools / zTools 两端共用的唯一实现（渲染逻辑），位于 core/ 共享层。
 *
 * 版本数据不在本文件中维护，而是由 `core/ui/ChangelogData.js` 单源提供，
 * 通过构造参数 `versions` 注入，避免双副本数据漂移。
 */

class ChangelogManager {
  /**
   * @param {Array} versions 版本记录数组，来源于共享的 ChangelogData。
   *   不传时回退到全局 ChangelogData（浏览器端 <script> 加载的共享数据）。
   */
  constructor(versions) {
    const data = versions
      || (typeof ChangelogData !== 'undefined' ? ChangelogData.versions : null);

    if (!Array.isArray(data)) {
      throw new Error('[ChangelogManager] 缺少版本数据 ChangelogData.versions');
    }

    this.versions = data;
    this.validate();

    this.categories = [
      { key: 'added', title: '新增', className: 'new', icon: 'mdi-plus-circle' },
      { key: 'adjusted', title: '调整', className: 'adjusted', icon: 'mdi-tune' },
      { key: 'fixed', title: '修复', className: 'fix', icon: 'mdi-bug' },
      { key: 'improved', title: '优化', className: 'improve', icon: 'mdi-check-circle' },
      { key: 'removed', title: '去除', className: 'removed', icon: 'mdi-minus-circle' }
    ];
  }

  /**
   * 自校验：捕获曾导致数据静默丢失的重复键问题。
   * JS 对象字面量中重复键会被后者覆盖，且语法上完全合法，
   * 因此必须在运行时按源码文本检查，而不是按解析后的对象检查。
   */
  validate() {
    const seen = new Set();
    this.versions.forEach(v => {
      if (seen.has(v.version)) {
        throw new Error(`[ChangelogManager] 版本号重复: ${v.version}`);
      }
      seen.add(v.version);

      const allowed = ['added', 'adjusted', 'fixed', 'improved', 'removed'];
      Object.keys(v.changes).forEach(key => {
        if (!allowed.includes(key)) {
          throw new Error(`[ChangelogManager] ${v.version} 存在未知分类: ${key}`);
        }
      });
    });
  }

  renderVersion(versionData) {
    let changesHtml = '';

    this.categories.forEach(category => {
      const items = versionData.changes[category.key];
      if (items && items.length > 0) {
        const itemList = items.map(item => `<li>${item}</li>`).join('');
        changesHtml += `
          <div class="change-category">
            <h5 class="change-category-title ${category.className}">
              <i class="mdi ${category.icon}"></i>
              ${category.title}
            </h5>
            <ul class="change-list">
              ${itemList}
            </ul>
          </div>
        `;
      }
    });

    return `
      <div class="changelog-version">
        <div class="version-header">
          <h4 class="version-tag">
            <i class="mdi mdi-new-box"></i>
            版本 ${versionData.version}
          </h4>
          <span class="version-date">${versionData.date}</span>
        </div>
        <div class="version-changes">
          ${changesHtml}
        </div>
      </div>
    `;
  }

  renderAll() {
    return this.versions.map(v => this.renderVersion(v)).join('');
  }

  addVersion(version, date, changes) {
    this.versions.unshift({ version, date, changes });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChangelogManager;
}
