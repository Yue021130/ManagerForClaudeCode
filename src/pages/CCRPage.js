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

  // 编辑模式 — Provider/Model 选择弹窗
  if (ccrEditMode) {
    return (
      <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1} flexDirection="row">
          <Text bold color={THEME.warnBright}>Select Provider/Model</Text>
          <Text color={THEME.faint}>{` for `}</Text>
          <Text bold color={THEME.fg}>{ROUTER_RULES[ccrSelectedRouterRule]?.label}</Text>
        </Box>
        <Box marginBottom={1}>
          <Text backgroundColor={THEME.chipBg} color={THEME.infoBright} bold> ↑↓ </Text>
          <Text color={THEME.faint}> navigate  </Text>
          <Text backgroundColor={THEME.chipBg} color={THEME.infoBright} bold> ↵ </Text>
          <Text color={THEME.faint}> confirm  </Text>
          <Text backgroundColor={THEME.chipBg} color={THEME.infoBright} bold> Esc </Text>
          <Text color={THEME.faint}> cancel</Text>
        </Box>
        <Box flexDirection="column">
          {editScrollOffset > 0 && <Text color={THEME.faint}>↑ {editScrollOffset}</Text>}
          {visibleEditOptions.map((opt, i) => {
            const realIdx = editScrollOffset + i;
            const active = realIdx === ccrEditSelected;
            return (
              <Box key={opt.label} flexDirection="row" backgroundColor={active ? THEME.warnBright : undefined}>
                <Text bold color={active ? THEME.onAccent : THEME.faint}>{active ? '❯ ' : '  '}</Text>
                <Text bold={active} color={active ? THEME.onAccent : THEME.fg} wrap="truncate">{opt.label}</Text>
              </Box>
            );
          })}
          {editScrollOffset + editVisible < editOptions.length && (
            <Text color={THEME.faint}>↓ {editOptions.length - editScrollOffset - editVisible}</Text>
          )}
        </Box>
      </Box>
    );
  }

  // CCR 未安装提示
  if (!ccrManager || !ccrManager.isAvailable()) {
    return (
      <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color={THEME.magentaBright}>CCR Router</Text>
        <Box marginY={1} />
        <Text>
          <Text color={THEME.fg}>Config not found at </Text>
          <Text color={THEME.warn}>~/.claude-code-router/config.json</Text>
        </Text>
        <Box marginY={1} />
        <Text color={THEME.muted}>Install and configure CCR first:</Text>
        <Box marginTop={1} flexDirection="row">
          <Text backgroundColor={THEME.chipBg} color={THEME.infoBright}> npm install -g @musistudio/claude-code-router </Text>
        </Box>
        <Box marginTop={1} flexDirection="row">
          <Text backgroundColor={THEME.chipBg} color={THEME.infoBright}> ccr ui </Text>
        </Box>
      </Box>
    );
  }

  return (
    <>
      {/* ── 左栏：Providers ── */}
      <Box width={leftWidth} flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color={ccrActiveWindow === 0 ? THEME.fg : THEME.muted} dimColor={ccrActiveWindow !== 0}>Providers</Text>
          <Text color={THEME.onAccent} backgroundColor={THEME.chipBg}>{` ${providers.length} `}</Text>
          {ccrActiveWindow === 0 && <Text color={THEME.magentaBright}>{' ◉'}</Text>}
        </Box>
        {scrollOffset > 0 && <Text color={THEME.faint}>↑ {scrollOffset}</Text>}
        {visibleProviders.map((p, i) => {
          const realIdx = scrollOffset + i;
          const active = realIdx === ccrSelectedProvider;
          return (
            <Box key={p.name} flexDirection="row" width={leftWidth - 2} backgroundColor={active ? THEME.magentaBright : undefined}>
              <Text bold color={active ? THEME.onAccent : THEME.faint}>{active ? '❯ ' : '  '}</Text>
              <Text bold={active} color={active ? THEME.onAccent : THEME.fg} wrap="truncate">{p.name}</Text>
            </Box>
          );
        })}
        {scrollOffset + listVisible < providers.length && (
          <Text color={THEME.faint}>↓ {providers.length - scrollOffset - listVisible}</Text>
        )}
      </Box>

      <Box width={1} flexDirection="column" paddingY={1}>
        <Text color={THEME.border}>│</Text>
      </Box>

      {/* ── 中栏：Provider 详情 ── */}
      <Box width={middleWidth} flexDirection="column" paddingX={1}>
        <Box marginBottom={1} flexDirection="row">
          <Text bold color={ccrActiveWindow === 1 ? THEME.fg : THEME.muted} dimColor={ccrActiveWindow !== 1}>Provider</Text>
          {ccrActiveWindow === 1 && <Text color={THEME.magentaBright}>{'  ◉'}</Text>}
        </Box>
        {selectedProvider ? (
          <Box flexDirection="column">
            <Text bold color={THEME.fg}>{selectedProvider.name}</Text>
            <Box marginY={1} />
            <Text color={THEME.faint}>API Base</Text>
            <Text color={THEME.fg} wrap="truncate">{selectedProvider.api_base_url}</Text>
            <Box marginY={1} />
            <Text color={THEME.faint}>API Key</Text>
            <Box flexDirection="row">
              <Text color={ccrShowKeys ? THEME.warnBright : THEME.muted}>
                {ccrShowKeys ? selectedProvider.api_key : maskApiKey(selectedProvider.api_key)}
              </Text>
              <Text> </Text>
              <Text backgroundColor={THEME.chipBg} color={THEME.infoBright} bold> s </Text>
            </Box>
            <Box marginY={1} />
            <Text color={THEME.faint}>Models ({selectedProvider.models?.length || 0})</Text>
            {(selectedProvider.models || []).map((m, i) => (
              <Text key={i} color={THEME.fg}>  {m}</Text>
            ))}
          </Box>
        ) : (
          <Text color={THEME.faint}>Select a provider</Text>
        )}
      </Box>

      <Box width={1} flexDirection="column" paddingY={1}>
        <Text color={THEME.border}>│</Text>
      </Box>

      {/* ── 右栏：Router 规则 ── */}
      <Box width={rightWidth} flexDirection="column" paddingX={1}>
        <Box marginBottom={1} flexDirection="row">
          <Text bold color={ccrActiveWindow === 2 ? THEME.fg : THEME.muted} dimColor={ccrActiveWindow !== 2}>Router</Text>
          {ccrActiveWindow === 2 && <Text color={THEME.magentaBright}>{'  ◉'}</Text>}
        </Box>
        {ROUTER_RULES.map((rule, i) => {
          const active = i === ccrSelectedRouterRule && ccrActiveWindow === 2;
          const value = router[rule.key] || '';
          const { provider, model } = ccrManager.parseRouterValue(value);
          return (
            <Box key={rule.key} flexDirection="column" marginBottom={1}>
              <Box flexDirection="row">
                <Text bold color={active ? THEME.onAccent : THEME.faint} backgroundColor={active ? THEME.magentaBright : undefined}>
                  {active ? '❯ ' : '  '}
                </Text>
                <Text bold={active} backgroundColor={active ? THEME.magentaBright : undefined} color={active ? THEME.onAccent : THEME.muted}>
                  {rule.label}
                </Text>
              </Box>
              {value ? (
                <Box flexDirection="row">
                  <Text color={THEME.faint}>    ↳ </Text>
                  <Text color={THEME.success}>{provider}</Text>
                  {model && <Text color={THEME.fg}>,{model}</Text>}
                </Box>
              ) : (
                <Text color={THEME.faint}>    —</Text>
              )}
              {active && (
                <Text color={THEME.warn}>
                  {'    '}
                  <Text backgroundColor={THEME.chipBg} color={THEME.warnBright} bold> ↵ </Text>
                  {' '}{value ? 'clear' : 'set'}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>
    </>
  );
}
