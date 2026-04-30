import fs from 'fs';
import path from 'path';
import os from 'os';

// CCR (Claude Code Router) 配置文件路径
const CCR_CONFIG_PATH = path.join(os.homedir(), '.claude-code-router', 'config.json');
const CCR_BACKUP_DIR = path.join(os.homedir(), '.claude-backups');

// Router 支持的规则类型 — key 对应 config.json 中 Router 对象的字段名
export const ROUTER_RULES = [
  { key: 'default', label: 'Default', desc: '默认路由' },
  { key: 'background', label: 'Background', desc: '后台任务' },
  { key: 'think', label: 'Think', desc: '思考/推理' },
  { key: 'longContext', label: 'Long Context', desc: '长上下文' },
  { key: 'webSearch', label: 'Web Search', desc: '网页搜索' },
  { key: 'image', label: 'Image', desc: '图像/多模态' }
];

/**
 * CcrConfigManager — Claude Code Router 配置管理
 *
 * CCR 是第三方工具，允许用户为不同任务类型指定不同的 AI 模型路由。
 * 配置文件格式：{ Providers: [...], Router: { default: "provider,model", ... } }
 *
 * Router 值格式："ProviderName" 或 "ProviderName,model"
 */
export class CcrConfigManager {
  constructor() {
    this.config = null;
    this.configPath = CCR_CONFIG_PATH;
    this.load();
  }

  load() {
    if (!fs.existsSync(this.configPath)) {
      this.config = null;   // null 表示 CCR 未安装
      return;
    }
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to load CCR config: ${error.message}`);
    }
  }

  reload() {
    this.load();
  }

  // 返回 false 时，页面显示 "CCR 未安装" 提示
  isAvailable() {
    return this.config !== null;
  }

  getConfig() {
    return this.config;
  }

  getProviders() {
    return this.config?.Providers || [];
  }

  getProvider(name) {
    return this.getProviders().find(p => p.name === name);
  }

  getRouter() {
    return this.config?.Router || {};
  }

  getRouterRule(ruleKey) {
    const router = this.getRouter();
    return router[ruleKey] || '';
  }

  // 解析路由值 "ProviderName,model" → { provider, model }
  parseRouterValue(value) {
    if (!value) return { provider: '', model: '' };
    const parts = value.split(',');
    return { provider: parts[0] || '', model: parts[1] || '' };
  }

  getProviderModels(providerName) {
    const provider = this.getProvider(providerName);
    return provider?.models || [];
  }

  // 获取所有 Provider+Model 组合列表，供编辑时的选择菜单
  getAllProviderModelOptions() {
    const options = [];
    for (const provider of this.getProviders()) {
      if (provider.models && provider.models.length > 0) {
        for (const model of provider.models) {
          options.push({
            provider: provider.name,
            model,
            label: `${provider.name},${model}`
          });
        }
      } else {
        options.push({
          provider: provider.name,
          model: '',
          label: provider.name
        });
      }
    }
    return options;
  }

  // 设置路由规则 — 写入 "Provider,model" 到 Router[ruleKey]
  setRouterRule(ruleKey, providerName, model) {
    if (!this.config) throw new Error('CCR config not loaded');
    if (!this.config.Router) this.config.Router = {};

    const value = model ? `${providerName},${model}` : providerName;
    this.config.Router[ruleKey] = value;
    return this.save();
  }

  // 清空路由规则
  clearRouterRule(ruleKey) {
    if (!this.config) throw new Error('CCR config not loaded');
    if (!this.config.Router) this.config.Router = {};
    this.config.Router[ruleKey] = '';
    return this.save();
  }

  save() {
    try {
      this.createBackup();
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (error) {
      throw new Error(`Failed to save CCR config: ${error.message}`);
    }
  }

  createBackup() {
    try {
      if (!fs.existsSync(CCR_BACKUP_DIR)) {
        fs.mkdirSync(CCR_BACKUP_DIR, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(CCR_BACKUP_DIR, `ccr-config-${timestamp}.json`);
      if (fs.existsSync(this.configPath)) {
        fs.copyFileSync(this.configPath, backupPath);
      }
      const backups = fs.readdirSync(CCR_BACKUP_DIR)
        .filter(f => f.startsWith('ccr-config-'))
        .sort()
        .reverse();
      backups.slice(10).forEach(backup => {
        fs.unlinkSync(path.join(CCR_BACKUP_DIR, backup));
      });
    } catch (error) {
      // 备份失败不影响主流程
    }
  }
}
