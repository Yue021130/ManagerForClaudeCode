import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * ccr 服务状态文件：`ccr start` 成功时写入，包含带令牌的完整管理页 URL。
 * Windows 为 %APPDATA%\claude-code-router\service.json；
 * Linux 按 XDG 约定取 ~/.config/claude-code-router/service.json。
 */
function serviceStateFile(): string {
  const dir = process.env.APPDATA
    ? join(process.env.APPDATA, "claude-code-router")
    : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "claude-code-router");
  return join(dir, "service.json");
}

/** 读取 ccr 记录的管理页 URL（自带 RPC 令牌），读不到再退回裸地址 */
export function readManagementUrl(fallbackPort: number): string {
  try {
    const raw: unknown = JSON.parse(readFileSync(serviceStateFile(), "utf8"));
    if (
      typeof raw === "object" &&
      raw !== null &&
      "url" in raw &&
      typeof (raw as { url: unknown }).url === "string" &&
      /^https?:\/\//.test((raw as { url: string }).url)
    ) {
      return (raw as { url: string }).url;
    }
  } catch {
    /* 服务未启动或文件损坏，退回裸地址 */
  }
  return `http://127.0.0.1:${fallbackPort}/`;
}
