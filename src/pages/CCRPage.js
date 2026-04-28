import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';
import { ROUTER_RULES } from '../CcrConfigManager.js';
import { maskApiKey } from '../theme.js';

export default function CCRPage({
  ccrManager,
  ccrData,
  ccrActiveWindow,
  ccrSelectedProvider,
  ccrSelectedRouterRule,
  ccrShowKeys,
  ccrEditMode,
  ccrEditSelected,
  terminalWidth,
  terminalHeight
}) {
  const providers = ccrData.providers || [];
  const router = ccrData.router || {};
  const selectedProvider = providers[ccrSelectedProvider];

  const leftWidth = Math.floor(terminalWidth * 0.28);
  const middleWidth = Math.floor(terminalWidth * 0.44);
  const rightWidth = terminalWidth - leftWidth - middleWidth;

  const contentHeight = terminalHeight - 5;
  const listVisible = Math.max(5, contentHeight);
  const scrollOffset = Math.max(0, Math.min(
    ccrSelectedProvider - Math.floor(listVisible / 2),
    Math.max(0, providers.length - listVisible)
  ));
  const visibleProviders = providers.slice(scrollOffset, scrollOffset + listVisible);

  const editOptions = ccrManager?.getAllProviderModelOptions() || [];
  const editVisible = Math.max(5, contentHeight);
  const editScrollOffset = Math.max(0, Math.min(
    ccrEditSelected - Math.floor(editVisible / 2),
    Math.max(0, editOptions.length - editVisible)
  ));
  const visibleEditOptions = editOptions.slice(editScrollOffset, editScrollOffset + editVisible);

  if (ccrEditMode) {
    return (
      <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color={THEME.warnBright}>Select Provider/Model for {ROUTER_RULES[ccrSelectedRouterRule]?.label}</Text>
        <Text color="gray" dimColor>↑↓ navigate │ Enter confirm │ Esc cancel</Text>
        <Box marginTop={1} flexDirection="column">
          {editScrollOffset > 0 && <Text color="gray" dimColor>↑ {editScrollOffset}</Text>}
          {visibleEditOptions.map((opt, i) => {
            const realIdx = editScrollOffset + i;
            const active = realIdx === ccrEditSelected;
            return (
              <Text key={opt.label} bold={active} color={active ? THEME.warnBright : THEME.fg} wrap="truncate">
                {active ? '▸ ' : '  '}{opt.label}
              </Text>
            );
          })}
          {editScrollOffset + editVisible < editOptions.length && (
            <Text color="gray" dimColor>↓ {editOptions.length - editScrollOffset - editVisible}</Text>
          )}
        </Box>
      </Box>
    );
  }

  if (!ccrManager || !ccrManager.isAvailable()) {
    return (
      <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color={THEME.magentaBright}>CCR Router</Text>
        <Box marginY={1} />
        <Text color="gray">CCR config not found at ~/.claude-code-router/config.json</Text>
        <Text color="gray">Install and configure CCR first:</Text>
        <Text color={THEME.warn}>npm install -g @musistudio/claude-code-router</Text>
        <Text color={THEME.warn}>ccr ui</Text>
      </Box>
    );
  }

  return (
    <>
      <Box width={leftWidth} flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color="gray" dimColor>Providers</Text>
          <Text color="gray">{'  '}{providers.length}</Text>
        </Box>
        {scrollOffset > 0 && <Text color="gray" dimColor>↑ {scrollOffset}</Text>}
        {visibleProviders.map((p, i) => {
          const realIdx = scrollOffset + i;
          const active = realIdx === ccrSelectedProvider;
          return (
            <Box key={p.name} flexDirection="row">
              <Text color={active ? THEME.magentaBright : 'gray'}>{active ? '▸ ' : '  '}</Text>
              <Text color={active ? THEME.fg : THEME.muted} wrap="truncate">{p.name}</Text>
            </Box>
          );
        })}
        {scrollOffset + listVisible < providers.length && (
          <Text color="gray" dimColor>↓ {providers.length - scrollOffset - listVisible}</Text>
        )}
      </Box>

      <Box width={1} flexDirection="column" paddingY={1}>
        <Text color="gray">│</Text>
      </Box>

      <Box width={middleWidth} flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color="gray" dimColor>Provider</Text>
          {ccrActiveWindow === 1 && <Text color={THEME.warnBright}>{'  '}●</Text>}
        </Box>
        {selectedProvider ? (
          <Box flexDirection="column">
            <Text bold color={THEME.fg}>{selectedProvider.name}</Text>
            <Box marginY={1} />
            <Text color="gray">API Base</Text>
            <Text color="white" wrap="truncate">{selectedProvider.api_base_url}</Text>
            <Box marginY={1} />
            <Text color="gray">API Key</Text>
            <Box flexDirection="row">
              <Text color="white">{ccrShowKeys ? selectedProvider.api_key : maskApiKey(selectedProvider.api_key)}</Text>
              <Box marginLeft={1}>
                <Text color={THEME.warn} dimColor>[s]</Text>
              </Box>
            </Box>
            <Box marginY={1} />
            <Text color="gray">Models ({selectedProvider.models?.length || 0})</Text>
            {(selectedProvider.models || []).map((m, i) => (
              <Text key={i} color="white">  {m}</Text>
            ))}
          </Box>
        ) : (
          <Text color="gray" dimColor>Select a provider</Text>
        )}
      </Box>

      <Box width={1} flexDirection="column" paddingY={1}>
        <Text color="gray">│</Text>
      </Box>

      <Box width={rightWidth} flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color="gray" dimColor>Router</Text>
          {ccrActiveWindow === 2 && <Text color={THEME.warnBright}>{'  '}●</Text>}
        </Box>
        {ROUTER_RULES.map((rule, i) => {
          const active = i === ccrSelectedRouterRule && ccrActiveWindow === 2;
          const value = router[rule.key] || '';
          const { provider, model } = ccrManager.parseRouterValue(value);
          return (
            <Box key={rule.key} flexDirection="column" marginBottom={1}>
              <Box flexDirection="row">
                <Text color={active ? THEME.magentaBright : 'gray'}>{active ? '▸ ' : '  '}</Text>
                <Text bold={active} color={active ? THEME.fg : THEME.muted}>{rule.label}</Text>
              </Box>
              {value ? (
                <Box flexDirection="row">
                  <Text color="gray">{'    '}→ </Text>
                  <Text color={THEME.success}>{provider}</Text>
                  {model && <Text color="white">,{model}</Text>}
                </Box>
              ) : (
                <Text color="gray" dimColor>{'    '}(not set)</Text>
              )}
              {active && <Text color={THEME.warn} dimColor>{'    '}[↵] {value ? 'clear' : 'set'}</Text>}
            </Box>
          );
        })}
      </Box>
    </>
  );
}
