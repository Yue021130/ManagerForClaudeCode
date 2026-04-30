import { SUPPORTED_CLIS } from '../ConfigManager.js';

// CLI ID → 显示名称映射，新增 CLI 时在此加一条即可
export const CLI_NAMES = {
  [SUPPORTED_CLIS.CLAUDE]: 'Claude Code',
  [SUPPORTED_CLIS.GEMINI]: 'Gemini Code Assist'
};
