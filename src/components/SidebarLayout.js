import React from 'react';
import { Box } from 'ink';
import VerticalDivider from './VerticalDivider.js';

/**
 * SidebarLayout — 页面级布局组件
 * 左侧面板 + 竖线分割 + 右侧面板
 * MCP / Skills / Trash 三个页面共用此布局
 */
export default function SidebarLayout({ leftWidth, leftContent, rightContent }) {
  return (
    <Box flexGrow={1} flexDirection="row" overflow="hidden">
      {leftContent}
      <VerticalDivider />
      {rightContent}
    </Box>
  );
}
