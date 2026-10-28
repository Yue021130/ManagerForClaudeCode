import React from 'react';
import { Text } from 'ink';

// 操作提示按钮样式：❯ 标签（箭头用强调色）
export default function ActionHint({ label, color = '#E3B341' }) {
  return (
    <Text>
      <Text color="#22D3EE">❯ </Text>
      <Text color={color}>{label}</Text>
    </Text>
  );
}
