import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';

export const meta = {
  num: 2,
  label: 'SKILL',
  color: THEME.infoBright,
  hints: []
};

export default function SKILLPage() {
  return (
    <Box flexGrow={1} alignItems="center" justifyContent="center">
      <Text color={THEME.faint}>SKILL · 待填充</Text>
    </Box>
  );
}
