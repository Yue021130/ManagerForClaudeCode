import { BrowserWindow, Tray, app, ipcMain, nativeImage, screen } from "electron";
import type { MenuEvent, StatusInfo } from "../core/types";
import type { MenuOptions, TrayShell } from "./tray-shell";
import { stateLabel } from "./tray-shell";

const ASSETS = `${__dirname}/../assets`;

// 自绘弹窗尺寸（CSS 像素，不随系统缩放变大是它的意义所在）
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
  private listener: (event: MenuEvent) => void = () => undefined;
  private lastOptions: MenuOptions | null = null;

  async init(): Promise<void> {
    // 用最大的图标模板，Windows 下 Electron 自动缩放；留空兜底防崩溃
    const base = nativeImage.createFromPath(`${ASSETS}/icon.png`);
    this.tray = new Tray(base.isEmpty() ? iconFor("stopped") : base);
    this.tray.setToolTip("CCR 服务");
    this.tray.on("click", () => this.emit({ kind: "open-management" }));
    this.tray.on("right-click", () => this.openPopup());
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
  }

  /** 按托盘图标位置摆放弹窗，并夹取到所在显示器工作区内 */
  private openPopup(): void {
    if (!this.popup || !this.tray || !this.lastOptions) return;
    const tb = this.tray.getBounds();
    const area = tb.width > 0
      ? screen.getDisplayNearestPoint({ x: tb.x, y: tb.y }).workArea
      : screen.getPrimaryDisplay().workArea;
    const cx = tb.width > 0 ? tb.x + tb.width / 2 : area.x + area.width / 2;
    const cy = tb.height > 0 ? tb.y + tb.height / 2 : area.y + area.height / 2;

    let x = Math.round(cx - POPUP_WIDTH / 2);
    // 图标在屏幕上半 → 往下弹；在下半 → 往上弹（任务栏在底部时菜单不遮图标）
    const below = cy < area.y + area.height / 2;
    let y = below ? Math.round(cy + tb.height / 2 + 4) : Math.round(cy - tb.height / 2 - POPUP_HEIGHT - 4);

    x = Math.max(area.x + 4, Math.min(x, area.x + area.width - POPUP_WIDTH - 4));
    y = Math.max(area.y + 4, Math.min(y, area.y + area.height - POPUP_HEIGHT - 4));

    this.popup.setBounds({ x, y, width: POPUP_WIDTH, height: POPUP_HEIGHT });
    this.pushState();
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
    this.tray.setToolTip(`CCR 服务 — ${stateLabel[info.state]}`);
  }

  refreshMenu(options: MenuOptions): void {
    this.lastOptions = options;
    // 弹窗开着时实时刷新内容（busy 置灰、自启勾选态等）
    if (this.popup?.isVisible()) this.pushState();
  }

  openExternal(url: string): void {
    void import("electron").then(({ shell }) => shell.openExternal(url));
  }

  quit(): void {
    app.quit();
  }
}
