import React from 'react';
import { Box } from 'ink';
import VerticalDivider from './VerticalDivider.js';

export default function SidebarLayout({ leftWidth, leftContent, rightContent }) {
  return (
    <Box flexGrow={1} flexDirection="row" overflow="hidden">
      {leftContent}
      <VerticalDivider />
      {rightContent}
    </Box>
  );
}
