import React from 'react';
import { Text } from 'ink';
import { THEME } from '../theme.js';

// 启用/禁用状态文字标签：红色 Disabled / 绿色 Active
export default function StatusBadge({ disabled, activeLabel = 'Active', disabledLabel = 'Disabled' }) {
  if (disabled) {
    return <Text color={THEME.dangerBright}>{disabledLabel}</Text>;
  }
  return <Text color={THEME.successBright}>{activeLabel}</Text>;
}
