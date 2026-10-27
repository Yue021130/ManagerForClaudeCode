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
    // 菜单/通知窗口用时才建、用完即毁（少两个常驻渲染进程）；
    // 这里只注册一次 IPC 入口，窗口本体在 ensure* 里反复重建
    this.registerIpcHandlers();
  }

  /** 菜单/设置/通知三个渲染进程的 IPC 入口，随托盘生命周期只注册一次（窗口可反复重建） */
  private registerIpcHandlers(): void {
    // 菜单事件：dismiss 只关窗，其余透传业务层后关窗
    ipcMain.on("menu:event", (_e, event) => {
      if (!event || typeof event.kind !== "string") return;
      this.popup?.hide();
      if (event.kind !== "dismiss") this.emit(event as MenuEvent);
    });
    // 设置窗口事件：dismiss 只隐藏（保留缓存下次快开）；content-height 由渲染层
    // ResizeObserver 逐帧上报，直接调窗口高度不透传；其余透传业务层
    ipcMain.on("settings:event", (_e, event) => {
      if (!event || typeof event.kind !== "string") return;
      if (event.kind === "dismiss") {
        this.settingsWindow?.hide();
        return;
      }
      if (event.kind === "content-height" && typeof event.height === "number") {
        this.applySettingsHeight(event.height);
        return;
      }
      this.emit(event as MenuEvent);
    });
    // 通知弹窗事件：动作按钮等价于对应菜单操作
    ipcMain.on("notify:event", (_e, event) => {
      if (!event || typeof event.kind !== "string") return;
      const action = event.kind === "notify-action" ? event.action : undefined;
      this.hideNotify();
      if (action) this.emit({ kind: "notify-action", action } as MenuEvent);
    });
  }

  private popupLoading: Promise<BrowserWindow | null> | null = null;

  /** 无边框自绘菜单窗口：尺寸自己控制，绕开系统缩放对原生菜单的放大。
   *  用时才建、失焦即毁——隐藏窗口也占一个渲染进程，收起就释放 */
  private ensurePopup(): Promise<BrowserWindow | null> {
    if (this.popup && !this.popup.isDestroyed()) return Promise.resolve(this.popup);
    if (this.popupLoading) return this.popupLoading; // 首建加载中，并发右键等同一个
    this.popupLoading = this.createPopupWindow();
    return this.popupLoading;
  }

  private async createPopupWindow(): Promise<BrowserWindow | null> {
    const win = new BrowserWindow({
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
    win.setAlwaysOnTop(true, "pop-up-menu");
    void win.loadFile(`${ASSETS}/menu.html`);
    // 失焦即关（点到菜单外面等价于原生菜单的点击外部关闭）；收起顺手销毁
    win.on("blur", () => {
      win.destroy();
      if (this.popup === win) this.popup = null;
    });
    this.popup = win;
    // 等页面加载完再测量定位，避免拿到空白页尺寸；中途被销毁也要能解开
    await new Promise<void>((resolve) => {
      win.webContents.once("did-finish-load", () => resolve());
      win.once("closed", () => resolve());
    });
    this.popupLoading = null;
    return win.isDestroyed() ? null : win;
  }

  private notifyLoading: Promise<BrowserWindow | null> | null = null;

  /** 应用内通知弹窗：右下角滑入，不抢焦点，自动消失。
   *  不走 Windows toast——专注助手会压系统通知，自绘弹窗绕不开的问题不存在。
   *  窗口用时才建、队列清空即毁（隐藏窗口也占渲染进程） */
  private ensureNotifyWindow(): Promise<BrowserWindow | null> {
    if (this.notifyWindow && !this.notifyWindow.isDestroyed()) return Promise.resolve(this.notifyWindow);
    if (this.notifyLoading) return this.notifyLoading;
    this.notifyLoading = this.createNotifyWindow();
    return this.notifyLoading;
  }

  private async createNotifyWindow(): Promise<BrowserWindow | null> {
    const win = new BrowserWindow({
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
    win.setAlwaysOnTop(true, "screen-saver");
    void win.loadFile(`${ASSETS}/notify.html`);
    this.notifyWindow = win;
    // 等页面加载完（showNextNotify 在 ensure 之后才发送内容）；中途被销毁也要能解开
    await new Promise<void>((resolve) => {
      win.webContents.once("did-finish-load", () => resolve());
      win.once("closed", () => resolve());
    });
    this.notifyLoading = null;
    return win.isDestroyed() ? null : win;
  }

  notify(info: NotifyInfo): void {
    this.notifyQueue.push(info);
    if (this.notifyQueue.length > 3) this.notifyQueue.shift(); // 溢出丢最旧
    if (!this.notifyShowing) void this.showNextNotify();
  }

  private async showNextNotify(): Promise<void> {
    const info = this.notifyQueue.shift();
    if (!info) {
      this.notifyShowing = false;
      return;
    }
    this.notifyShowing = true;
    const win = await this.ensureNotifyWindow();
    if (!win || win.isDestroyed()) {
      this.notifyShowing = false;
      return;
    }
    this.lastNotify = info;
    const height = info.action ? NOTIFY_HEIGHT_WITH_ACTION : NOTIFY_HEIGHT_PLAIN;
    const area = screen.getPrimaryDisplay().workArea;
    win.setBounds({
      x: area.x + area.width - NOTIFY_WIDTH - 12,
      y: area.y + area.height - height - 12,
      width: NOTIFY_WIDTH,
      height,
    });
    win.webContents.send("notify:state", info);
    win.showInactive(); // 显示但不夺焦点
    this.notifyTimer = setTimeout(() => this.hideNotify(), NOTIFY_DURATION_MS);
  }

  private hideNotify(): void {
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    this.lastNotify = null;
    this.notifyShowing = false;
    if (this.notifyQueue.length > 0) {
      void this.showNextNotify();
      return;
    }
    // 队列清空：窗口用完即毁，释放渲染进程
    this.notifyWindow?.destroy();
    this.notifyWindow = null;
  }

  /** 设置窗口：无边框 + 自绘标题栏（可拖拽、手绘✕），保留任务栏图标；dismiss 隐藏不销毁 */
  openSettings(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.pushSettingsState();
      // 隐藏期间内容可能变过（反馈条自动清除等）：show 前量一次高度，避免闪现旧高度
      void this.measureSettingsHeight().then((h) => {
        if (!this.settingsWindow || this.settingsWindow.isDestroyed()) return;
        if (h) this.applySettingsHeight(h);
        this.settingsWindow.show();
        this.settingsWindow.focus();
      });
      return;
    }
    this.settingsWindow = new BrowserWindow({
      width: 368,
      height: 408,
      show: false,
      frame: false,
      // 透明底 + CSS 圆角：无边框窗口的直角由 body 背景画出，要圆角必须透明
      transparent: true,
      title: "设置",
      icon: `${ASSETS}/tray-green-48.png`,
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
      // 先按内容实测高度，再居中于托盘图标所在显示器（窗口贴着内容走，无死区）
      void this.measureSettingsHeight().then((h) => {
        if (!this.settingsWindow) return;
        const height = Math.max(300, h ?? 408);
        const b = this.settingsWindow.getBounds();
        const tb = this.tray?.getBounds();
        const area = tb && tb.width > 0
          ? screen.getDisplayNearestPoint({ x: tb.x, y: tb.y }).workArea
          : screen.getPrimaryDisplay().workArea;
        const x = Math.round(area.x + (area.width - b.width) / 2);
        const y = Math.round(area.y + (area.height - height) / 2);
        this.settingsWindow.setBounds({ x, y, width: b.width, height });
        this.pushSettingsState();
        this.settingsWindow.show();
      });
    });
  }

  /** 一次性量设置窗口内容高度。#panel 是 max-content 高度，量它即可；
   *  隐藏窗口 JS 布局仍可用（可见期间的连续变化由渲染层 ResizeObserver 逐帧上报）。 */
  private async measureSettingsHeight(): Promise<number | null> {
    const win = this.settingsWindow;
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return null;
    try {
      const h = await win.webContents.executeJavaScript(
        `(() => { const el = document.getElementById("panel"); return el ? el.offsetHeight : 0; })()`
      );
      return typeof h === "number" && h > 0 ? h : null;
    } catch {
      return null;
    }
  }

  /** 渲染层上报的内容高度：顶边固定向下长（标题栏不动），底边夹在工作区内。
   *  不起自己的定时器动画——CSS 过渡是唯一动画时钟，窗口逐帧跟随内容。 */
  private applySettingsHeight(height: number): void {
    const win = this.settingsWindow;
    if (!win || win.isDestroyed()) return;
    const target = Math.max(300, Math.round(height));
    const b = win.getBounds();
    if (Math.abs(target - b.height) < 2) return;
    const area = screen.getDisplayMatching(b).workArea;
    let y = b.y;
    if (y + target > area.y + area.height - 8) {
      y = Math.max(area.y + 8, area.y + area.height - 8 - target);
    }
    win.setBounds({ x: b.x, y, width: b.width, height: target });
  }

  private pushSettingsState(): void {
    if (this.settingsWindow && this.lastSettings && !this.settingsWindow.webContents.isDestroyed()) {
      this.settingsWindow.webContents.send("settings:state", this.lastSettings);
      // 高度跟随由渲染层 ResizeObserver 逐帧上报（content-height），这里不用管
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
    if (!this.tray || !this.lastOptions) return;
    // 窗口用时才建：等加载完再测量定位（首建多几十毫秒，HTML 很小）
    await this.ensurePopup();
    if (!this.popup || this.popup.isDestroyed()) return;
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

  /** 状态推送导致内容高度变化时（如"启动中→已启动"多出一行"打开管理界面"），
   *  重测内容并调整弹窗边界；顶边固定向上收/向下长，底边夹在工作区内，
   *  否则窗口尺寸停留在打开那一刻，末项会被挤出可视区点不到 */
  private async layoutPopup(): Promise<void> {
    if (!this.popup || this.popup.isDestroyed()) return;
    const size = await this.measurePopup();
    const w = Math.max((size?.width ?? POPUP_WIDTH) + 2, 100);
    const h = (size?.height ?? POPUP_HEIGHT) + 2;
    const b = this.popup.getBounds();
    const area = screen.getDisplayMatching(b).workArea;
    let y = b.y;
    if (y + h > area.y + area.height - 4) {
      y = Math.max(area.y + 4, area.y + area.height - 4 - h);
    }
    this.popup.setBounds({ x: b.x, y, width: w, height: h });
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
    // 弹窗开着时实时刷新内容（busy 置灰、启停切换等）；内容高度可能随状态变
    // （partial 隐藏"打开管理界面"一项），尺寸跟着重排，末项才不会被裁掉
    if (this.popup?.isVisible()) {
      this.pushState();
      void this.layoutPopup();
    }
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
