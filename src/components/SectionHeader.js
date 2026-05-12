import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';

// 区块分割标题：── 标题 ──────────
// 标题 flexShrink=0 防挤压，横线 flexGrow 填满剩余宽度并截断，自适应任意面板宽度
export default function SectionHeader({ title }) {
  return (
    <Box marginY={1} flexDirection="row">
      <Box flexShrink={0}>
        <Text color={THEME.border}>{'─'}</Text>
      </Box>
      <Box flexShrink={0}>
        <Text bold color={THEME.fg}>{title ? ` ${title} ` : ''}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={THEME.border} wrap="truncate">{'─'.repeat(120)}</Text>
      </Box>
    </Box>
  );
}
