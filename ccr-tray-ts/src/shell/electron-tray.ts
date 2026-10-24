import { BrowserWindow, Tray, app, ipcMain, nativeImage, screen } from "electron";
import type { MenuEvent, NotifyInfo, SettingsState, StatusInfo } from "../core/types";
import type { MenuOptions, TrayShell } from "./tray-shell";
import { stateLabel } from "./tray-shell";

const ASSETS = `${__dirname}/../assets`;

// 自绘弹窗初始尺寸（CSS 像素）；显示前会按内容实测收缩，这只是兜底值
const POPUP_WIDTH = 210;
const POPUP_HEIGHT = 162;

// 通知弹窗尺寸：带动作按钮 / 纯展示
const NOTIFY_WIDTH = 340;
const NOTIFY_HEIGHT_WITH_ACTION = 118;
const NOTIFY_HEIGHT_PLAIN = 86;
const NOTIFY_DURATION_MS = 6000;

function iconFor(state: StatusInfo["state"]): Electron.NativeImage {
  const file =
    state === "running"
      ? `${ASSETS}/tray-green-32.png`
      : state === "partial"
        ? `${ASSETS}/tray-yellow-32.png`
        : `${ASSETS}/tray-red-32.png`;
  const img = nativeImage.createFromPath(file);
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

export class ElectronTrayShell implements TrayShell {
  private tray: Tray | null = null;
  private popup: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;
  private notifyWindow: BrowserWindow | null = null;
  private notifyQueue: NotifyInfo[] = [];
  private notifyShowing = false;
  private lastNotify: NotifyInfo | null = null;
  private notifyTimer: NodeJS.Timeout | null = null;
  private listener: (event: MenuEvent) => void = () => undefined;
  private lastOptions: MenuOptions | null = null;
  private lastSettings: SettingsState | null = null;

  async init(): Promise<void> {
    // 初始图标用黄灯：托盘刚启动时服务状态未知（多半正在启动），
    // 第一次轮询（≤2.4s）后会覆盖为真实状态
    const base = nativeImage.createFromPath(`${ASSETS}/icon.png`);
    this.tray = new Tray(base.isEmpty() ? iconFor("partial") : base);
    this.tray.setToolTip("Yue");
    this.tray.on("click", () => this.emit({ kind: "open-management" }));
    this.tray.on("right-click", () => void this.openPopup());
    this.createPopup();
    this.createNotifyWindow();
  }

  /** 无边框自绘菜单窗口：尺寸自己控制，绕开系统缩放对原生菜单的放大 */
  private createPopup(): void {
    this.popup = new BrowserWindow({
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      focusable: true,
      webPreferences: {
        preload: `${__dirname}/shell/menu-preload.cjs`,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.popup.setAlwaysOnTop(true, "pop-up-menu");
    void this.popup.loadFile(`${ASSETS}/menu.html`);
    // 失焦即关（点到菜单外面等价于原生菜单的点击外部关闭）
    this.popup.on("blur", () => this.popup?.hide());
    // 菜单事件：dismiss 只关窗，其余透传业务层后关窗
    ipcMain.on("menu:event", (_e, event) => {
      if (!event || typeof event.kind !== "string") return;
      this.popup?.hide();
      if (event.kind !== "dismiss") this.emit(event as MenuEvent);
    });
    // 设置窗口事件：dismiss 只隐藏（保留缓存下次快开），其余透传业务层
    ipcMain.on("settings:event", (_e, event) => {
      if (!event || typeof event.kind !== "string") return;
      if (event.kind === "dismiss") {
        this.settingsWindow?.hide();
        return;
      }
      this.emit(event as MenuEvent);
    });
  }

  /** 应用内通知弹窗：右下角滑入，不抢焦点，自动消失。
   *  不走 Windows toast——专注助手会压系统通知，自绘弹窗绕不开的问题不存在 */
  private createNotifyWindow(): void {
    this.notifyWindow = new BrowserWindow({
      width: NOTIFY_WIDTH,
      height: NOTIFY_HEIGHT_WITH_ACTION,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      hasShadow: false,
      webPreferences: {
        preload: `${__dirname}/shell/notify-preload.cjs`,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.notifyWindow.setAlwaysOnTop(true, "screen-saver");
    void this.notifyWindow.loadFile(`${ASSETS}/notify.html`);
    // 渲染进程加载完成补推一次（排队期间来的通知不至于丢）
    this.notifyWindow.webContents.on("did-finish-load", () => {
      if (this.lastNotify && this.notifyWindow && !this.notifyWindow.webContents.isDestroyed()) {
        this.notifyWindow.webContents.send("notify:state", this.lastNotify);
      }
    });
    ipcMain.on("notify:event", (_e, event) => {
      if (!event || typeof event.kind !== "string") return;
      const action = event.kind === "notify-action" ? event.action : undefined;
      this.hideNotify();
      if (action) this.emit({ kind: "notify-action", action } as MenuEvent);
    });
  }

  notify(info: NotifyInfo): void {
    this.notifyQueue.push(info);
    if (this.notifyQueue.length > 3) this.notifyQueue.shift(); // 溢出丢最旧
    if (!this.notifyShowing) void this.showNextNotify();
  }

  private async showNextNotify(): Promise<void> {
    const info = this.notifyQueue.shift();
    const win = this.notifyWindow;
    if (!info || !win || win.isDestroyed()) {
      this.notifyShowing = false;
      return;
    }
    this.notifyShowing = true;
    this.lastNotify = info;
    const height = info.action ? NOTIFY_HEIGHT_WITH_ACTION : NOTIFY_HEIGHT_PLAIN;
    const area = screen.getPrimaryDisplay().workArea;
    win.setBounds({
      x: area.x + area.width - NOTIFY_WIDTH - 12,
      y: area.y + area.height - height - 12,
      width: NOTIFY_WIDTH,
      height,
    });
    if (!win.webContents.isDestroyed()) {
      win.webContents.send("notify:state", info);
    }
    win.showInactive(); // 显示但不夺焦点
    this.notifyTimer = setTimeout(() => this.hideNotify(), NOTIFY_DURATION_MS);
  }

  private hideNotify(): void {
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    this.lastNotify = null;
    this.notifyWindow?.hide();
    this.notifyShowing = false;
    if (this.notifyQueue.length > 0) void this.showNextNotify();
  }

  /** 设置窗口：无边框 + 自绘标题栏（可拖拽、手绘✕），保留任务栏图标；dismiss 隐藏不销毁 */
  openSettings(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.pushSettingsState();
      this.settingsWindow.show();
      this.settingsWindow.focus();
      return;
    }
    this.settingsWindow = new BrowserWindow({
      width: 340,
      height: 424,
      show: false,
      frame: false,
      title: "设置",
      icon: `${ASSETS}/tray-green-48.png`,
      backgroundColor: "#22222c",
      resizable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        preload: `${__dirname}/shell/settings-preload.cjs`,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    void this.settingsWindow.loadFile(`${ASSETS}/settings.html`);
    this.settingsWindow.once("ready-to-show", () => {
      if (!this.settingsWindow) return;
      // 居中于托盘图标所在显示器
      const tb = this.tray?.getBounds();
      const area = tb && tb.width > 0
        ? screen.getDisplayNearestPoint({ x: tb.x, y: tb.y }).workArea
        : screen.getPrimaryDisplay().workArea;
      const x = Math.round(area.x + (area.width - 340) / 2);
      const y = Math.round(area.y + (area.height - 424) / 2);
      this.settingsWindow.setBounds({ x, y, width: 340, height: 424 });
      this.pushSettingsState();
      this.settingsWindow.show();
    });
  }

  private pushSettingsState(): void {
    if (this.settingsWindow && this.lastSettings && !this.settingsWindow.webContents.isDestroyed()) {
      this.settingsWindow.webContents.send("settings:state", this.lastSettings);
    }
  }

  /** 量内容实际宽高（#menu 是 max-content 布局）。
   *  不需要等待：send(推状态) 与 executeJavaScript(测量) 走同一 IPC 通道按序到达，
   *  render() 先跑完再测量。不能用 rAF——隐藏窗口不产帧。 */
  private async measurePopup(): Promise<{ width: number; height: number } | null> {
    if (!this.popup || this.popup.webContents.isDestroyed()) return null;
    try {
      return await this.popup.webContents.executeJavaScript(
        `(() => { const el = document.getElementById("menu");
           return { width: el.scrollWidth, height: el.scrollHeight }; })()`
      );
    } catch {
      return null;
    }
  }

  /** 按托盘图标位置摆放弹窗，并夹取到所在显示器工作区内 */
  private async openPopup(): Promise<void> {
    if (!this.popup || !this.tray || !this.lastOptions) return;
    this.pushState();
    // 先量内容尺寸，再按实际尺寸定位，宽度正好包住内容
    const size = await this.measurePopup();
    // +2px 余量：防止实测值取整后内容被裁
    const w = Math.max((size?.width ?? POPUP_WIDTH) + 2, 100);
    const h = (size?.height ?? POPUP_HEIGHT) + 2;

    const tb = this.tray.getBounds();
    const area = tb.width > 0
      ? screen.getDisplayNearestPoint({ x: tb.x, y: tb.y }).workArea
      : screen.getPrimaryDisplay().workArea;

    // 以鼠标点击位置锚定：弹窗出现在点击点右上角（getBounds 在托盘溢出面板里坐标不准）
    const point = screen.getCursorScreenPoint();
    let x = Math.round(point.x + 2);
    // 点击点在屏幕上半 → 往下弹；在下半 → 往上弹（任务栏在底部时菜单不遮图标）
    const below = point.y < area.y + area.height / 2;
    let y = below ? Math.round(point.y + 3) : Math.round(point.y - h - 3);

    x = Math.max(area.x + 4, Math.min(x, area.x + area.width - w - 4));
    y = Math.max(area.y + 4, Math.min(y, area.y + area.height - h - 4));

    this.popup.setBounds({ x, y, width: w, height: h });
    this.popup.show();
  }

  private pushState(): void {
    if (this.popup && this.lastOptions && !this.popup.webContents.isDestroyed()) {
      this.popup.webContents.send("menu:state", this.lastOptions);
    }
  }

  onEvent(listener: (event: MenuEvent) => void): void {
    this.listener = listener;
  }

  private emit(event: MenuEvent): void {
    this.listener(event);
  }

  setStatus(info: StatusInfo): void {
    if (!this.tray) return;
    this.tray.setImage(iconFor(info.state));
    this.tray.setToolTip(`Yue — ${stateLabel[info.state]}`);
    // 黄灯（启动中/半启动）用明暗两帧交替，做呼吸灯效果
    if (info.state === "partial") this.startBreathing();
    else this.stopBreathing();
  }

  private breatheTimer: NodeJS.Timeout | null = null;
  private breatheBright = true;

  private startBreathing(): void {
    if (this.breatheTimer || !this.tray) return;
    const bright = iconFor("partial");
    const dim = nativeImage.createFromPath(`${ASSETS}/tray-yellow-dim-32.png`);
    this.breatheTimer = setInterval(() => {
      if (!this.tray) return;
      this.breatheBright = !this.breatheBright;
      this.tray.setImage(this.breatheBright ? bright : (dim.isEmpty() ? bright : dim));
    }, 500);
  }

  private stopBreathing(): void {
    if (this.breatheTimer) {
      clearInterval(this.breatheTimer);
      this.breatheTimer = null;
    }
  }

  refreshMenu(options: MenuOptions): void {
    this.lastOptions = options;
    // 弹窗开着时实时刷新内容（busy 置灰、启停切换等）
    if (this.popup?.isVisible()) this.pushState();
  }

  updateSettings(state: SettingsState): void {
    this.lastSettings = state;
    if (this.settingsWindow?.isVisible()) this.pushSettingsState();
  }

  openExternal(url: string): void {
    void import("electron").then(({ shell }) => shell.openExternal(url));
  }

  quit(): void {
    // 弹窗 closable: false 会让 app.quit() 卡在售窗阶段退不掉；
    // 托盘应用直接销毁资源 + 强制退出
    this.stopBreathing();
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    this.popup?.destroy();
    this.settingsWindow?.destroy();
    this.notifyWindow?.destroy();
    this.tray?.destroy();
    app.exit(0);
  }
}
