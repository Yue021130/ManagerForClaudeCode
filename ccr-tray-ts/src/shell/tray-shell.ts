import type { MenuEvent, StatusInfo } from "../core/types";

/**
 * 平台无关的托盘壳接口。 Electron 只是第一个实现——
 * 以后换 koffi / D-Bus 后端时 main.ts 与 core 都不用动。
 */
export interface TrayShell {
  /** 点亮托盘（应用启动时调用一次） */
  init(): Promise<void>;
  /** 更新图标与提示文本 */
  setStatus(info: StatusInfo): void;
  /** 更新右键菜单（自启勾选态、启停可用性等） */
  refreshMenu(options: MenuOptions): void;
  /** 打开系统浏览器 */
  openExternal(url: string): void;
  /** 应用退出 */
  quit(): void;
  /** 菜单/图标事件订阅 */
  onEvent(listener: (event: MenuEvent) => void): void;
}

export interface MenuOptions {
  status: StatusInfo;
  autostartEnabled: boolean;
  /** 操作进行中（启动/停止点了之后到状态变化前） */
  busy: boolean;
}

export const stateLabel: Record<StatusInfo["state"], string> = {
  running: "运行中",
  partial: "启动中…",
  stopped: "已停止",
};
