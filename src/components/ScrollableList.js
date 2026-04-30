import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';
import { useScrollableList } from '../hooks/useScrollableList.js';

/**
 * ScrollableList — 带虚拟滚动的列表组件
 *
 * 接受 useScrollableList hook 计算出的可见窗口，
 * 只渲染屏幕可见范围内的项，上方/下方超出部分用 "↑ N" / "↓ N" 指示。
 *
 * @param renderItem(item, realIdx, isActive) — 自定义每项的渲染，由父组件注入
 */
export default function ScrollableList({
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
  activeColor = THEME.infoBright,
  inactiveColor = 'gray'
}) {
  const {
    visibleList,
    hasMoreAbove,
    hasMoreBelow,
    aboveCount,
    belowCount,
    scrollOffset
  } = useScrollableList(items, selectedIndex, terminalHeight, headerOffset, minVisible);

  return (
    <Box width={width} flexDirection="column" paddingX={paddingX}>
      {/* 标题行 + 计数 */}
      {title && (
        <Box marginBottom={1}>
          <Text color={THEME.muted} dimColor>{title}</Text>
          {showCount && <Text color={THEME.muted}>{'  '}{items.length}</Text>}
        </Box>
      )}
      {/* 上方溢出指示 */}
      {hasMoreAbove && <Text color={THEME.muted} dimColor>↑ {aboveCount}</Text>}
      {/* 可见项渲染 */}
      {visibleList.map((item, i) => {
        const realIdx = scrollOffset + i;
        const isActive = realIdx === selectedIndex;
        return (
          <Box key={typeof item === 'string' ? item : item.key || i} flexDirection="row">
            <Text color={isActive ? activeColor : inactiveColor}>{isActive ? '▸ ' : '  '}</Text>
            {renderItem(item, realIdx, isActive)}
          </Box>
        );
      })}
      {/* 下方溢出指示 */}
      {hasMoreBelow && <Text color={THEME.muted} dimColor>↓ {belowCount}</Text>}
    </Box>
  );
}
