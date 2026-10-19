import { app, Menu, nativeImage, Tray } from "electron";
import type { MenuEvent, StatusInfo } from "../core/types";
import type { MenuOptions, TrayShell } from "./tray-shell";
import { stateLabel } from "./tray-shell";

const ASSETS = `${__dirname}/../assets`;

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
  private listener: (event: MenuEvent) => void = () => undefined;
  private lastOptions: MenuOptions | null = null;

  async init(): Promise<void> {
    // 用最大的图标模板，Windows 下 Electron 自动缩放；留空兜底防崩溃
    const base = nativeImage.createFromPath(`${ASSETS}/icon.png`);
    this.tray = new Tray(base.isEmpty() ? iconFor("stopped") : base);
    this.tray.setToolTip("CCR 服务");
    this.tray.on("click", () => this.emit({ kind: "open-management" }));
    this.tray.on("right-click", () => this.renderMenu());
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
    this.renderMenu();
  }

  private renderMenu(): void {
    if (!this.tray || !this.lastOptions) return;
    const { status, autostartEnabled, busy } = this.lastOptions;

    // 精简菜单：状态看图标/提示即可，启动/停止合并为一个随状态切换的项
    const serviceItem: Electron.MenuItemConstructorOptions =
      status.state === "stopped"
        ? {
            label: "启动服务",
            enabled: !busy,
            click: () => this.emit({ kind: "start-service" }),
          }
        : {
            label: "停止服务",
            enabled: !busy,
            click: () => this.emit({ kind: "stop-service" }),
          };

    const template: Electron.MenuItemConstructorOptions[] = [
      { label: "打开管理界面", click: () => this.emit({ kind: "open-management" }) },
      serviceItem,
      {
        label: "开机自启",
        type: "checkbox",
        checked: autostartEnabled,
        click: (item) => this.emit({ kind: "toggle-autostart", enabled: item.checked }),
      },
      { label: "退出", click: () => this.emit({ kind: "quit" }) },
    ];
    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  openExternal(url: string): void {
    void import("electron").then(({ shell }) => shell.openExternal(url));
  }

  quit(): void {
    app.quit();
  }
}
