import fs from 'fs';
import path from 'path';
import os from 'os';

// ── 配置文件路径 ──────────────────────────────────────────
// Claude Code 通过 ~/.claude.json 管理 MCP 服务器配置
// Gemini Code Assist 通过 ~/.gemini/settings.json 管理
// Skills 存储在 Claude 的插件安装记录中
const CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json');
const CLAUDE_PLUGINS_PATH = path.join(os.homedir(), '.claude/plugins/installed_plugins.json');
const GEMINI_CONFIG_PATH = path.join(os.homedir(), '.gemini/settings.json');
const BACKUP_DIR = path.join(os.homedir(), '.claude-backups');

// 支持的 CLI 列表 — 扩展新 CLI 时只需在这里加 key 并在 detectAndLoadCLIs 加检测逻辑
export const SUPPORTED_CLIS = {
  CLAUDE: 'claude',
  GEMINI: 'gemini'
};

/**
 * ConfigManager — 核心配置管理服务
 *
 * 职责：
 * 1. 自动检测已安装的 CLI（Claude Code / Gemini）
 * 2. 读写各 CLI 的 MCP 服务器配置
 * 3. 管理 Skills（基于 Claude 插件系统）
 * 4. 每次写操作前自动备份（保留最近 10 份）
 *
 * 设计要点：
 * - this.managers[cliId] = { config, configPath }  每个 CLI 一个管理者
 * - getMcpServers() 跨 CLI 合并同名 MCP，返回聚合视图
 * - 所有修改操作返回 boolean，通过调用方 saveConfig 持久化
 */
class ConfigManager {
  constructor() {
    this.managers = {};        // { claude: { config, configPath }, gemini: {...} }
    this.availableCLIs = [];   // 已检测到的 CLI ID 列表
    this.detectAndLoadCLIs();
  }

  // 扫描 ~/.claude.json 和 ~/.gemini/settings.json，加载已安装的 CLI
  detectAndLoadCLIs() {
    if (fs.existsSync(CLAUDE_CONFIG_PATH)) {
      try {
        const data = fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf8');
        this.managers[SUPPORTED_CLIS.CLAUDE] = {
          config: JSON.parse(data),
          configPath: CLAUDE_CONFIG_PATH
        };

        // Claude 的 Skills 配置在单独的插件文件中
        if (fs.existsSync(CLAUDE_PLUGINS_PATH)) {
          const pluginsData = fs.readFileSync(CLAUDE_PLUGINS_PATH, 'utf8');
          this.managers[SUPPORTED_CLIS.CLAUDE].pluginsConfig = JSON.parse(pluginsData);
        }

        this.availableCLIs.push(SUPPORTED_CLIS.CLAUDE);
      } catch (error) {
        console.error('Failed to load Claude config:', error);
      }
    }

    if (fs.existsSync(GEMINI_CONFIG_PATH)) {
      try {
        const data = fs.readFileSync(GEMINI_CONFIG_PATH, 'utf8');
        this.managers[SUPPORTED_CLIS.GEMINI] = {
          config: JSON.parse(data),
          configPath: GEMINI_CONFIG_PATH
        };
        this.availableCLIs.push(SUPPORTED_CLIS.GEMINI);
      } catch (error) {
        console.error('Failed to load Gemini config:', error);
      }
    }
  }

  // 重新扫描配置文件（用于 "r" 刷新）
  reload() {
    this.managers = {};
    this.availableCLIs = [];
    this.detectAndLoadCLIs();
  }

  getAvailableCLIs() {
    return this.availableCLIs;
  }

  // ── 持久化 ──────────────────────────────────────────────
  // 每条 save 操作前自动备份，然后原子写入

  saveConfig(cli) {
    try {
      const manager = this.managers[cli];
      if (!manager) return false;

      this.createBackup(cli);

      fs.writeFileSync(
        manager.configPath,
        JSON.stringify(manager.config, null, 2),
        'utf8'
      );
      return true;
    } catch (error) {
      throw new Error(`Failed to save ${cli} config: ${error.message}`);
    }
  }

