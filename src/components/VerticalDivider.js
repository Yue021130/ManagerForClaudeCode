import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';

export default function VerticalDivider({ paddingY = 1 }) {
  return (
    <Box width={1} flexDirection="column" paddingY={paddingY}>
      <Text color={THEME.muted}>│</Text>
    </Box>
  );
}
