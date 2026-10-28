import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';

export const meta = {
  num: 3,
  label: 'SETTING',
  color: THEME.accentBright,
  hints: []
};

export default function SETTINGPage() {
  return (
    <Box flexGrow={1} alignItems="center" justifyContent="center">
      <Text color={THEME.faint}>SETTING · 待填充</Text>
    </Box>
  );
}
