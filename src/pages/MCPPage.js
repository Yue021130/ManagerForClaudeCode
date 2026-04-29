import React from 'react';
import { Box, Text } from 'ink';
import { THEME, MCP_WINDOWS } from '../theme.js';
import { SUPPORTED_CLIS } from '../ConfigManager.js';
import { CLI_NAMES } from '../constants/cliNames.js';
import { maskValue } from '../theme.js';
import SidebarLayout from '../components/SidebarLayout.js';
import ScrollableList from '../components/ScrollableList.js';
import DetailPanel from '../components/DetailPanel.js';
import StatusBadge from '../components/StatusBadge.js';
import SectionHeader from '../components/SectionHeader.js';

export default function MCPPage({
  mcpServers,
  selectedItem,
  selectedIndex,
  cliSelectedIndex,
  detailMenuIndex,
  detailMenu,
  activeWindow,
  availableCLIs,
  terminalWidth,
  terminalHeight
}) {
  const mcpList = Object.keys(mcpServers).sort();
  const serverInfo = selectedItem ? mcpServers[selectedItem] : null;
  const leftWidth = Math.floor(terminalWidth * 0.32);

  return (
    <SidebarLayout
      leftWidth={leftWidth}
      leftContent={
        <ScrollableList
          title="MCP Servers"
          items={mcpList}
          selectedIndex={selectedIndex}
          terminalHeight={terminalHeight}
          width={leftWidth}
          activeColor={THEME.successBright}
          renderItem={(name, index, isActive) => {
            const disabled = mcpServers[name]?.clis[Object.keys(mcpServers[name].clis)[0]]?.config?.disabled;
            return (
              <>
                <Text color={isActive ? THEME.fg : disabled ? THEME.muted : THEME.fg} dimColor={disabled && !isActive} wrap="truncate">
                  {name}
                </Text>
                <Box flexGrow={1} />
                <Text color={disabled ? THEME.danger : THEME.success}>{disabled ? '○' : '●'}</Text>
              </>
            );
          }}
        />
      }
      rightContent={
        <DetailPanel
          title="Details"
          isFocused={activeWindow !== MCP_WINDOWS.LIST}
          emptyMessage="Select a server"
          flexGrow
        >
          {serverInfo && (
            <MCPDetailContent
              serverInfo={serverInfo}
              selectedItem={selectedItem}
              detailMenu={detailMenu}
              detailMenuIndex={detailMenuIndex}
              activeWindow={activeWindow}
              availableCLIs={availableCLIs}
              cliSelectedIndex={cliSelectedIndex}
            />
          )}
        </DetailPanel>
      }
    />
  );
}

function MCPDetailContent({ serverInfo, selectedItem, detailMenu, detailMenuIndex, activeWindow, availableCLIs, cliSelectedIndex }) {
  const firstCli = Object.keys(serverInfo.clis)[0];
  const config = serverInfo.clis[firstCli]?.config || {};
  const isDisabled = !!config.disabled;
  const configPaths = Object.keys(serverInfo.clis)
    .map(cli =>
      cli === SUPPORTED_CLIS.CLAUDE ? '~/.claude.json' :
      cli === SUPPORTED_CLIS.GEMINI ? '~/.gemini/settings.json' : cli
    )
    .join(', ');

  const configEntries = Object.entries(config).filter(([k]) => k !== 'disabled');

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Text bold color={THEME.fg}>{selectedItem}</Text>
      <Box marginY={1} flexDirection="row">
        <Text color={THEME.muted}>Status </Text>
        <StatusBadge disabled={isDisabled} />
      </Box>
      <Text color={THEME.muted} dimColor>{configPaths}</Text>

      {/* Configuration Section */}
      <SectionHeader title="Configuration" />
      {configEntries.length === 0 ? (
        <Text color={THEME.muted} dimColor>No configuration</Text>
      ) : (
        configEntries.map(([key, value]) => {
          if (Array.isArray(value)) {
            return (
              <Box key={key} flexDirection="column" marginBottom={1}>
                <Text color={THEME.muted}>{key}</Text>
                {value.map((item, i) => (
                  <Text key={i} color={THEME.fg} wrap="truncate">  {String(item)}</Text>
                ))}
              </Box>
            );
          }
          if (typeof value === 'object' && value !== null) {
            return (
              <Box key={key} flexDirection="column" marginBottom={1}>
                <Text color={THEME.muted}>{key}</Text>
                {Object.entries(value).map(([k, v]) => (
                  <Text key={k} color={THEME.fg} wrap="truncate">  {k}: {maskValue(k, v)}</Text>
                ))}
              </Box>
            );
          }
          return (
            <Text key={key} wrap="truncate" color={THEME.fg}>
              <Text color={THEME.muted}>{key}: </Text>{String(value)}
            </Text>
          );
        })
      )}

      {/* Associated CLIs Section */}
      <SectionHeader title="Associated CLIs" />
      {availableCLIs.map((cli, index) => {
        const hasCli = !!serverInfo.clis[cli];
        const isSelected = activeWindow === MCP_WINDOWS.PARAMS && index === cliSelectedIndex;
        return (
          <Box key={cli} flexDirection="row" marginBottom={1}>
            <Text color={isSelected ? THEME.successBright : THEME.muted}>{isSelected ? '▸ ' : '  '}</Text>
            <Text color={isSelected ? THEME.fg : THEME.muted}>{CLI_NAMES[cli]}</Text>
            <Box flexGrow={1} />
            <Text color={hasCli ? THEME.success : THEME.muted}>{hasCli ? '●' : '○'}</Text>
            {isSelected && (
              <Box marginLeft={1}>
                <Text color={THEME.warn} dimColor>[↵]</Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* Actions Section */}
      <SectionHeader title="Actions" />
      {detailMenu.map((item, i) => {
        const active = activeWindow === MCP_WINDOWS.DETAILS && i === detailMenuIndex;
        return (
          <Text key={item.action} color={active ? THEME.warnBright : THEME.muted}>
            {active ? '▸ ' : '  '}{item.label}
          </Text>
        );
      })}
    </Box>
  );
}
