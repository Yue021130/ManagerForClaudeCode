import { Text } from 'ink';

// 操作提示按钮样式：❯ 标签（箭头用强调色）
export interface ActionHintProps {
  label: string;
  color?: string;
}

export default function ActionHint({ label, color = '#E3B341' }: ActionHintProps) {
  return (
    <Text>
      <Text color="#22D3EE">❯ </Text>
      <Text color={color}>{label}</Text>
    </Text>
  );
}
