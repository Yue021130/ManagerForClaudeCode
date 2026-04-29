import React from 'react';
import { Text } from 'ink';
import { THEME } from '../theme.js';

export default function StatusBadge({ disabled, activeLabel = 'Active', disabledLabel = 'Disabled' }) {
  if (disabled) {
    return <Text color={THEME.dangerBright}>{disabledLabel}</Text>;
  }
  return <Text color={THEME.successBright}>{activeLabel}</Text>;
}
