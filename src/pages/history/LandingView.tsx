import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PageProps } from '../../types.js';

/**
 * LandingView — HISTORY 落地页（首页菜单）
 *
 * 布局：左侧一大块「最近对话」，右侧三块等高竖排
 * （历史总览 / 迁移管理 / 删除记录），无其他装饰。
 *
 * 方向键按邻接表移动，Enter 触发 onSelect；Esc/数字键不处理
 * （landing 期间 keysEnabled=true，归外壳：Esc 退出程序、数字切页）。
 * 区块样式与会话卡一致：圆角边框，选中 = 紫框 #A371F7 + 深底 #2A2A3E。
 */

export type LandingTarget = 'recent' | 'overview' | 'migrate' | 'trash';

// 方向键邻接表：左块纵向通高，right 落在与它同水平线的「迁移管理」；右列上下循环
const NAV: Record<LandingTarget, Partial<Record<'up' | 'down' | 'left' | 'right', LandingTarget>>> = {
  recent: { right: 'migrate', up: 'overview', down: 'trash' },
  overview: { left: 'recent', up: 'trash', down: 'migrate' },
  migrate: { left: 'recent', up: 'overview', down: 'trash' },
  trash: { left: 'recent', up: 'migrate', down: 'overview' }
};

export default function LandingView({
  width,
  height,
  onSelect
}: PageProps & { onSelect: (t: LandingTarget) => void }) {
  const [sel, setSel] = useState<LandingTarget>('recent');

  useInput((_input, key) => {
    const dir = key.upArrow
      ? ('up' as const)
      : key.downArrow
        ? ('down' as const)
        : key.leftArrow
          ? ('left' as const)
          : key.rightArrow
            ? ('right' as const)
            : null;
    if (dir) {
      const next = NAV[sel][dir];
      if (next) setSel(next);
      return;
    }
    if (key.return) onSelect(sel);
  });

  // 左块占约 9.5 成宽（数字定宽比百分比 + margin 好预测）；右列 0.5 成，flexGrow 占满剩余
  const leftW = Math.max(20, Math.floor(width * 0.95) - 2);

  // 选中态与会话卡同款（HISTORYPage 卡片：紫框/深底）；未选中灰框
  const zoneStyle = (id: LandingTarget) => ({
    borderColor: sel === id ? '#A371F7' : '#3A3D42',
    backgroundColor: sel === id ? '#2A2A3E' : undefined
  });
  const zoneLabel = (id: LandingTarget, label: string) => (
    <Box paddingLeft={1}>
      <Text bold={sel === id} color={sel === id ? '#E6EDF3' : '#8B949E'}>
        {label}
      </Text>
    </Box>
  );

  return (
    <Box width={width} height={height} flexDirection="row">
      <Box width={leftW} margin={1} borderStyle="round" {...zoneStyle('recent')}>
        {zoneLabel('recent', '最近对话')}
      </Box>
      <Box flexDirection="column" flexGrow={1} marginTop={1} marginBottom={1} marginRight={1}>
        <Box flexGrow={1} borderStyle="round" {...zoneStyle('overview')}>
          {zoneLabel('overview', '历史总览')}
        </Box>
        <Box flexGrow={1} marginTop={1} borderStyle="round" {...zoneStyle('migrate')}>
          {zoneLabel('migrate', '迁移管理')}
        </Box>
        <Box flexGrow={1} marginTop={1} borderStyle="round" {...zoneStyle('trash')}>
          {zoneLabel('trash', '删除记录')}
        </Box>
      </Box>
    </Box>
  );
}
