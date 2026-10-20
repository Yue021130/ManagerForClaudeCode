import { BrowserWindow, Tray, app, ipcMain, nativeImage, screen } from "electron";
import type { MenuEvent, SettingsState, StatusInfo } from "../core/types";
import type { MenuOptions, TrayShell } from "./tray-shell";
import { stateLabel } from "./tray-shell";

const ASSETS = `${__dirname}/../assets`;

// 自绘弹窗初始尺寸（CSS 像素）；显示前会按内容实测收缩，这只是兜底值
const POPUP_WIDTH = 210;
const POPUP_HEIGHT = 162;

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
  private listener: (event: MenuEvent) => void = () => undefined;
  private lastOptions: MenuOptions | null = null;
  private lastSettings: SettingsState | null = null;

  async init(): Promise<void> {
    // 用最大的图标模板，Windows 下 Electron 自动缩放；留空兜底防崩溃
    const base = nativeImage.createFromPath(`${ASSETS}/icon.png`);
    this.tray = new Tray(base.isEmpty() ? iconFor("stopped") : base);
    this.tray.setToolTip("Yue");
    this.tray.on("click", () => this.emit({ kind: "open-management" }));
    this.tray.on("right-click", () => void this.openPopup());
    this.createPopup();
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

  /** 设置窗口：无边框深色面板，居中于托盘所在屏；dismiss 隐藏不销毁，复用秒开 */
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
      transparent: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: true,
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

  /** 等渲染进程应用状态后量内容实际宽高。
   *  注意不能用 requestAnimationFrame——隐藏窗口不产帧，rAF 不会触发。 */
  private async measurePopup(): Promise<{ width: number; height: number } | null> {
    if (!this.popup || this.popup.webContents.isDestroyed()) return null;
    try {
      return await this.popup.webContents.executeJavaScript(
        `new Promise(res => setTimeout(() => {
           const el = document.getElementById("menu");
           res({ width: el.scrollWidth, height: el.scrollHeight });
         }, 60))`
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
    const cx = tb.width > 0 ? tb.x + tb.width / 2 : area.x + area.width / 2;
    const cy = tb.height > 0 ? tb.y + tb.height / 2 : area.y + area.height / 2;

    let x = Math.round(cx - w / 2);
    // 图标在屏幕上半 → 往下弹；在下半 → 往上弹（任务栏在底部时菜单不遮图标）
    const below = cy < area.y + area.height / 2;
    let y = below ? Math.round(cy + tb.height / 2 + 4) : Math.round(cy - tb.height / 2 - h - 4);

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
    this.popup?.destroy();
    this.settingsWindow?.destroy();
    this.tray?.destroy();
    app.exit(0);
  }
}
