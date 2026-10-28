import { Box, Text } from 'ink';

// 区块分割标题：── 标题 ──────────
// 标题 flexShrink=0 防挤压，横线 flexGrow 填满剩余宽度并截断，自适应任意面板宽度
export interface SectionHeaderProps {
  title?: string;
}

export default function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <Box marginY={1} flexDirection="row">
      <Box flexShrink={0}>
        <Text color="#30363D">{'─'}</Text>
      </Box>
      <Box flexShrink={0}>
        <Text bold color="#E6EDF3">{title ? ` ${title} ` : ''}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text color="#30363D" wrap="truncate">{'─'.repeat(120)}</Text>
      </Box>
    </Box>
  );
}
