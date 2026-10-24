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
  | { kind: "content-height"; height: number }
  | { kind: "notify-action"; action: "restart-service" | "open-management" }
  | { kind: "quit" };

export type PortTestResult = "free" | "in-use" | "invalid";

/** 通知类型：决定左侧色条颜色 */
export type NotifyKind = "crash" | "recover" | "stuck" | "info";

/** 推给自绘通知弹窗的内容 */
export interface NotifyInfo {
  kind: NotifyKind;
  title: string;
  body: string;
  /** 可选动作按钮（如崩溃类给「重启服务」） */
  action?: { label: string; event: "restart-service" | "open-management" };
}

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
  /** 保存结果反馈（3 秒后自动清除，保存按钮内联显示） */
  lastSave?: { result: "ok" | "fail"; label: string };
  /** 保存重启的进行阶段（busy 期间按钮内联显示，转圈 + 阶段文字） */
  saveStage?: string;
  /** 端口校验错误（就地红字提示，5 秒后自动清除） */
  portError?: string;
}
