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
  | { kind: "start-service" }
  | { kind: "stop-service" }
  | { kind: "toggle-autostart"; enabled: boolean }
  | { kind: "quit" };
