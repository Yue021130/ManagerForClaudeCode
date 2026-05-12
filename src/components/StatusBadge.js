import React from 'react';
import { Text } from 'ink';
import { THEME } from '../theme.js';

// 启用/禁用状态徽章：绿色 ON / 灰色 OFF 胶囊
export default function StatusBadge({ disabled, activeLabel = 'ON', disabledLabel = 'OFF' }) {
  return (
    <Text
      bold
      backgroundColor={disabled ? THEME.chipBg : THEME.success}
      color={disabled ? THEME.muted : THEME.onAccent}
    >
      {` ${disabled ? disabledLabel : activeLabel} `}
    </Text>
  );
}
