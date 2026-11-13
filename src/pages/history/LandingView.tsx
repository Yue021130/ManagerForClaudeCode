import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PageProps } from '../../types.js';
import { GOODBYE_ART } from '../../shell/goodbye.js';
import { SPLASH_SUBTITLE, SPLASH_HINT } from '../../shell/splash.js';

/**
 * LandingView — HISTORY 落地页（首页菜单）
 *
 * 布局（对照 mockup）：左侧一大块「最近对话」，右侧三块等高竖排
 * （历史总览 / 迁移管理 / 删除记录）；MFCC 字符画组用 absolute 浮在区块层上、
 * 整屏居中（同确认弹窗的摆法：absolute + marginTop + 满宽 alignItems center）。
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

const ART_COLOR = '#22D3EE'; // 与 splash 字符画亮档同色

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

  // logo 组高度：字符画 + 空行 + 副标题 + 空行 + 提示行
  const logoLines = GOODBYE_ART.length + 1 + 1 + 1 + 1;
  const logoTop = Math.max(0, Math.floor((height - logoLines) / 2));

  // 左块占约 2/3 宽（数字定宽比百分比 + margin 好预测）；右列 flexGrow 占满剩余
  const leftW = Math.max(20, Math.floor(width * 0.64) - 2);

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
    <Box width={width} height={height} flexDirection="column">
      {/* 区块层：左一大块 + 右侧三块等高竖排 */}
      <Box flexDirection="row" flexGrow={1}>
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
      {/* logo 浮层：整屏居中，后渲染浮在区块层之上 */}
      <Box position="absolute" marginTop={logoTop} width={width} flexDirection="column" alignItems="center">
        {GOODBYE_ART.map((line, i) => (
          <Text key={i} color={ART_COLOR}>
            {line}
          </Text>
        ))}
        <Box height={1} />
        <Text color="#9CA3AF">{SPLASH_SUBTITLE}</Text>
        <Box height={1} />
        <Text color="#E5E7EB">{SPLASH_HINT}</Text>
      </Box>
    </Box>
  );
}
