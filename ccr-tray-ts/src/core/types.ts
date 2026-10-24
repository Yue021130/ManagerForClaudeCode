/** 服务状态：绿=网关口正常，黄=只有管理口（启动中/异常），红=没在跑 */
export type ServiceState = "running" | "partial" | "stopped";

export interface StatusInfo {
  state: ServiceState;
  /** 探测到的管理口地址（用于"打开管理界面"） */
  managementUrl: string;
  gatewayOk: boolean;
  checkedAt: number;
}

export type MenuEvent =
  | { kind: "open-management" }
  | { kind: "open-settings" }
  | { kind: "start-service" }
  | { kind: "stop-service" }
  | { kind: "toggle-autostart"; enabled: boolean }
  | { kind: "test-port"; which: "management" | "gateway"; port: number }
  | { kind: "save-ports"; managementPort: number; gatewayPort: number }
  | { kind: "settings-tick" }
  | { kind: "quit" };

export type PortTestResult = "free" | "in-use" | "invalid";

/** 推给设置窗口的状态（menu:state 之外的第二个频道） */
export interface SettingsState {
  /** 本次启动时长（毫秒）；服务未运行为 null */
  uptimeMs: number | null;
  autostartEnabled: boolean;
  managementPort: number;
  gatewayPort: number;
  serviceState: ServiceState;
  busy: boolean;
  /** 端口测试结果（只测被修改的那一行，保存后清空） */
  portTest?: { which: "management" | "gateway"; result: PortTestResult };
  /** 保存/错误提示条 */
  notice?: string;
}
