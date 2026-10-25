import type { MenuEvent, NotifyInfo, SettingsState, StatusInfo } from "../core/types";

/**
 * 平台无关的托盘壳接口。 Electron 只是第一个实现——
 * 以后换 koffi / D-Bus 后端时 main.ts 与 core 都不用动。
 */
export interface TrayShell {
  /** 点亮托盘（应用启动时调用一次） */
  init(): Promise<void>;
  /** 更新图标与提示文本 */
  setStatus(info: StatusInfo): void;
  /** 更新右键菜单（启停可用性等） */
  refreshMenu(options: MenuOptions): void;
  /** 打开设置窗口（已打开则聚焦） */
  openSettings(): void;
  /** 推送设置窗口状态（运行时长/自启/端口/测试结果/提示） */
  updateSettings(state: SettingsState): void;
  /** 弹出应用内通知（右下角滑入，自动消失，可带动作按钮） */
  notify(info: NotifyInfo): void;
  /** 打开系统浏览器 */
  openExternal(url: string): void;
  /** 应用退出 */
  quit(): void;
  /** 菜单/图标事件订阅 */
  onEvent(listener: (event: MenuEvent) => void): void;
}

export interface MenuOptions {
  status: StatusInfo;
  /** 操作进行中（启动/停止点了之后到状态变化前） */
  busy: boolean;
}

export const stateLabel: Record<StatusInfo["state"], string> = {
  running: "运行中",
  partial: "启动中…",
  stopped: "已停止",
};
