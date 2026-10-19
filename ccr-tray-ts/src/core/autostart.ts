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
const RUN_NAME = "CCRTrayTS";

function win32IsEnabled(_exePath: string): boolean {
  try {
    const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
    const out = execFileSync("reg.exe", ["query", RUN_KEY, "/v", RUN_NAME], { encoding: "utf8" });
    return out.includes(RUN_NAME);
  } catch {
    return false;
  }
}

function win32Set(exePath: string, enabled: boolean): void {
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  if (enabled) {
    execFileSync("reg.exe", ["add", RUN_KEY, "/v", RUN_NAME, "/t", "REG_SZ", "/d", `"${exePath}"`, "/f"]);
  } else {
    try {
      execFileSync("reg.exe", ["delete", RUN_KEY, "/v", RUN_NAME, "/f"]);
    } catch {
      /* 不存在则忽略 */
    }
  }
}

function desktopFilePath(): string {
  return join(homedir(), ".config", "autostart", "ccr-tray-ts.desktop");
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
