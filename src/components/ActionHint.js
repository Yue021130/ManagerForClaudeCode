import React from 'react';
import { Text } from 'ink';
import { THEME } from '../theme.js';

// 操作提示按钮样式：▸ 标签
export default function ActionHint({ label, color = THEME.warnBright }) {
  return <Text color={color}>▸ {label}</Text>;
}
