import { app, Notification, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import { restartService, startService, stopService, testPort } from "./core/ccr";
import { checkStatus } from "./core/status";
import { readManagementUrl } from "./core/service-state";
import { readSettings, writeSettings } from "./core/settings";
import type { MenuEvent, PortTestResult, SettingsState, StatusInfo } from "./core/types";
import { currentExePath, isAutostartEnabled, setAutostartEnabled } from "./core/autostart";
import { ElectronTrayShell } from "./shell/electron-tray";

const pollIntervalMs = 3000;
/** 黄灯（半启动）持续超过该时长视为卡住，弹一次通知 */
const yellowStuckMs = 10_000;

// Windows toast 通知依赖 AppUserModelID，不设的话开发态下系统会静默吞掉通知
const appUserModelId = "com.yue.ccrtray.261022";
app.setAppUserModelId(appUserModelId);

/**
 * toast 要求该 AUMID 在开始菜单有对应快捷方式，否则通知被系统静默丢弃。
 * 启动时确保快捷方式存在（指向当前可执行文件）。
 * 目录/文件名是 Windows 规则决定的安装期常量
 * 若将来由安装器（如 electron-builder NSIS）创建快捷方式，此逻辑仅作兜底。
 // todo 安装器 2026年10月22日21点52分
 */
const toastShortcutDir = path.join(
  process.env.APPDATA ?? path.join(app.getPath("home"), "AppData", "Roaming"),
  "Microsoft", "Windows", "Start Menu", "Programs",
);
const toastShortcutName = "CCR-YUE Tray.lnk";

function ensureToastShortcut(): void {
  try {
    fs.mkdirSync(toastShortcutDir, { recursive: true });
    const shortcut = path.join(toastShortcutDir, toastShortcutName);
    if (!fs.existsSync(shortcut)) {
      shell.writeShortcutLink(shortcut, "create", {
        target: process.execPath,
        appUserModelId,
        description: "CCR Tray",
      });
      console.log("[notify] 已创建开始菜单快捷方式（toast 通知需要）");
    }
  } catch (err) {
    console.error("[notify] 创建快捷方式失败:", err);
  }
}

function notify(title: string, body: string): void {
  console.log(`[notify] ${title} - ${body}`);
  try {
    const n = new Notification({ title, body });
    n.on("failed", (_e, error) => console.error("[notify] 发送失败:", error));
    n.show();
  } catch (err) {
    console.error("通知发送失败:", err);
  }
}

// 单实例：第二个实例直接退出，并唤起第一个
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    /* 已存在实例：聚焦/刷新菜单即可，托盘应用无窗口 */
  });

  let status: StatusInfo = { state: "stopped", managementUrl: "http://127.0.0.1:3458/", gatewayOk: false, checkedAt: 0 };
  let busy = false;
  /** 本次启动时长：服务进入 running 的时刻，停止归零 */
  let runningSince: number | null = null;
  let prevRunning = false;
  let autostartEnabled = false;
  /** 最近一次端口测试结果 / 提示条（推给设置窗口） */
  let lastPortTest: { management: PortTestResult; gateway: PortTestResult } | undefined;
  let lastNotice: string | undefined;

  // ── 状态变更通知 ──
  let prevState: "running" | "partial" | "stopped" | null = null;
  /** 通过托盘菜单手动启停/重启时置位，避免"自己点的操作"也弹通知 */
  let expectStop = false;
  let expectStart = false;
  let partialSince: number | null = null;
  let partialNotified = false;

  const shell = new ElectronTrayShell();

  function buildSettingsState(): SettingsState {
    return {
      uptimeMs: status.state === "running" && runningSince !== null ? Date.now() - runningSince : null,
      autostartEnabled,
      managementPort: readSettings().managementPort,
      gatewayPort: readSettings().gatewayPort,
      serviceState: status.state,
      busy,
      portTest: lastPortTest,
      notice: lastNotice,
    };
  }

  function pushSettings(): void {
    shell.updateSettings(buildSettingsState());
  }

  function trackStatusChange(): void {
    const st = status.state;
    if (prevState === null) {
      // 托盘启动后的第一次轮询只建立基线，不通知
      prevState = st;
    } else if (st !== prevState) {
      console.log(`[status] ${prevState} -> ${st} (expectStop=${expectStop}, expectStart=${expectStart})`);
      if (st === "stopped" && !expectStop) {
        notify("CCR-YUE 服务已停止", "路由服务意外停止！ 😣");
      } else if (st === "running" && !expectStart) {
        notify("CCR-YUE 服务已恢复运行", "路由服务已恢复！ 🥰");
      }
      prevState = st;
    }
    if (st === "stopped") expectStop = false;
    if (st === "running") expectStart = false;

    // 黄灯持续过久 → 视为启动卡住，弹一次
    if (st === "partial") {
      if (partialSince === null) {
        partialSince = Date.now();
      } else if (!partialNotified && Date.now() - partialSince >= yellowStuckMs) {
        partialNotified = true;
        notify("CCR-YUE 启动缓慢", "服务处于半启动状态已超过 10 秒，可尝试重启服务");
      }
    } else {
      partialSince = null;
      partialNotified = false;
    }
  }

  async function refresh(): Promise<void> {
    status = await checkStatus();
    // 本次启动时长口径：进入 running 开始计时，停止归零
    if (status.state === "running" && !prevRunning) runningSince = Date.now();
    if (status.state === "stopped") runningSince = null;
    prevRunning = status.state === "running";
    trackStatusChange();

    shell.setStatus(status);
    shell.refreshMenu({ status, autostartEnabled, busy });
    pushSettings();
  }

  async function handleEvent(event: MenuEvent): Promise<void> {
    switch (event.kind) {
      case "open-management":
        // 与 C# 托盘一致：优先用 service.json 里带令牌的 URL（令牌每次启动都会变）
        shell.openExternal(readManagementUrl(readSettings().managementPort));
        break;
      case "open-settings":
        pushSettings();
        shell.openSettings();
        break;
      case "settings-tick":
        pushSettings();
        break;
      case "start-service":
      case "stop-service": {
        busy = true;
        shell.refreshMenu({ status, autostartEnabled, busy });
        pushSettings();
        try {
          if (event.kind === "start-service") {
            expectStart = true;
            await startService();
          } else {
            expectStop = true;
            await stopService();
          }
        } catch (err) {
          console.error(err);
        }
        busy = false;
        await refresh();
        break;
      }
      case "toggle-autostart":
        setAutostartEnabled(currentExePath(), event.enabled);
        autostartEnabled = event.enabled;
        shell.refreshMenu({ status, autostartEnabled, busy });
        pushSettings();
        break;
      case "test-ports": {
        lastNotice = undefined;
        const [management, gateway] = await Promise.all([
          testPort(event.managementPort),
          testPort(event.gatewayPort),
        ]);
        lastPortTest = { management, gateway };
        pushSettings();
        break;
      }
      case "save-ports": {
        const { managementPort, gatewayPort } = event;
        const valid =
          Number.isInteger(managementPort) &&
          Number.isInteger(gatewayPort) &&
          managementPort >= 1 && managementPort <= 65535 &&
          gatewayPort >= 1 && gatewayPort <= 65535 &&
          managementPort !== gatewayPort;
        if (!valid) {
          lastPortTest = undefined;
          lastNotice = "端口必须是 1-65535 的整数且不能相同";
          pushSettings();
          break;
        }
        writeSettings({ managementPort, gatewayPort });
        lastPortTest = undefined;
        // 服务在跑 → 自动重启用新端口生效；没在跑 → 下次启动生效
        if (status.state !== "stopped") {
          busy = true;
          lastNotice = "正在用新端口重启服务…";
          pushSettings();
          try {
            expectStart = true;
            await restartService();
            lastNotice = "已保存，服务已用新端口重启";
          } catch (err) {
            lastNotice = `端口已保存，但服务重启失败：${err instanceof Error ? err.message : String(err)}`;
          }
          busy = false;
        } else {
          lastNotice = "已保存，下次启动服务生效";
        }
        await refresh();
        break;
      }
      case "quit":
        shell.quit();
        break;
    }
  }

  void app.whenReady().then(async () => {
    ensureToastShortcut();
    autostartEnabled = isAutostartEnabled(currentExePath());
    shell.onEvent((event) => void handleEvent(event));
    await shell.init();
    await refresh();
    setInterval(() => void refresh(), pollIntervalMs);
  });

  // 托盘应用：关掉所有窗口也不退出；显式"退出"菜单才走
  // 注册空处理器即可覆盖 Electron 的默认退出行为
  app.on("window-all-closed", () => {
    /* 托盘常驻 */
  });
}
