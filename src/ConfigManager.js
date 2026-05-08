import fs from 'fs';
import path from 'path';
import os from 'os';

// ── 配置文件路径 ──────────────────────────────────────────
// 本工具只针对 Claude Code：
// MCP 服务器配置在 ~/.claude.json 的 mcpServers 字段
// Skills 存储在 Claude 的插件安装记录中
const CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json');
const CLAUDE_PLUGINS_PATH = path.join(os.homedir(), '.claude/plugins/installed_plugins.json');
const BACKUP_DIR = path.join(os.homedir(), '.claude-backups');

/**
 * ConfigManager — 核心配置管理服务（Claude Code 专用）
 *
 * 职责：
 * 1. 读写 ~/.claude.json 的 MCP 服务器配置
 * 2. 管理 Skills（基于 Claude 插件系统）
 * 3. 每次写操作前自动备份（保留最近 10 份）— 删除是永久的，备份是最后防线
 *
 * 设计要点：
 * - this.config / this.pluginsConfig 分别对应两份配置文件
 * - 所有修改操作返回 boolean，持久化由内部 saveXxx 完成（写前先备份）
 */
class ConfigManager {
  constructor() {
    this.config = null;        // ~/.claude.json 解析后的对象（null = 未检测到）
    this.pluginsConfig = null; // installed_plugins.json 解析后的对象
    this.load();
  }

  // 加载 Claude 配置：主配置 + 插件配置（可选）
  load() {
    if (fs.existsSync(CLAUDE_CONFIG_PATH)) {
      try {
        this.config = JSON.parse(fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf8'));
      } catch (error) {
        throw new Error(`Failed to load Claude config: ${error.message}`);
      }
    }
    if (fs.existsSync(CLAUDE_PLUGINS_PATH)) {
      try {
        this.pluginsConfig = JSON.parse(fs.readFileSync(CLAUDE_PLUGINS_PATH, 'utf8'));
      } catch (error) {
        console.error('Failed to load plugins config:', error);
      }
    }
  }

  // 重新扫描配置文件（用于 "r" 刷新）
  reload() {
    this.load();
  }

  // Claude Code 是否被检测到（~/.claude.json 存在且可解析）
  isAvailable() {
    return this.config !== null;
  }

  // ── 持久化 ──────────────────────────────────────────────
  // 每次 save 前自动备份，然后写入

  saveConfig() {
    if (!this.config) return false;
    try {
      this.createConfigBackup();
      fs.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (error) {
      throw new Error(`Failed to save Claude config: ${error.message}`);
    }
  }

  savePluginsConfig() {
    if (!this.pluginsConfig) return false;
    try {
      this.createPluginsBackup();
      fs.writeFileSync(CLAUDE_PLUGINS_PATH, JSON.stringify(this.pluginsConfig, null, 2), 'utf8');
      return true;
    } catch (error) {
      throw new Error(`Failed to save plugins config: ${error.message}`);
    }
  }

  // ── 备份策略 ────────────────────────────────────────────
  // 每次写入前备份到 ~/.claude-backups/，保留最近 10 份
  // 文件名格式: {name}-{ISO时间戳}.json（name 滚动删除时的前缀匹配依据）

  backup(sourcePath, backupPrefix) {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(BACKUP_DIR, `${backupPrefix}-${timestamp}.json`);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, backupPath);
      }

      // 滚动删除：只保留最近 10 个备份
      const backups = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith(`${backupPrefix}-`))
        .sort()
        .reverse();

      backups.slice(10).forEach(backup => {
        fs.unlinkSync(path.join(BACKUP_DIR, backup));
      });
    } catch (error) {
      // 备份失败不阻断主流程
      console.error('Backup failed:', error);
    }
  }

  createConfigBackup() {
    this.backup(CLAUDE_CONFIG_PATH, 'claude-config');
  }

  createPluginsBackup() {
    this.backup(CLAUDE_PLUGINS_PATH, 'plugins');
  }

  // ── MCP 服务器管理 ──────────────────────────────────────
  //
  // 数据结构说明：
  // getMcpServers() 返回视图：
  // {
  //   "serverName": { name: "serverName", enabled: bool, config: {...} }
  // }
  //
  // 底层存储：~/.claude.json 的 { mcpServers: { name: { ..., disabled: bool } } }

  getMcpServers() {
    const servers = this.config?.mcpServers || {};
    const result = {};

    for (const [name, config] of Object.entries(servers)) {
      result[name] = {
        name,
        enabled: !config.disabled,
        config
      };
    }

    return result;
  }

  // 翻转 disabled 字段（启用↔禁用）
  toggleMcpServer(name) {
    if (!this.config?.mcpServers?.[name]) return false;

    this.config.mcpServers[name].disabled = !this.config.mcpServers[name].disabled;
    return this.saveConfig();
  }

  // 永久删除 MCP 服务器（无回收站，写前自动备份兜底）
  deleteMcpServer(name) {
    if (!this.config?.mcpServers?.[name]) return false;

    delete this.config.mcpServers[name];
    return this.saveConfig();
  }

  // ── Skills 管理 ─────────────────────────────────────────
  // Skills 存储在 installed_plugins.json
  // pluginKey 格式: "name@marketplace"

  getSkills() {
    if (!this.pluginsConfig?.plugins) {
      return {};
    }

    const skills = {};
    for (const [pluginKey, instances] of Object.entries(this.pluginsConfig.plugins)) {
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
    if (!this.pluginsConfig?.plugins?.[pluginKey]) return false;

    const instances = this.pluginsConfig.plugins[pluginKey];
    if (instances && instances.length > 0) {
      instances[0].disabled = !instances[0].disabled;
      return this.savePluginsConfig();
    }
    return false;
  }

  deleteSkill(pluginKey) {
    if (!this.pluginsConfig?.plugins?.[pluginKey]) return false;

    delete this.pluginsConfig.plugins[pluginKey];
    return this.savePluginsConfig();
  }
}

export { ConfigManager, CLAUDE_CONFIG_PATH, CLAUDE_PLUGINS_PATH };
