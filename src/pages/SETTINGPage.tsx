import { Box, Text } from 'ink';
import type { PageMeta } from '../types.js';

/**
 * SETTING 页 — 占位
 * 规划功能：设置
 */
export const meta: PageMeta = {
  num: 3,
  label: 'SETTING',
  color: '#ed0c0c',
  hints: []
};

export default function SETTINGPage() {
  return (
    <Box flexGrow={1} alignItems="center" justifyContent="center">
      <Text color="#57606A">🚀 SETTING · 待填充</Text>
    </Box>
  );
}
