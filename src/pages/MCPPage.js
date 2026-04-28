import React from 'react';
import { Box, Text } from 'ink';
import { THEME, MCP_WINDOWS } from '../theme.js';
import { SUPPORTED_CLIS } from '../ConfigManager.js';
import { maskValue } from '../theme.js';

const CLI_NAMES = {
  [SUPPORTED_CLIS.CLAUDE]: 'Claude Code',
  [SUPPORTED_CLIS.GEMINI]: 'Gemini Code Assist'
};

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

  const leftWidth = Math.floor(terminalWidth * 0.28);
  const middleWidth = Math.floor(terminalWidth * 0.44);
  const rightWidth = terminalWidth - leftWidth - middleWidth;

  const contentHeight = terminalHeight - 5;
  const listVisible = Math.max(5, contentHeight);
  const scrollOffset = Math.max(0, Math.min(
    selectedIndex - Math.floor(listVisible / 2),
    Math.max(0, mcpList.length - listVisible)
  ));
  const visibleList = mcpList.slice(scrollOffset, scrollOffset + listVisible);

  return (
    <>
      {/* Left: List */}
      <Box width={leftWidth} flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color="gray" dimColor>MCP Servers</Text>
          <Text color="gray">{'  '}{mcpList.length}</Text>
        </Box>
        {scrollOffset > 0 && <Text color="gray" dimColor>↑ {scrollOffset}</Text>}
        {visibleList.map((name, i) => {
          const realIdx = scrollOffset + i;
          const active = realIdx === selectedIndex;
          const disabled = mcpServers[name]?.clis[Object.keys(mcpServers[name].clis)[0]]?.config?.disabled;
          return (
            <Box key={name} flexDirection="row">
              <Text color={active ? THEME.successBright : 'gray'}>{active ? '▸ ' : '  '}</Text>
              <Text color={active ? THEME.fg : disabled ? THEME.muted : THEME.fg} dimColor={disabled && !active} wrap="truncate">
                {name}
              </Text>
              <Box flexGrow={1} />
              <Text color={disabled ? THEME.danger : THEME.success}>{disabled ? '○' : '●'}</Text>
            </Box>
          );
        })}
        {scrollOffset + listVisible < mcpList.length && (
          <Text color="gray" dimColor>↓ {mcpList.length - scrollOffset - listVisible}</Text>
        )}
      </Box>

      {/* Divider */}
      <Box width={1} flexDirection="column" paddingY={1}>
        <Text color="gray">│</Text>
      </Box>

      {/* Middle: Details */}
      <Box width={middleWidth} flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color="gray" dimColor>Details</Text>
          {activeWindow === MCP_WINDOWS.DETAILS && <Text color={THEME.warnBright}>{'  '}●</Text>}
        </Box>
        {serverInfo ? (
          <MCPDetails
            serverInfo={serverInfo}
            selectedItem={selectedItem}
            detailMenu={detailMenu}
            detailMenuIndex={detailMenuIndex}
            activeWindow={activeWindow}
          />
        ) : (
          <Text color="gray" dimColor>Select a server</Text>
        )}
      </Box>

      {/* Divider */}
      <Box width={1} flexDirection="column" paddingY={1}>
        <Text color="gray">│</Text>
      </Box>

      {/* Right: CLI */}
      <Box width={rightWidth} flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color="gray" dimColor>CLI</Text>
          {activeWindow === MCP_WINDOWS.PARAMS && <Text color={THEME.warnBright}>{'  '}●</Text>}
        </Box>
        {serverInfo ? (
          <Box flexDirection="column">
            {availableCLIs.map((cli, index) => {
              const hasCli = !!serverInfo.clis[cli];
              const isSelected = activeWindow === MCP_WINDOWS.PARAMS && index === cliSelectedIndex;
              return (
                <Box key={cli} flexDirection="row">
                  <Text color={isSelected ? THEME.successBright : 'gray'}>{isSelected ? '▸ ' : '  '}</Text>
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
          </Box>
        ) : (
          <Text color="gray" dimColor>Select a server</Text>
        )}
      </Box>
    </>
  );
}

function MCPDetails({ serverInfo, selectedItem, detailMenu, detailMenuIndex, activeWindow }) {
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
      <Text bold color={THEME.fg}>{selectedItem}</Text>
      <Box marginY={1} flexDirection="row">
        <Text color="gray">Status </Text>
        {isDisabled ? (
          <Text color={THEME.dangerBright}>Disabled</Text>
        ) : (
          <Text color={THEME.successBright}>Active</Text>
        )}
      </Box>
      <Text color="gray" dimColor>{configPaths}</Text>
      <Box marginY={1} />
      {configEntries.map(([key, value]) => {
        if (Array.isArray(value)) {
          return (
            <Box key={key} flexDirection="column" marginBottom={1}>
              <Text color="gray">{key}</Text>
              {value.map((item, i) => (
                <Text key={i} color="white" wrap="truncate">  {String(item)}</Text>
              ))}
            </Box>
          );
        }
        if (typeof value === 'object' && value !== null) {
          return (
            <Box key={key} flexDirection="column" marginBottom={1}>
              <Text color="gray">{key}</Text>
              {Object.entries(value).map(([k, v]) => (
                <Text key={k} color="white" wrap="truncate">  {k}: {maskValue(k, v)}</Text>
              ))}
            </Box>
          );
        }
        return (
          <Text key={key} wrap="truncate" color="white">
            <Text color="gray">{key}: </Text>{String(value)}
          </Text>
        );
      })}
      <Box marginTop={1} />
      {detailMenu.map((item, i) => {
        const active = activeWindow === MCP_WINDOWS.DETAILS && i === detailMenuIndex;
        return (
          <Text key={item.action} color={active ? THEME.warnBright : 'gray'}>
            {active ? '▸ ' : '  '}{item.label}
          </Text>
        );
      })}
    </Box>
  );
}
