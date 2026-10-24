import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * 开机自启，双平台：
 * - Windows：HKCU\Software\Microsoft\Windows\CurrentVersion\Run 注册表项
 * - Linux：XDG autostart（~/.config/autostart/*.desktop）
 */
export function isAutostartEnabled(exePath: string): boolean {
  return process.platform === "win32" ? win32IsEnabled(exePath) : linuxIsEnabled(exePath);
}

export function setAutostartEnabled(exePath: string, enabled: boolean): void {
  if (process.platform === "win32") win32Set(exePath, enabled);
  else linuxSet(exePath, enabled);
}

const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_NAME = "CCRTray";

// 注意：reg.exe 的报错/成功提示按系统 OEM 代码页（中文系统是 GBK）输出，
// 继承的 stderr 接到 UTF-8 终端就是乱码，所以这里全部吞掉输出、只看退出码。
function win32IsEnabled(_exePath: string): boolean {
  const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
  const r = spawnSync("reg.exe", ["query", RUN_KEY, "/v", RUN_NAME], { stdio: ["ignore", "ignore", "ignore"] });
  return r.status === 0;
}

function win32Set(exePath: string, enabled: boolean): void {
  const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
  if (enabled) {
    spawnSync("reg.exe", ["add", RUN_KEY, "/v", RUN_NAME, "/t", "REG_SZ", "/d", exePath, "/f"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } else {
    spawnSync("reg.exe", ["delete", RUN_KEY, "/v", RUN_NAME, "/f"], { stdio: ["ignore", "ignore", "ignore"] });
  }
}

function desktopFilePath(): string {
  return join(homedir(), ".config", "autostart", "ccr-tray.desktop");
}

function linuxIsEnabled(_exePath: string): boolean {
  return existsSync(desktopFilePath());
}

function linuxSet(exePath: string, enabled: boolean): void {
  const file = desktopFilePath();
  if (enabled) {
    mkdirSync(join(homedir(), ".config", "autostart"), { recursive: true });
    writeFileSync(
      file,
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=CCR Tray",
        `Exec=${exePath}`,
        "X-GNOME-Autostart-enabled=true",
        "",
      ].join("\n"),
      "utf8",
    );
  } else if (existsSync(file)) {
    unlinkSync(file);
  }
}

/** 读取当前应写入的自启路径（打包后为 exe，开发期为 electron 入口） */
export function currentExePath(): string {
  if (process.platform === "win32") return process.execPath;
  return process.env.APPIMAGE ?? process.execPath;
}

export function desktopFileRaw(): string | undefined {
  try {
    return readFileSync(desktopFilePath(), "utf8");
  } catch {
    return undefined;
  }
}
