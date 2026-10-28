import { Box, Text } from 'ink';

// 竖线分隔符（面板之间）
export interface VerticalDividerProps {
  paddingY?: number;
}

export default function VerticalDivider({ paddingY = 1 }: VerticalDividerProps) {
  return (
    <Box width={1} flexDirection="column" paddingY={paddingY}>
      <Text color="#30363D">│</Text>
    </Box>
  );
}
