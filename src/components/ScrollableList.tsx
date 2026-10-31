import type { ReactNode } from 'react';
import { Box, Text } from 'ink';
import { useScrollableList } from '../hooks/useScrollableList.js';

/**
 * ScrollableList — 带虚拟滚动的列表组件
 *
 * 接受 useScrollableList hook 计算出的可见窗口，
 * 只渲染屏幕可见范围内的项，上方/下方超出部分用 "↑ N" / "↓ N" 指示。
 *
 * 选中行整行高亮：背景铺满列表宽度，renderItem 内部在 isActive 时
 * 应使用深色文字（'#0D1117'），保证对比度。
 */
export interface ScrollableListProps<T> {
  title?: string;
  items: T[];
  selectedIndex: number;
  terminalHeight: number;
  /** 自定义每项的渲染，由父组件注入 */
  renderItem: (item: T, realIdx: number, isActive: boolean) => ReactNode;
  width?: number;
  showCount?: boolean;
  headerOffset?: number;
  minVisible?: number;
  paddingX?: number;
  activeColor?: string;
  /** 选中行 ❯ 的颜色；深色 activeColor 时换成亮色 */
  activeTextColor?: string;
  inactiveColor?: string;
}

export default function ScrollableList<T>({
  title,
  items,
  selectedIndex,
  terminalHeight,
  renderItem,
  width,
  showCount = true,
  headerOffset = 5,
  minVisible = 5,
  paddingX = 1,
  activeColor = '#79C0FF',
  activeTextColor = '#0D1117',
  inactiveColor = 'gray'
}: ScrollableListProps<T>) {
  const {
    visibleList,
    hasMoreAbove,
    hasMoreBelow,
    aboveCount,
    belowCount,
    scrollOffset
  } = useScrollableList(items, selectedIndex, terminalHeight, headerOffset, minVisible);

  // paddingX 占 2 列，内容行铺满剩余宽度
  const rowWidth = Math.max(0, (width || 0) - paddingX * 2);

  return (
    <Box width={width} flexDirection="column" paddingX={paddingX}>
      {/* 标题行 + 计数徽章 */}
      {title && (
        <Box marginBottom={1}>
          <Text bold color="#E6EDF3">{title}</Text>
          {showCount && (
            <Text color="#0D1117" backgroundColor="#161B22">{` ${items.length} `}</Text>
          )}
        </Box>
      )}
      {/* 上方溢出指示 */}
      {hasMoreAbove && <Text color="#57606A">↑ {aboveCount}</Text>}
      {/* 可见项渲染 — 选中行整行背景高亮 */}
      {visibleList.map((item, i) => {
        const realIdx = scrollOffset + i;
        const isActive = realIdx === selectedIndex;
        return (
          <Box
            key={i}
            flexDirection="row"
            width={rowWidth}
            backgroundColor={isActive ? activeColor : undefined}
          >
            <Text bold color={isActive ? activeTextColor : inactiveColor}>{isActive ? '❯ ' : '  '}</Text>
            {renderItem(item, realIdx, isActive)}
          </Box>
        );
      })}
      {/* 下方溢出指示 */}
      {hasMoreBelow && <Text color="#57606A">↓ {belowCount}</Text>}
    </Box>
  );
}
