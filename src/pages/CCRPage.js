import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';

/**
 * CCR 页面 — 占位
 * meta 是页面与外壳的契约：num(数字键) / label(Tab名) / color(Tab色) / hints(底部键帽)
 */
export const meta = {
  num: 1,
  label: 'CCR',
  color: THEME.magentaBright,
  hints: []
};

export default function CCRPage() {
  return (
    <Box flexGrow={1} alignItems="center" justifyContent="center">
      <Text color={THEME.faint}>CCR · 待填充</Text>
    </Box>
  );
}
