import React from 'react';
import { Box, Text } from 'ink';

// 竖线分隔符（面板之间）
export default function VerticalDivider({ paddingY = 1 }) {
  return (
    <Box width={1} flexDirection="column" paddingY={paddingY}>
      <Text color="#30363D">│</Text>
    </Box>
  );
}
