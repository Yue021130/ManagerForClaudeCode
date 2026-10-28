import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';

export const meta = {
  num: 2,
  label: 'MCP',
  color: THEME.successBright,
  hints: []
};

export default function MCPPage() {
  return (
    <Box flexGrow={1} alignItems="center" justifyContent="center">
      <Text color={THEME.faint}>MCP · 待填充</Text>
    </Box>
  );
}
