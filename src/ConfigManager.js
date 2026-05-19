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
// 暂时移除的 MCP 服务器存放处（全局移除池）：{ "serverName": { ...原配置 } }
const REMOVED_MCP_PATH = path.join(os.homedir(), '.claude-removed-mcp.json');

/**
 * ConfigManager — 核心配置管理服务（Claude Code 专用）
 *
 * 职责：
 * 1. 读写 ~/.claude.json 的 MCP 服务器配置
 * 2. 管理 Skills（基于 Claude 插件系统）
 * 3. 每次写操作前自动备份（保留最近 10 份）
 *
 * 核心语义 —— 每个条目只有两种操作：
 * - 暂时移除：MCP 移入全局移除池（~/.claude-removed-mcp.json），Skills 置 disabled 标志；数据都保留
 * - 恢复：把暂时移除的条目加回生效配置
 * 没有永久删除。
 *
 * 设计要点：
 * - this.config / this.pluginsConfig / this.removedMcp 对应三份 JSON 数据
 * - 所有修改操作返回 boolean，持久化由内部 saveXxx 完成（写前先备份）
 */
class ConfigManager {
  constructor() {
    this.config = null;        // ~/.claude.json 解析后的对象（null = 未检测到）
    this.pluginsConfig = null; // installed_plugins.json 解析后的对象
    this.removedMcp = {};      // 移除池：暂时移除的 MCP 服务器
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
    this.removedMcp = {};
    if (fs.existsSync(REMOVED_MCP_PATH)) {
      try {
        this.removedMcp = JSON.parse(fs.readFileSync(REMOVED_MCP_PATH, 'utf8'));
      } catch (error) {
        console.error('Failed to load removed MCP pool:', error);
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

  // 移除池本身就是兜底数据，直接写、不滚备份
  saveRemovedMcp() {
    try {
      fs.writeFileSync(REMOVED_MCP_PATH, JSON.stringify(this.removedMcp, null, 2), 'utf8');
      return true;
    } catch (error) {
      throw new Error(`Failed to save removed MCP pool: ${error.message}`);
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
  // getMcpServers() 返回视图（生效条目 + 移除池条目合并）：
  // {
  //   "serverName": { name, enabled, removed, config }
  // }
  //
  // 底层存储：
  // - 生效：~/.claude.json 的 { mcpServers: { name: {...} } }
  // - 暂时移除：~/.claude-removed-mcp.json 的 { name: {...原配置} }

  getMcpServers() {
    const result = {};

    const servers = this.config?.mcpServers || {};
    for (const [name, config] of Object.entries(servers)) {
      result[name] = {
        name,
        enabled: !config.disabled,
        removed: false,
        config
      };
    }

    for (const [name, config] of Object.entries(this.removedMcp)) {
      // 同名条目已生效时以生效为准，不显示移除池里的旧副本
      if (!result[name]) {
        result[name] = {
          name,
          enabled: false,
          removed: true,
          config
        };
      }
    }

    return result;
  }

  // 暂时移除：从 mcpServers 移入全局移除池（配置完整保留，可随时恢复）
  removeMcpServer(name) {
    if (!this.config?.mcpServers?.[name]) return false;

    this.removedMcp[name] = this.config.mcpServers[name];
    delete this.config.mcpServers[name];
    return this.saveConfig() && this.saveRemovedMcp();
  }

  // 恢复：从移除池写回 mcpServers（保留原配置的所有字段）
  restoreMcpServer(name) {
    if (!this.removedMcp[name]) return false;
    // 防止覆盖生效中的同名条目
    if (this.config?.mcpServers?.[name]) return false;

    this.config.mcpServers[name] = this.removedMcp[name];
    delete this.removedMcp[name];
    return this.saveConfig() && this.saveRemovedMcp();
  }

  // ── Skills 管理 ─────────────────────────────────────────
  // Skills 存储在 installed_plugins.json
  // pluginKey 格式: "name@marketplace"
  // 暂时移除 = 置 disabled 标志（数据保留，Claude Code 原生支持），恢复 = 清除标志

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

  // 暂时移除：置 disabled 标志（不卸载、不删记录）
  removeSkill(pluginKey) {
    return this.setSkillDisabled(pluginKey, true);
  }

  // 恢复：清除 disabled 标志
  restoreSkill(pluginKey) {
    return this.setSkillDisabled(pluginKey, false);
  }

  setSkillDisabled(pluginKey, disabled) {
    if (!this.pluginsConfig?.plugins?.[pluginKey]) return false;

    const instances = this.pluginsConfig.plugins[pluginKey];
    if (instances && instances.length > 0) {
      instances[0].disabled = disabled;
      return this.savePluginsConfig();
    }
    return false;
  }
}

export { ConfigManager, CLAUDE_CONFIG_PATH, CLAUDE_PLUGINS_PATH };
