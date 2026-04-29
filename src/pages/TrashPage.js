import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';
import { CLI_NAMES } from '../constants/cliNames.js';
import SidebarLayout from '../components/SidebarLayout.js';
import ScrollableList from '../components/ScrollableList.js';
import DetailPanel from '../components/DetailPanel.js';
import ActionHint from '../components/ActionHint.js';
import SectionHeader from '../components/SectionHeader.js';

export default function TrashPage({ trash, selectedItem, selectedIndex, terminalWidth, terminalHeight }) {
  const trashList = Object.keys(trash).sort();
  const item = selectedItem ? trash[selectedItem] : null;
  const leftWidth = Math.floor(terminalWidth * 0.32);

  return (
    <SidebarLayout
      leftWidth={leftWidth}
      leftContent={
        <ScrollableList
          title="Trash"
          items={trashList}
          selectedIndex={selectedIndex}
          terminalHeight={terminalHeight}
          width={leftWidth}
          activeColor={THEME.dangerBright}
          renderItem={(name, index, isActive) => (
            <Text color={isActive ? THEME.fg : THEME.muted} wrap="truncate">
              {name}
            </Text>
          )}
        />
      }
      rightContent={
        <DetailPanel emptyMessage="Select an item">
          {item && (
            <Box flexDirection="column">
              <Text bold color={THEME.fg}>{selectedItem}</Text>
              <Box marginY={1} flexDirection="row">
                <Text color={THEME.muted}>Deleted </Text>
                <Text color={THEME.muted} dimColor>{new Date(item.deletedAt).toLocaleString()}</Text>
              </Box>
              <Text color={THEME.fg}>{item.fromCLIs.map(c => CLI_NAMES[c] || c).join(', ')}</Text>
              <SectionHeader title="Actions" />
              <ActionHint label="Restore" />
            </Box>
          )}
        </DetailPanel>
      }
    />
  );
}
