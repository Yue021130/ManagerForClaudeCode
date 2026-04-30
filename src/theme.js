/**
 * 全局主题与常量定义
 *
 * THEME    — 终端色彩方案（基于 Ink/chalk 的 16 位色名）
 * PAGE_META — 5 个页面的元信息（编号/名称/颜色），顶部 Tab Bar 渲染用
 * MCP_WINDOWS — MCP 页面的 3 个子窗口索引常量，避免魔术数字
 * maskValue / maskApiKey — 敏感信息脱敏工具
 */

export const THEME = {
  bg: 'black',
  fg: 'white',
  muted: 'gray',
  accent: 'cyan',
  accentBright: 'brightCyan',
  success: 'green',
  successBright: 'brightGreen',
  danger: 'red',
  dangerBright: 'brightRed',
  warn: 'yellow',
  warnBright: 'brightYellow',
  info: 'blue',
  infoBright: 'brightBlue',
  magenta: 'magenta',
  magentaBright: 'brightMagenta'
};

export const PAGES = {
  MCP: 'mcp',
  SKILLS: 'skills',
  TRASH: 'trash',
  CCR: 'ccr',
  SETTINGS: 'settings'
};

export const PAGE_META = {
  [PAGES.MCP]:      { num: 1, label: 'MCP',      color: THEME.successBright },
  [PAGES.SKILLS]:   { num: 2, label: 'Skills',   color: THEME.infoBright },
  [PAGES.TRASH]:    { num: 3, label: 'Trash',    color: THEME.dangerBright },
  [PAGES.CCR]:      { num: 4, label: 'CCR',      color: THEME.magentaBright },
  [PAGES.SETTINGS]: { num: 5, label: 'Settings', color: THEME.accentBright }
};

// MCP 页面三栏布局：列表 | 详情 | 关联CLI
export const MCP_WINDOWS = {
  LIST: 0,
  DETAILS: 1,
  PARAMS: 2
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
