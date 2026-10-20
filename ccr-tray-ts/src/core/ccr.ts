import { spawn } from "node:child_process";
import { readSettings } from "./settings";

/** ccr CLI 命令（npm 全局安装的 shim） */
function ccrCommand(): string {
  return process.platform === "win32" ? "ccr.cmd" : "ccr";
}

function runCcr(args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ccrCommand(), args, {
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: "ignore",
      env: env ? { ...process.env, ...env } : process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ccr ${args[0]} 退出码 ${code}`))));
  });
}

export async function startService(): Promise<void> {
  // 端口从托盘配置注入：管理口走 CCR_WEB_PORT（上游支持），网关口走 CCR_GATEWAY_PORT（补丁 7）
  const { managementPort, gatewayPort } = readSettings();
  await runCcr(["start"], {
    CCR_WEB_PORT: String(managementPort),
    CCR_GATEWAY_PORT: String(gatewayPort),
  });
}

export async function stopService(): Promise<void> {
  await runCcr(["stop"]);
}

/** 保存端口后自动重启生效 */
export async function restartService(): Promise<void> {
  await stopService();
  await startService();
}

/** 试绑一个端口：成功=可用，EADDRINUSE=被占用，其余按不可用算 */
export function testPort(port: number): Promise<"free" | "in-use" | "invalid"> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return Promise.resolve("invalid");
  }
  return new Promise((resolve) => {
    import("node:net").then(({ createServer }) => {
      const server = createServer();
      server.once("error", (err: NodeJS.ErrnoException) => {
        resolve(err.code === "EADDRINUSE" ? "in-use" : "invalid");
      });
      server.once("listening", () => server.close(() => resolve("free")));
      server.listen(port, "127.0.0.1");
    });
  });
}

export function openManagement(url: string): void {
  // 由 shell 层实现跨平台打开浏览器；core 只负责给出地址
  void url;
}
