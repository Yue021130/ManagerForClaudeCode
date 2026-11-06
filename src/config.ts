/**
 * config.ts — 应用配置（~/.mfcc/config.json）
 *
 * 目前只有一项：
 *   terminalTemplate — ss 恢复会话时「新开终端窗口」的命令模板。
 *   占位符：{cwd} = 会话项目目录，{cmd} = 恢复命令（claude --resume <id>）。
 *   空串 = 自动（wt → cmd /c start）。
 *
 * 读：loadConfig() 带模块级缓存；写：saveConfig() 临时文件 + rename 原子替换。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface AppConfig {
  terminalTemplate: string;
}

const DEFAULTS: AppConfig = { terminalTemplate: '' };

const configFile = (): string => path.join(os.homedir(), '.mfcc', 'config.json');

let cache: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(configFile(), 'utf8')) as Partial<AppConfig>;
    cache = { ...DEFAULTS, ...raw };
  } catch {
    cache = { ...DEFAULTS }; // 文件不存在/损坏都回落默认
  }
  return cache;
}

export function saveConfig(patch: Partial<AppConfig>): void {
  const next = { ...loadConfig(), ...patch };
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  const tmp = configFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, configFile());
  cache = next;
}
