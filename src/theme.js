/**
 * 全局主题与常量定义
 *
 * THEME    — 终端色彩方案（hex 真彩色，老旧终端由 chalk 自动降级到最近似色）
 * PAGES    — 页面标识常量
 * PAGE_META — 4 个页面的元信息（编号/名称/主题色），顶部 Tab 胶囊与标题渲染用
 * MCP_WINDOWS — MCP 页面的 2 个子窗口索引常量，避免魔术数字
 * maskValue / maskApiKey — 敏感信息脱敏工具
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

export const PAGES = {
  CCR: 'ccr',
  MCP: 'mcp',
  SKILL: 'SKILL',
  SETTING: 'SETTING'
};

// 按键 0-3 与页面的映射：CCR 是核心功能，排在第一位
export const PAGE_META = {
  [PAGES.CCR]:      { num: 0, label: 'CCR',      color: THEME.magentaBright },
  [PAGES.MCP]:      { num: 1, label: 'MCP',      color: THEME.successBright },
  [PAGES.SKILL]:   { num: 2, label: 'SKILL',   color: THEME.infoBright },
  [PAGES.SETTING]: { num: 3, label: 'SETTING', color: THEME.accentBright }
};

// MCP 页面两栏布局：列表 | 详情
export const MCP_WINDOWS = {
  LIST: 0,
  DETAILS: 1
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
