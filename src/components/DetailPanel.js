import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';

export default function DetailPanel({
  title = 'Details',
  isFocused,
  children,
  width,
  emptyMessage = 'Select an item',
  flexGrow = false,
  paddingX = 1
}) {
  const boxProps = flexGrow ? { flexGrow: 1 } : { width };

  return (
    <Box {...boxProps} flexDirection="column" paddingX={paddingX}>
      <Box marginBottom={1}>
        <Text color={THEME.muted} dimColor>{title}</Text>
        {isFocused && <Text color={THEME.warnBright}>{'  '}●</Text>}
      </Box>
      {children ? children : (
        <Text color={THEME.muted} dimColor>{emptyMessage}</Text>
      )}
    </Box>
  );
}
