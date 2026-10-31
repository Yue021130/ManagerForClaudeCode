import { Text } from 'ink';

// 启用/禁用状态徽章：绿色 ON / 灰色 OFF 胶囊
export interface StatusBadgeProps {
  disabled?: boolean;
  activeLabel?: string;
  disabledLabel?: string;
}

export default function StatusBadge({ disabled = false, activeLabel = 'ON', disabledLabel = 'OFF' }: StatusBadgeProps) {
  return (
    <Text
      bold
      backgroundColor={disabled ? '#6E7681' : '#3FB950'}
      color="#0D1117"
    >
      {` ${disabled ? disabledLabel : activeLabel} `}
    </Text>
  );
}
