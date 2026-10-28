import React from 'react';
import { Box, Text } from 'ink';

/**
 * PLUGINS 页 — 占位
 * 规划功能：MCP / Skills / 插件统一分类管理（编程类/逆向类…），
 *           一键拔插：不用的移入备份池，要用的载入，减少无用上下文
 */
export const meta = {
  num: 2,
  label: 'PLUGINS',
  color: '#56D364',
  hints: []
};

export default function PLUGINSPage() {
  return (
    <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      <Text color="#57606A">PLUGINS · 待填充</Text>
      <Text color="#57606A" dimColor>MCP / Skills / 插件分类管理 · 一键拔插 · 备份池</Text>
    </Box>
  );
}
