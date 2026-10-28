import type { ReactNode } from 'react';
import { Box } from 'ink';
import VerticalDivider from './VerticalDivider.js';

/**
 * SidebarLayout — 页面级布局组件
 * 左侧面板 + 竖线分割 + 右侧面板
 */
export interface SidebarLayoutProps {
  leftWidth?: number;
  leftContent: ReactNode;
  rightContent: ReactNode;
}

export default function SidebarLayout({ leftContent, rightContent }: SidebarLayoutProps) {
  return (
    <Box flexGrow={1} flexDirection="row" overflow="hidden">
      {leftContent}
      <VerticalDivider />
      {rightContent}
    </Box>
  );
}
