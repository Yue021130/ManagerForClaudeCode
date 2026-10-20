import { app } from "electron";
import { restartService, startService, stopService, testPort } from "./core/ccr";
import { checkStatus } from "./core/status";
import { readManagementUrl } from "./core/service-state";
import { readSettings, writeSettings } from "./core/settings";
import type { MenuEvent, PortTestResult, SettingsState, StatusInfo } from "./core/types";
import { currentExePath, isAutostartEnabled, setAutostartEnabled } from "./core/autostart";
import { ElectronTrayShell } from "./shell/electron-tray";

const pollIntervalMs = 3000;

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

  async function refresh(): Promise<void> {
    status = await checkStatus();
    // 本次启动时长口径：进入 running 开始计时，停止归零
    if (status.state === "running" && !prevRunning) runningSince = Date.now();
    if (status.state === "stopped") runningSince = null;
    prevRunning = status.state === "running";

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
          if (event.kind === "start-service") await startService();
          else await stopService();
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
