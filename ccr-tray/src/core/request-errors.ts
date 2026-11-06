import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * CCR 请求日志库(%APPDATA%\claude-code-router\request-logs.sqlite,fork 版按请求落库)。
 * 托盘轮询 ok=0 的行,把 provider 报错转成右下角弹窗提醒。
 * 用 Node 内置 node:sqlite 只读打开(WAL 模式支持并发读),零额外依赖。
 */

/** 一条失败请求(已从响应体里提取出可读消息) */
export interface RequestErrorEvent {
  id: number;
  model: string;
  provider: string;
  statusCode: number;
  /** 从 response_body_text 的 {"error":{"message":...}} 提取,退化用 error 列/状态码 */
  message: string;
  at: string;
}

function dbFile(): string {
  const dir = process.env.APPDATA
    ? join(process.env.APPDATA, "claude-code-router")
    : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "claude-code-router");
  return join(dir, "request-logs.sqlite");
}

/** 当前最大日志 id。启动时取一次作为游标 —— 历史错误不追诉,只提醒启用之后新发生的 */
export function maxRequestLogId(): number {
  if (!existsSync(dbFile())) return 0;
  try {
    const db = new DatabaseSync(dbFile(), { open: true, readOnly: true });
    try {
      const row = db.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM request_logs").get();
      return Number((row as { m: number }).m);
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

/** 拉取 sinceId 之后新落库的失败请求(ok=0),按 id 升序;返回值里的 lastId 作为下一轮游标 */
export function pollRequestErrors(sinceId: number): { events: RequestErrorEvent[]; lastId: number } {
  if (!existsSync(dbFile())) return { events: [], lastId: sinceId };
  try {
    const db = new DatabaseSync(dbFile(), { open: true, readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT id, model, provider, status_code, response_body_text, error, gateway_error, created_at
           FROM request_logs WHERE ok = 0 AND id > ? ORDER BY id ASC LIMIT 50`,
        )
        .all(sinceId) as unknown as Array<Record<string, unknown>>;
      let lastId = sinceId;
      const events = rows.map((r) => {
        lastId = Math.max(lastId, Number(r.id));
        return {
          id: Number(r.id),
          model: String(r.model ?? ""),
          provider: String(r.provider ?? ""),
          statusCode: Number(r.status_code ?? 0),
          message: extractMessage(r),
          at: String(r.created_at ?? ""),
        };
      });
      return { events, lastId };
    } finally {
      db.close();
    }
  } catch {
    return { events: [], lastId: sinceId };
  }
}

function extractMessage(r: Record<string, unknown>): string {
  const raw = String(r.response_body_text ?? "");
  try {
    const body = JSON.parse(raw) as { error?: { message?: string } };
    if (typeof body.error?.message === "string" && body.error.message) return body.error.message;
  } catch {
    /* 非 JSON 响应,走下面的兜底 */
  }
  const fallback = String(r.error ?? "") || String(r.gateway_error ?? "");
  return fallback || `HTTP ${Number(r.status_code ?? 0)}`;
}
