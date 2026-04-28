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

export const MCP_WINDOWS = {
  LIST: 0,
  DETAILS: 1,
  PARAMS: 2
};

export const SENSITIVE_RE = /token|key|secret|auth|password|bearer|credential/i;

export function maskValue(k, v) {
  const s = String(v);
  if (SENSITIVE_RE.test(k)) return s.slice(0, 4) + '***';
  return s.length > 32 ? s.slice(0, 32) + '…' : s;
}

export function maskApiKey(key) {
  if (!key || key.length < 8) return key;
  return key.slice(0, 4) + '****' + key.slice(-4);
}
