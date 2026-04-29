import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';
import { useScrollableList } from '../hooks/useScrollableList.js';

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
      {title && (
        <Box marginBottom={1}>
          <Text color={THEME.muted} dimColor>{title}</Text>
          {showCount && <Text color={THEME.muted}>{'  '}{items.length}</Text>}
        </Box>
      )}
      {hasMoreAbove && <Text color={THEME.muted} dimColor>↑ {aboveCount}</Text>}
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
      {hasMoreBelow && <Text color={THEME.muted} dimColor>↓ {belowCount}</Text>}
    </Box>
  );
}
