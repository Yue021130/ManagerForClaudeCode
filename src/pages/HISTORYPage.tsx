import { Box, Text } from 'ink';
import type { PageMeta } from '../types.js';

/**
 * HISTORY 页 — 占位
 * 规划功能：Claude Code 历史对话管理（项目/会话列表、搜索、预览、删除、归档、导出）
 * meta 是页面与外壳的契约：num(数字键) / label(Tab名) / color(Tab色) / hints(底部键帽)
 */
export const meta: PageMeta = {
  num: 1,
  label: 'HISTORY',
  color: '#79C0FF',
  // 设计稿键位（纯展示，逻辑待填充）
  hints: [['↑↓', '选择'], ['enter', '预览'], ['d', '删除'], ['x', '归档'], ['e', '导出MD']]
};

export default function HISTORYPage() {
  return (
    <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      <Text color="#57606A">HISTORY · 待填充</Text>
      <Text color="#57606A" dimColor>历史对话管理：项目 × 会话 / 搜索 / 预览 / 删除 / 归档 / 导出</Text>
    </Box>
  );
}
