import React from 'react';
import { Text } from 'ink';
import { THEME } from '../theme.js';

export default function ActionHint({ label, color = THEME.warnBright }) {
  return <Text color={color}>▸ {label}</Text>;
}
