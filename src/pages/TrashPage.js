import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';
import { SUPPORTED_CLIS } from '../ConfigManager.js';

const CLI_NAMES = {
  [SUPPORTED_CLIS.CLAUDE]: 'Claude Code',
  [SUPPORTED_CLIS.GEMINI]: 'Gemini Code Assist'
};

export default function TrashPage({ trash, selectedItem, selectedIndex, terminalWidth, terminalHeight }) {
  const trashList = Object.keys(trash).sort();
  const item = selectedItem ? trash[selectedItem] : null;
  const leftWidth = Math.floor(terminalWidth * 0.35);
  const contentHeight = terminalHeight - 5;
  const listVisible = Math.max(5, contentHeight);
  const scrollOffset = Math.max(0, Math.min(
    selectedIndex - Math.floor(listVisible / 2),
    Math.max(0, trashList.length - listVisible)
  ));
  const visibleList = trashList.slice(scrollOffset, scrollOffset + listVisible);

  return (
    <>
      <Box width={leftWidth} flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color="gray" dimColor>Trash</Text>
          <Text color="gray">{'  '}{trashList.length}</Text>
        </Box>
        {scrollOffset > 0 && <Text color="gray" dimColor>↑ {scrollOffset}</Text>}
        {visibleList.map((name, i) => {
          const realIdx = scrollOffset + i;
          const active = realIdx === selectedIndex;
          return (
            <Box key={name} flexDirection="row">
              <Text color={active ? THEME.dangerBright : 'gray'}>{active ? '▸ ' : '  '}</Text>
              <Text color={active ? THEME.fg : THEME.muted} wrap="truncate">{name}</Text>
            </Box>
          );
        })}
        {scrollOffset + listVisible < trashList.length && (
          <Text color="gray" dimColor>↓ {trashList.length - scrollOffset - listVisible}</Text>
        )}
      </Box>

      <Box width={1} flexDirection="column" paddingY={1}>
        <Text color="gray">│</Text>
      </Box>

      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color="gray" dimColor>Details</Text>
        </Box>
        {item ? (
          <Box flexDirection="column">
            <Text bold color={THEME.fg}>{selectedItem}</Text>
            <Box marginY={1} flexDirection="row">
              <Text color="gray">Deleted </Text>
              <Text color="gray" dimColor>{new Date(item.deletedAt).toLocaleString()}</Text>
            </Box>
            <Text color="white">{item.fromCLIs.map(c => CLI_NAMES[c] || c).join(', ')}</Text>
            <Box marginTop={1}>
              <Text color={THEME.warnBright}>▸ Restore</Text>
            </Box>
          </Box>
        ) : (
          <Text color="gray" dimColor>Select an item</Text>
        )}
      </Box>
    </>
  );
}
