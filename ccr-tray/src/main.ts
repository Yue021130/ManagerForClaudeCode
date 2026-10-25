import { app } from "electron";
import { startService, stopService, testPort } from "./core/ccr";
import { checkStatus } from "./core/status";
import { readManagementUrl } from "./core/service-state";
import { readSettings, writeSettings } from "./core/settings";
import type { MenuEvent, NotifyKind, PortTestResult, SettingsState, StatusInfo } from "./core/types";
import { isAutostartEnabled, setAutostartEnabled } from "./core/autostart";
import { ElectronTrayShell } from "./shell/electron-tray";

const pollIntervalMs = 3000;
/** 黄灯（半启动）持续超过该时长视为卡住，弹一次通知 */
const yellowStuckMs = 10_000;
/** 点启动后等待网关起来的窗口：超过仍未 running 则放弃黄灯展示，回落真实状态 */
const startWindowMs = 15_000;

// 单实例：第二个实例直接退出，并唤起第一个
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    /* 已存在实例：聚焦/刷新菜单即可，托盘应用无窗口 */
  });

  // 初始按黄灯（半启动）算：托盘刚起时状态未知，第一次轮询后覆盖为真实状态
  let status: StatusInfo = { state: "partial", managementUrl: "http://127.0.0.1:3458/", gatewayOk: false, checkedAt: 0 };
  let busy = false;
  /** 本次启动时长：服务进入 running 的时刻，停止归零 */
  let runningSince: number | null = null;
  let prevRunning = false;
  let autostartEnabled = false;
  /** 最近一次端口测试结果 / 保存反馈 / 校验错误 / 保存重启阶段（推给设置窗口） */
  let lastPortTest: { which: "management" | "gateway"; result: PortTestResult } | undefined;
  let lastSave: { result: "ok" | "fail"; label: string } | undefined;
  let portError: string | undefined;
  let saveStage: string | undefined;

  // ── 状态变更通知 ──
  let prevState: "running" | "partial" | "stopped" | null = null;
  /** 通过托盘菜单手动启停/重启时置位，避免"自己点的操作"也弹通知 */
  let expectStop = false;
  let expectStart = false;
  let partialSince: number | null = null;
  let partialNotified = false;
  /** 点启动后等待网关起来的起始时刻；超过 startWindowMs 仍未 running 则放弃黄灯展示 */
  let startPendingAt: number | null = null;

  const shell = new ElectronTrayShell();

  /** 自启注册的目标命令：打包后 exe 即应用本体；开发期是裸 electron 二进制，
   *  必须把应用目录作为参数带上，否则开机启动的是 Electron 默认欢迎窗口 */
  function autostartTarget(): string {
    return app.isPackaged ? process.execPath : `"${process.execPath}" "${app.getAppPath()}"`;
  }

  function buildSettingsState(): SettingsState {
    const cpu = process.cpuUsage();
    const avgCpuPercent = ((cpu.user + cpu.system) / 1e6 / process.uptime()) * 100;
    const memRssMb = process.memoryUsage().rss / 1024 / 1024;
    return {
      uptimeMs: status.state === "running" && runningSince !== null ? Date.now() - runningSince : null,
      avgCpuPercent,
      memRssMb,
      autostartEnabled,
      managementPort: readSettings().managementPort,
      gatewayPort: readSettings().gatewayPort,
      serviceState: status.state,
      busy,
      portTest: lastPortTest,
      lastSave,
      portError,
      saveStage,
    };
  }

  function pushSettings(): void {
    shell.updateSettings(buildSettingsState());
  }

  // 保存反馈 / 校验错误 3 秒后自动清除（渲染层每秒重推，清除必须放在主进程做）
  let feedbackTimer: NodeJS.Timeout | null = null;
  function flashFeedback(): void {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      lastSave = undefined;
      portError = undefined;
      pushSettings();
    }, 3000);
  }

  /** 应用内自绘通知弹窗（右下角滑入，绕开专注助手对系统通知的拦截） */
  function notify(kind: NotifyKind, title: string, body: string, action?: { label: string; event: "restart-service" | "open-management" }): void {
    console.log(`[notify] ${title} - ${body}`);
    shell.notify({ kind, title, body, action });
  }

  function trackStatusChange(): void {
    const st = status.state;
    if (prevState === null) {
      // 托盘启动后的第一次轮询只建立基线，不通知
      prevState = st;
    } else if (st !== prevState) {
      console.log(`[status] ${prevState} -> ${st} (expectStop=${expectStop}, expectStart=${expectStart})`);
      if (st === "stopped" && !expectStop) {
        notify("crash", "CCR-YUE 服务已停止", "路由服务意外停止！ 😣", { label: "重启服务", event: "restart-service" });
      } else if (st === "running" && !expectStart) {
        notify("recover", "CCR-YUE 服务已恢复运行", "路由服务已恢复！ 🥰");
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
        notify("stuck", "CCR-YUE 启动缓慢", "服务处于半启动状态已超过 10 秒，可尝试重启服务", { label: "重启服务", event: "restart-service" });
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

    // 启动窗口：点了启动/重启后、网关还没起来的这段时间按黄灯展示，避免启动过程闪红
    if (status.state !== "running") {
      if (startPendingAt !== null && Date.now() - startPendingAt > startWindowMs) {
        expectStart = false;
        startPendingAt = null; // 启动超时，放弃黄灯，回落真实状态
      } else if (expectStart) {
        status = { ...status, state: "partial" };
      }
    } else {
      startPendingAt = null;
    }

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
            startPendingAt = Date.now();
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
      case "notify-action": {
        // 通知弹窗的动作按钮：等价于对应菜单操作
        if (event.action === "restart-service") {
          await handleEvent({ kind: "start-service" });
        } else if (event.action === "open-management") {
          await handleEvent({ kind: "open-management" });
        }
        break;
      }
      case "toggle-autostart":
        setAutostartEnabled(autostartTarget(), event.enabled);
        autostartEnabled = event.enabled;
        shell.refreshMenu({ status, autostartEnabled, busy });
        pushSettings();
        break;
      case "test-port": {
        portError = undefined;
        lastPortTest = { which: event.which, result: await testPort(event.port) };
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
          lastSave = undefined;
          portError = "端口必须是 1-65535 的整数且不能相同";
          pushSettings();
          flashFeedback();
          break;
        }
        saveStage = "正在保存配置…";
        pushSettings();
        writeSettings({ managementPort, gatewayPort });
        lastPortTest = undefined;
        // 服务在跑 → 自动重启用新端口生效；没在跑 → 下次启动生效
        if (status.state !== "stopped") {
          busy = true;
          try {
            expectStart = true;
            startPendingAt = Date.now();
            saveStage = "正在停止旧进程…";
            pushSettings();
            await stopService();
            saveStage = "正在启动服务…";
            pushSettings();
            await startService();
            lastSave = { result: "ok", label: "✓ 已保存并重启" };
          } catch (err) {
            lastSave = { result: "fail", label: "✗ 重启失败，端口已保存" };
            console.error(err);
          }
          saveStage = undefined;
          busy = false;
        } else {
          saveStage = undefined;
          lastSave = { result: "ok", label: "✓ 已保存，下次启动生效" };
        }
        pushSettings();
        flashFeedback();
        await refresh();
        break;
      }
      case "quit":
        shell.quit();
        break;
    }
  }

  void app.whenReady().then(async () => {
    autostartEnabled = isAutostartEnabled(autostartTarget());
    shell.onEvent((event) => void handleEvent(event));
    await shell.init();
    await refresh();
    setInterval(() => void refresh(), pollIntervalMs);
    // 开机自启（合并开关）：托盘随系统启动时，服务没在跑就一并拉起
    if (autostartEnabled && status.state === "stopped") {
      console.log("[boot] 服务未运行，自动拉起");
      await handleEvent({ kind: "start-service" });
    }
  });

  // 托盘应用：关掉所有窗口也不退出；显式"退出"菜单才走
  // 注册空处理器即可覆盖 Electron 的默认退出行为
  app.on("window-all-closed", () => {
    /* 托盘常驻 */
  });
}
