import { app } from "electron";
import { startService, stopService } from "./core/ccr";
import { MANAGEMENT_PORT, checkStatus } from "./core/status";
import { readManagementUrl } from "./core/service-state";
import type { MenuEvent, StatusInfo } from "./core/types";
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

  const shell = new ElectronTrayShell();

  async function refresh(): Promise<void> {
    status = await checkStatus();
    shell.setStatus(status);
    shell.refreshMenu({ status, autostartEnabled: isAutostartEnabled(currentExePath()), busy });
  }

  async function handleEvent(event: MenuEvent): Promise<void> {
    switch (event.kind) {
      case "open-management":

        // 优先用 service.json 里带令牌的 URL
        shell.openExternal(readManagementUrl(MANAGEMENT_PORT));

        break;
      case "start-service":
      case "stop-service": {
        busy = true;
        shell.refreshMenu({ status, autostartEnabled: isAutostartEnabled(currentExePath()), busy });
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
        shell.refreshMenu({ status, autostartEnabled: event.enabled, busy });
        break;
      case "quit":
        shell.quit();
        break;
    }
  }

  void app.whenReady().then(async () => {
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
