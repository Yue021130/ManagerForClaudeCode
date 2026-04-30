import fs from 'fs';
import path from 'path';
import os from 'os';

// 本工具自身的配置文件路径 — 与 CLI 配置分离，互不污染
const MANAGER_CONFIG_PATH = path.join(os.homedir(), '.gwyy_ms_Manager.json');

/**
 * ManagerConfig — 本工具自身配置管理
 *
 * 存储本工具"专属"的数据（不属于任何 CLI 的数据）：
 * - trash: 回收站 — 删除 MCP 时保留一份副本，可恢复
 * - settings: 工具自身设置
 *
 * 与 ConfigManager 的区别：
 * - ConfigManager 管理 Claude/Gemini 的配置文件
 * - ManagerConfig 管理本工具自己的 ~/.gwyy_ms_Manager.json
 */
export class ManagerConfig {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(MANAGER_CONFIG_PATH)) {
        const data = fs.readFileSync(MANAGER_CONFIG_PATH, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load manager config:', error);
    }

    // 首次启动：返回默认结构
    return {
      version: 1,
      trash: {},      // { mcpName: { config, deletedAt, fromCLIs: [] } }
      settings: {
        lastUsed: null
      }
    };
  }

  saveConfig() {
    try {
      fs.writeFileSync(
        MANAGER_CONFIG_PATH,
        JSON.stringify(this.config, null, 2),
        'utf8'
      );
      return true;
    } catch (error) {
      console.error('Failed to save manager config:', error);
      return false;
    }
  }

  // 移入回收站 — 删除 MCP 时调用，保留配置副本
  moveToTrash(name, config, fromCLIs) {
    this.config.trash[name] = {
      config,
      deletedAt: new Date().toISOString(),
      fromCLIs: fromCLIs || []
    };
    this.saveConfig();
  }

  // 从回收站恢复 — 返回被删除的配置，调用方负责写回各 CLI
  restoreFromTrash(name) {
    const item = this.config.trash[name];
    if (!item) return null;

    delete this.config.trash[name];
    this.saveConfig();
    return item;
  }

  clearTrash() {
    this.config.trash = {};
    this.saveConfig();
  }

  getTrash() {
    return this.config.trash;
  }
}
