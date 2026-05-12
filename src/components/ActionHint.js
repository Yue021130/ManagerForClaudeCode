import React from 'react';
import { Text } from 'ink';
import { THEME } from '../theme.js';

// 操作提示按钮样式：❯ 标签（箭头用强调色）
export default function ActionHint({ label, color = THEME.warnBright }) {
  return (
    <Text>
      <Text color={THEME.accent}>❯ </Text>
      <Text color={color}>{label}</Text>
    </Text>
  );
}
