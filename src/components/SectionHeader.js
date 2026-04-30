import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';

// 区块分割标题：── 标题 ──
export default function SectionHeader({ title }) {
  return (
    <Box marginY={1}>
      <Text color={THEME.muted} dimColor>── {title} ──</Text>
    </Box>
  );
}
