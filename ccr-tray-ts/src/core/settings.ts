import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * 托盘自身配置：管理端口 + 服务端口。
 * Windows 为 %APPDATA%/ccr-tray/settings.json；
 * Linux 按 XDG 约定取 ~/.config/ccr-tray/settings.json。
 * 每次 readSettings() 都重新读文件 —— 端口保存后托盘无需重启即生效。
 */

export interface TraySettings {
  managementPort: number;
  gatewayPort: number;
  /** 托盘启动时若服务没在跑，自动拉起（默认开） */
  autoStartService: boolean;
}

export const DEFAULT_SETTINGS: TraySettings = {
  managementPort: 3458,
  gatewayPort: 40229, // 与改动前 status.ts 的硬编码值一致
  autoStartService: true,
};

function settingsDir(): string {
  return process.env.APPDATA
    ? join(process.env.APPDATA, "ccr-tray")
    : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "ccr-tray");
}

function settingsFile(): string {
  return join(settingsDir(), "settings.json");
}

function sanitize(raw: unknown): TraySettings {
  const result = { ...DEFAULT_SETTINGS };
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>;
    const mgmt = Number(o.managementPort);
    const gw = Number(o.gatewayPort);
    if (Number.isInteger(mgmt) && mgmt >= 1 && mgmt <= 65535) result.managementPort = mgmt;
    if (Number.isInteger(gw) && gw >= 1 && gw <= 65535) result.gatewayPort = gw;
    if (typeof o.autoStartService === "boolean") result.autoStartService = o.autoStartService;
  }
  return result;
}

export function readSettings(): TraySettings {
  try {
    if (existsSync(settingsFile())) {
      return sanitize(JSON.parse(readFileSync(settingsFile(), "utf8")));
    }
  } catch {
    /* 文件损坏按默认处理 */
  }
  return { ...DEFAULT_SETTINGS };
}

/** 只应用合法字段，非法值跳过（保留现有值），与主进程 save-ports 的校验一致 */
export function writeSettings(update: Partial<TraySettings>): TraySettings {
  const next = readSettings();
  const mgmt = Number(update.managementPort);
  const gw = Number(update.gatewayPort);
  if (Number.isInteger(mgmt) && mgmt >= 1 && mgmt <= 65535) next.managementPort = mgmt;
  if (Number.isInteger(gw) && gw >= 1 && gw <= 65535) next.gatewayPort = gw;
  if (typeof update.autoStartService === "boolean") next.autoStartService = update.autoStartService;
  mkdirSync(settingsDir(), { recursive: true });
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2), "utf8");
  return next;
}
