import React from 'react';
import { Box, Text } from 'ink';
import { THEME, MCP_WINDOWS } from '../theme.js';
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
  detailMenuIndex,
  detailMenu,
  activeWindow,
  pendingDelete,
  terminalWidth,
  terminalHeight
}) {
  const mcpList = Object.keys(mcpServers).sort();
  const serverInfo = selectedItem ? mcpServers[selectedItem] : null;
  const leftWidth = Math.floor(terminalWidth * 0.32);

  return (
    <Box flexDirection="column" flexGrow={1}>
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
              const disabled = !mcpServers[name]?.enabled;
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
              />
            )}
          </DetailPanel>
        }
      />

      {/* 删除确认条 — pendingDelete 非空时显示，按键由 App.js 的模态逻辑处理 */}
      {pendingDelete !== null && (
        <Box height={1} paddingX={1}>
          <Text color={THEME.dangerBright}>
            Delete &quot;{pendingDelete}&quot;? <Text color={THEME.successBright}>y</Text> = yes / <Text color={THEME.muted}>n</Text> = no
          </Text>
        </Box>
      )}
    </Box>
  );
}

function MCPDetailContent({ serverInfo, selectedItem, detailMenu, detailMenuIndex, activeWindow }) {
  const config = serverInfo.config || {};
  const isDisabled = !serverInfo.enabled;
  const configEntries = Object.entries(config).filter(([k]) => k !== 'disabled');

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Text bold color={THEME.fg}>{selectedItem}</Text>
      <Box marginY={1} flexDirection="row">
        <Text color={THEME.muted}>Status </Text>
        <StatusBadge disabled={isDisabled} />
      </Box>
      <Text color={THEME.muted} dimColor>~/.claude.json</Text>

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
