import { spawn } from "node:child_process";

/** ccr CLI 命令（npm 全局安装的 shim） */
function ccrCommand(): string {
  return process.platform === "win32" ? "ccr.cmd" : "ccr";
}

function runCcr(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ccrCommand(), args, {
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ccr ${args[0]} 退出码 ${code}`))));
  });
}

export async function startService(): Promise<void> {
  await runCcr(["start"]);
}

export async function stopService(): Promise<void> {
  await runCcr(["stop"]);
}

export function openManagement(url: string): void {
  // 由 shell 层实现跨平台打开浏览器；core 只负责给出地址
  void url;
}