  savePluginsConfig() {
    try {
      const manager = this.managers[SUPPORTED_CLIS.CLAUDE];
      if (!manager?.pluginsConfig) return false;

      this.createPluginsBackup();

      fs.writeFileSync(
        CLAUDE_PLUGINS_PATH,
        JSON.stringify(manager.pluginsConfig, null, 2),
        'utf8'
      );
      return true;
    } catch (error) {
      throw new Error(`Failed to save plugins config: ${error.message}`);
    }
  }

  // ── 备份策略 ────────────────────────────────────────────
  // 每次写入前备份到 ~/.claude-backups/，保留最近 10 份
  // 文件名格式: {cli}-{configName}-{ISO时间戳}.json

  createBackup(cli) {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const manager = this.managers[cli];
      const filename = path.basename(manager.configPath, path.extname(manager.configPath));
      const backupPath = path.join(BACKUP_DIR, `${cli}-${filename}-${timestamp}.json`);

      fs.copyFileSync(manager.configPath, backupPath);

      // 滚动删除：只保留最近 10 个备份
      const prefix = `${cli}-${filename}-`;
      const backups = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith(prefix))
        .sort()
        .reverse();

      backups.slice(10).forEach(backup => {
        fs.unlinkSync(path.join(BACKUP_DIR, backup));
      });
    } catch (error) {
      console.error('Backup failed:', error);
    }
  }

  createPluginsBackup() {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(BACKUP_DIR, `plugins-${timestamp}.json`);

      if (fs.existsSync(CLAUDE_PLUGINS_PATH)) {
        fs.copyFileSync(CLAUDE_PLUGINS_PATH, backupPath);
      }

      const backups = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('plugins-'))
        .sort()
        .reverse();

      backups.slice(10).forEach(backup => {
        fs.unlinkSync(path.join(BACKUP_DIR, backup));
      });
    } catch (error) {
      console.error('Plugins backup failed:', error);
    }
  }

  // ── MCP 服务器管理 ──────────────────────────────────────
  //
  // 数据结构说明：
  // getMcpServers() 返回聚合视图（跨 CLI 合并）：
  // {
  //   "serverName": {
  //     name: "serverName",
  //     clis: {
  //       claude: { enabled: bool, config: {...} },
  //       gemini: { enabled: bool, config: {...} }
  //     }
  //   }
  // }
  //
  // 底层存储：每个 CLI 各自维护 { mcpServers: { name: { ..., disabled: bool } } }

  // 跨 CLI 合并所有 MCP 服务器 — 同名 MCP 聚合 clis 映射
  getMcpServers() {
    const allServers = {};

    for (const cli of this.availableCLIs) {
      const manager = this.managers[cli];
      const servers = manager.config?.mcpServers || {};

      for (const [name, config] of Object.entries(servers)) {
        if (!allServers[name]) {
          allServers[name] = {
            name,
            config,
            clis: {}
          };
        }

        allServers[name].clis[cli] = {
          enabled: !config.disabled,
          config
        };
      }
    }

    return allServers;
  }

  // 翻转 disabled 字段（启用↔禁用）
  toggleMcpServer(name, cli) {
    const manager = this.managers[cli];
    if (!manager?.config?.mcpServers?.[name]) return false;

    manager.config.mcpServers[name].disabled = !manager.config.mcpServers[name].disabled;
    return this.saveConfig(cli);
  }

  // 删除 MCP 服务器
  // @param cli - 指定 CLI 则只从该 CLI 删除；null 则从所有 CLI 删除
  deleteMcpServer(name, cli = null) {
    if (cli) {
      const manager = this.managers[cli];
      if (manager?.config?.mcpServers?.[name]) {
        delete manager.config.mcpServers[name];
        return this.saveConfig(cli);
      }
    } else {
      let success = false;
      for (const cliId of this.availableCLIs) {
        if (this.managers[cliId]?.config?.mcpServers?.[name]) {
          delete this.managers[cliId].config.mcpServers[name];
          this.saveConfig(cliId);
          success = true;
        }
      }
      return success;
    }
    return false;
  }

  // 同步 MCP 配置到另一个 CLI（深拷贝避免共享引用）
  syncMcpServerTo(name, fromCli, toCli, configOverride = null) {
    let config;

    if (configOverride) {
      config = JSON.parse(JSON.stringify(configOverride));
    } else {
      const fromManager = this.managers[fromCli];
      if (!fromManager?.config?.mcpServers?.[name]) {
        throw new Error(`${name} 在 ${fromCli} 中不存在`);
      }
      config = JSON.parse(JSON.stringify(fromManager.config.mcpServers[name]));
    }

    const toManager = this.managers[toCli];
    if (!toManager) {
      throw new Error(`${toCli} 不可用`);
    }

    if (!toManager.config.mcpServers) {
      toManager.config.mcpServers = {};
    }

    toManager.config.mcpServers[name] = config;
    return this.saveConfig(toCli);
  }

  // 同步 MCP 到所有其他 CLI（有一份就复制到全部）
  syncMcpServerToAll(name, sourceCli = null) {
    if (!sourceCli) {
      for (const cli of this.availableCLIs) {
        if (this.managers[cli]?.config?.mcpServers?.[name]) {
          sourceCli = cli;
          break;
        }
      }
    }

    if (!sourceCli) {
      throw new Error(`未找到 ${name} 的配置`);
    }

    const sourceConfig = this.managers[sourceCli].config.mcpServers[name];

    for (const cli of this.availableCLIs) {
      if (cli !== sourceCli && this.managers[cli]) {
        if (!this.managers[cli].config.mcpServers) {
          this.managers[cli].config.mcpServers = {};
        }
        this.managers[cli].config.mcpServers[name] = JSON.parse(JSON.stringify(sourceConfig));
        this.saveConfig(cli);
      }
    }

    return true;
  }

  enableMcpServer(name, cli, enable) {
    const manager = this.managers[cli];
    if (!manager?.config?.mcpServers?.[name]) return false;

    manager.config.mcpServers[name].disabled = !enable;
    return this.saveConfig(cli);
  }

  // ── Skills 管理 ─────────────────────────────────────────
  // Skills 只在 Claude Code 中存在，存储在 installed_plugins.json
  // pluginKey 格式: "name@marketplace"

  getSkills() {
    const manager = this.managers[SUPPORTED_CLIS.CLAUDE];
    if (!manager?.pluginsConfig?.plugins) {
      return {};
    }

    const skills = {};
    for (const [pluginKey, instances] of Object.entries(manager.pluginsConfig.plugins)) {
      const [name, marketplace] = pluginKey.split('@');

      if (instances && instances.length > 0) {
        const instance = instances[0];
        skills[pluginKey] = {
          name,
          marketplace,
          version: instance.version,
          installPath: instance.installPath,
          installedAt: instance.installedAt,
          lastUpdated: instance.lastUpdated,
          scope: instance.scope,
          disabled: instance.disabled || false
        };
      }
    }

    return skills;
  }

  toggleSkill(pluginKey) {
    const manager = this.managers[SUPPORTED_CLIS.CLAUDE];
    if (!manager?.pluginsConfig?.plugins?.[pluginKey]) return false;

    const instances = manager.pluginsConfig.plugins[pluginKey];
    if (instances && instances.length > 0) {
      instances[0].disabled = !instances[0].disabled;
      return this.savePluginsConfig();
    }
    return false;
  }

  deleteSkill(pluginKey) {
    const manager = this.managers[SUPPORTED_CLIS.CLAUDE];
    if (!manager?.pluginsConfig?.plugins?.[pluginKey]) return false;

    delete manager.pluginsConfig.plugins[pluginKey];
    return this.savePluginsConfig();
  }
}

export { ConfigManager };
