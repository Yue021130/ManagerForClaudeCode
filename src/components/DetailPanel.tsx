import type { ReactNode } from 'react';
import { Box, Text } from 'ink';

/**
 * DetailPanel — 右侧详情面板容器
 * 带标题、焦点指示、空态提示
 */
export interface DetailPanelProps {
  title?: string;
  isFocused?: boolean;
  children?: ReactNode;
  width?: number;
  emptyMessage?: string;
  flexGrow?: boolean;
  paddingX?: number;
}

export default function DetailPanel({
  title = 'Details',
  isFocused = false,
  children,
  width,
  emptyMessage = 'Select an item',
  flexGrow = false,
  paddingX = 1
}: DetailPanelProps) {
  const boxProps = flexGrow ? { flexGrow: 1 } : { width };

  return (
    <Box {...boxProps} flexDirection="column" paddingX={paddingX}>
      <Box>
        <Text bold color={isFocused ? '#E6EDF3' : '#8B949E'} dimColor={!isFocused}>{title}</Text>
        {/* 焦点窗口时显示强调色指示器 */}
        {isFocused && <Text color="#E3B341">{'  ◉'}</Text>}
      </Box>
      {children ? children : (
        <Text color="#57606A">{emptyMessage}</Text>
      )}
    </Box>
  );
}
