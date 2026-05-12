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
 * 选中行整行高亮：背景铺满列表宽度，renderItem 内部在 isActive 时
 * 应使用 THEME.onAccent 作为文字色，保证对比度。
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

  // paddingX 占 2 列，内容行铺满剩余宽度
  const rowWidth = Math.max(0, (width || 0) - paddingX * 2);

  return (
    <Box width={width} flexDirection="column" paddingX={paddingX}>
      {/* 标题行 + 计数徽章 */}
      {title && (
        <Box marginBottom={1}>
          <Text bold color={THEME.fg}>{title}</Text>
          {showCount && (
            <Text color={THEME.onAccent} backgroundColor={THEME.chipBg}>{` ${items.length} `}</Text>
          )}
        </Box>
      )}
      {/* 上方溢出指示 */}
      {hasMoreAbove && <Text color={THEME.faint}>↑ {aboveCount}</Text>}
      {/* 可见项渲染 — 选中行整行背景高亮 */}
      {visibleList.map((item, i) => {
        const realIdx = scrollOffset + i;
        const isActive = realIdx === selectedIndex;
        return (
          <Box
            key={typeof item === 'string' ? item : item.key || i}
            flexDirection="row"
            width={rowWidth}
            backgroundColor={isActive ? activeColor : undefined}
          >
            <Text bold color={isActive ? THEME.onAccent : inactiveColor}>{isActive ? '❯ ' : '  '}</Text>
            {renderItem(item, realIdx, isActive)}
          </Box>
        );
      })}
      {/* 下方溢出指示 */}
      {hasMoreBelow && <Text color={THEME.faint}>↓ {belowCount}</Text>}
    </Box>
  );
}
