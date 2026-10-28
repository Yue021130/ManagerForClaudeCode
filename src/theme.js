/**
 * 全局主题与工具函数
 *
 * THEME    — 终端色彩方案（hex 真彩色，老旧终端由 chalk 自动降级到最近似色）
 * maskValue / maskApiKey — 敏感信息脱敏工具
 *
 * 页面标识/名称/主题色不再集中在这里，改为各页面文件自己导出 meta（见 pages/registry.js）
 */

export const THEME = {
  // 基础色
  bg: 'black',
  fg: '#E6EDF3',          // 主文字（柔和白）
  muted: '#8B949E',       // 次要文字（中灰）
  faint: '#57606A',       // 更弱提示
  border: '#30363D',      // 分隔线 / 竖线

  // 强调色
  accent: '#22D3EE',      // 青色（Settings 主题色）
  accentBright: '#67E8F9',
  success: '#3FB950',     // 绿色（MCP 主题色）
  successBright: '#56D364',
  danger: '#F85149',      // 红色
  dangerBright: '#FF7B72',
  warn: '#D29922',        // 琥珀
  warnBright: '#E3B341',
  info: '#58A6FF',        // 蓝色（Skills 主题色）
  infoBright: '#79C0FF',
  magenta: '#BC8CFF',     // 紫色（CCR 主题色）
  magentaBright: '#D2A8FF',

  // 组件级
  onAccent: '#0D1117',    // 高亮背景上的深色文字
  chipBg: '#161B22',      // 键帽/徽章底色
  rowBg: '#1C2128'        // 非选中行的悬停底（备用）
};

// 用于判断字段名是否可能包含敏感信息
const SENSITIVE_RE = /token|key|secret|auth|password|bearer|credential/i;

// 对配置值做脱敏：敏感字段只显示前 4 字符 + ***，过长的值截断
export function maskValue(k, v) {
  const s = String(v);
  if (SENSITIVE_RE.test(k)) return s.slice(0, 4) + '***';
  return s.length > 32 ? s.slice(0, 32) + '…' : s;
}

// API Key 脱敏：保留前 4 后 4，中间用 **** 替代
export function maskApiKey(key) {
  if (!key || key.length < 8) return key;
  return key.slice(0, 4) + '****' + key.slice(-4);
}
