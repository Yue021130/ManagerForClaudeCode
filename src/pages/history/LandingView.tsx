import { useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { PageProps } from '../../types.js';
import type { ProjectInfo, SessionMeta } from './types.js';
import { dayKey, fmtCount, fmtDate, fmtSize } from './fmt.js';
import Mascot, { MASCOT_W } from './Mascot.js';

/**
 * LandingView — HISTORY 落地页（数据看板 + 功能菜单）
 *
 * 上部：统计面板（范围页签 + 对话/项目/提问/回答/输入token/输出token/占用 等宽列横排，
 *       口径随 tab 范围；右侧空地是走动吉祥物，见 Mascot.tsx）+ 竖线 + 功能条
 *       （历史总览 / 迁移管理 / 删除记录，图标 + 分隔线）。
 * 下部：🧐 最近对话卡片通栏（标题+时间 / ●+首条提问快照），占满整行宽；空会话不展示（口径同总览）。
 *
 * 键位：←→ 切换区域（列表/菜单）  ↑↓ 移动  enter（列表=恢复会话弹窗，菜单=进入功能）
 *       space 列表=进总览全屏预览该卡片  / 进历史总览并开搜索  q 退出程序
 *       tab 切换统计范围（一年/半年/一个月/一周/一天）
 *       Esc/数字键归外壳（Esc 退出、数字切页）。
 * locked=true（恢复弹窗开着）时本组件不吃任何键，键盘归弹窗。
 */

export type LandingTarget = 'overview' | 'migrate' | 'trash';

interface LandingProps extends PageProps {
  projects: ProjectInfo[];
  locked: boolean;                        // 恢复弹窗打开时锁键盘
  onSelect: (t: LandingTarget) => void;   // 右侧菜单 enter
  onResume: (s: SessionMeta) => void;     // 最近活跃卡片 enter → 恢复弹窗
  onFullscreen: (s: SessionMeta) => void; // 最近活跃卡片 space → 进总览全屏预览
  onSearch: () => void;                   // '/' → 进总览并开搜索
}

// 右侧功能菜单：图标 + 中文标签
const MENU: { id: LandingTarget; icon: string; label: string }[] = [
  { id: 'overview', icon: '◈', label: '历史总览' },
  { id: 'migrate', icon: '⇄', label: '迁移管理' },
  { id: 'trash', icon: '✕', label: '删除记录' }
];

// 统计范围（tab 切换）：三项统计的口径随它切换
const RANGES: { label: string; days: number }[] = [
  { label: '一年', days: 364 },
  { label: '半年', days: 182 },
  { label: '一个月', days: 30 },
  { label: '一周', days: 7 },
  { label: '一天', days: 1 }
];

const STRIP_W = 13;              // 右侧功能条宽（图标+空格+4 汉字 = 11 列 + 留白）
const RUNNING_MS = 3 * 60_000;   // 与 overview 同标准：3 分钟内有写入视为运行中

export default function LandingView({
  width,
  height,
  projects,
  locked,
  onSelect,
  onResume,
  onFullscreen,
  onSearch
}: LandingProps) {
  const { exit } = useApp();
  const [focus, setFocus] = useState<'list' | 'menu'>('list');
  const [listIdx, setListIdx] = useState(0);
  const [menuIdx, setMenuIdx] = useState(0);
  const [rangeIdx, setRangeIdx] = useState(0);

  // ── 汇总：全项目会话按 lastTime 倒序（最近对话列表）；空会话（无问无答的壳）不展示，口径同总览 ──
  const recent = useMemo(() => {
    const all = projects
      .flatMap(p => p.sessions)
      .filter(s => !(s.userCount === 0 && s.assistantCount === 0));
    all.sort((a, b) => (b.lastTime ?? '').localeCompare(a.lastTime ?? '')); // ISO 串可按字典序比
    return all;
  }, [projects]);

  // ── 范围统计（tab 切换口径）：以 QA 为粒度——遍历各会话日桶，只累计落在范围内的日子 ──
  const rangeStats = useMemo(() => {
    const days = RANGES[rangeIdx].days;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startKey = dayKey(new Date(today.getTime() - (days - 1) * 86400000));
    const endKey = dayKey(today);
    let sessions = 0;
    let bytes = 0;
    let input = 0;
    let output = 0;
    let questions = 0;
    let answers = 0;
    const dirs = new Set<string>();
    for (const p of projects) {
      for (const s of p.sessions) {
        let active = false;
        for (const [k, b] of Object.entries(s.days)) {
          if (k < startKey || k > endKey) continue; // 日键字典序 = 日期先后
          active = true;
          bytes += b.bytes;
          input += b.input;
          output += b.output;
          questions += b.user;
          answers += b.assistant;
        }
        if (active) {
          sessions++;
          dirs.add(p.dirName);
        }
      }
    }
    return { sessions, bytes, projects: dirs.size, input, output, questions, answers };
  }, [projects, rangeIdx]);

  // 面板区内容宽 = 总宽 - 功能条 - 竖线 - 左右 padding（下部卡片区为全宽 width-2）
  const innerW = Math.max(10, width - STRIP_W - 1 - 2);

  // 高度预算：上部 5 行（统计面板，功能条同高不超高）+ 分隔行 1 + 间隙 1，余下全给卡片（每张 4 行）
  const panelH = 5;
  const cardBudget = Math.max(1, Math.floor((height - panelH - 1 - 1) / 4));
  const shown = recent.slice(0, cardBudget);
  const li = Math.min(listIdx, Math.max(0, shown.length - 1));

  useInput((input, key) => {
    if (locked) return; // 恢复弹窗开着：键盘归弹窗
    if (key.leftArrow || key.rightArrow) return setFocus(f => (f === 'list' ? 'menu' : 'list'));
    if (key.upArrow || key.downArrow) {
      const dir = key.upArrow ? -1 : 1;
      if (focus === 'list') {
        if (shown.length) setListIdx(Math.min(Math.max(0, li + dir), shown.length - 1));
      } else {
        setMenuIdx(i => Math.min(Math.max(0, i + dir), MENU.length - 1));
      }
      return;
    }
    if (key.return) {
      if (focus === 'list') {
        const s = shown[li];
        if (s) onResume(s);
      } else {
        onSelect(MENU[menuIdx].id);
      }
      return;
    }
    if (input === ' ' && focus === 'list') {
      // 空格：列表焦点 = 全屏预览选中卡片（菜单焦点无此操作）
      const s = shown[li];
      if (s) onFullscreen(s);
      return;
    }
    if (input === '/') return onSearch();
    // 统计范围切换：tab 下一个 / shift+tab 上一个（循环）
    if (key.tab) {
      setRangeIdx(i => (key.shift ? (i - 1 + RANGES.length) : i + 1) % RANGES.length);
      return;
    }
    // 同外壳 Esc 的延迟一拍：避免在 input 派发栈内同步卸载
    if (input === 'q') setTimeout(() => exit(), 0);
  });

  return (
    <Box width={width} height={height} flexDirection="column" paddingX={1}>
      {/* ── 上部：统计面板 + 竖线 + 功能条（面板 5 行，功能条同高不撑高） ── */}
      <Box flexDirection="row">
        {/* 统计面板：范围页签 + 统计横排（最左端留吉祥物的家）；吉祥物是绝对定位叠层（Mascot.tsx） */}
        <Box borderStyle="round" borderColor="#3A3D42" flexDirection="column" paddingX={1} flexGrow={1}>
          <Box flexDirection="column" marginLeft={MASCOT_W + 1}>
            {/* 标题行：范围页签（选中紫底；tab 切换的键位提示在底栏） */}
            <Box flexDirection="row">
              {RANGES.map((r, i) => (
                <Text key={r.label}>
                  {'  '}
                  <Text
                    bold={i === rangeIdx}
                    color={i === rangeIdx ? '#A371F7' : '#6E7681'}
                    backgroundColor={i === rangeIdx ? '#2A2A3E' : undefined}
                  >{` ${r.label} `}</Text>
                </Text>
              ))}
            </Box>
            {/* 统计横排：对话/项目/提问/回答/输入/输出/占用（口径跟随 tab 范围），
                等宽列（8 列）竖线分隔，像表格一样对齐 */}
            <Box flexDirection="row">
              {(
                [
                  [String(rangeStats.sessions), '对话', '#79C0FF'],
                  [String(rangeStats.projects), '项目', '#3FB950'],
                  [fmtCount(rangeStats.questions), '提问', '#76E3EA'],
                  [fmtCount(rangeStats.answers), '回答', '#FFA657'],
                  [fmtCount(rangeStats.input), '输入', '#D2A8FF'],
                  [fmtCount(rangeStats.output), '输出', '#F778BA'],
                  [fmtSize(rangeStats.bytes), '占用', '#E3B341']
                ] as [string, string, string][]
              ).map(([v, l, c], i) => (
                <Box key={i} flexDirection="row">
                  {i > 0 && <Text color="#30363D">│</Text>}
                  <Box width={8} flexDirection="column" alignItems="center">
                    <Text bold color={c}>
                      {v}
                    </Text>
                    <Text color="#8B949E">{l}</Text>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
          {/* 吉祥物叠层：覆盖整个面板内容宽（扣边框 2 + paddingX 2），初始家在最左端；
              walkMinX = 统计块右缘（家 10 + 7 列×8 + 6 分隔线）+ 2 缓冲：散步限定右侧空旷区，不踩统计文字 */}
          <Mascot width={Math.max(0, innerW - 4)} walkMinX={MASCOT_W + 1 + (7 * 8 + 6) + 2} />
        </Box>
        {/* 分隔竖线（只隔上部，不再贯通到底） */}
        <Box width={1} borderStyle="single" borderTop={false} borderBottom={false} borderRight={false} borderColor="#30363D" />
        {/* 右侧功能条：5 行恰好与面板同高（不再 paddingTop 下压，省 1 行给卡片） */}
        <Box width={STRIP_W} flexDirection="column">
          {MENU.map((m, i) => {
            const active = focus === 'menu' && menuIdx === i;
            return (
              <Box key={m.id} flexDirection="column">
                {i > 0 && <Text color="#30363D">{'─'.repeat(STRIP_W - 1)}</Text>}
                <Box backgroundColor={active ? '#2A2A3E' : undefined}>
                  <Text bold={active} color={active ? '#A371F7' : '#8B949E'} wrap="truncate">
                    {` ${m.icon} ${m.label}`}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
      {/* ── 下部：最近对话通栏（卡片占满整行宽）；分隔标题行（左侧引一段线，标题右移） ── */}
      <Box flexDirection="row" marginTop={1}>
        <Text color="#30363D">{'─── '}</Text>
        <Text color="#8B949E">🧐 最近对话 </Text>
        <Text color="#30363D">{'─'.repeat(Math.max(2, width - 18))}</Text>
      </Box>
      {shown.length === 0 && <Text color="#6E7681">（暂无会话记录）</Text>}
      {shown.map((s, i) => {
        const active = focus === 'list' && i === li;
        const running = Date.now() - s.mtimeMs < RUNNING_MS;
        return (
          <Box
            key={s.sessionId}
            flexDirection="column"
            borderStyle="round"
            borderColor={active ? '#A371F7' : '#3A3D42'}
            backgroundColor={active ? '#2A2A3E' : undefined}
            paddingX={1}
          >
            <Box flexDirection="row">
              <Box flexGrow={1}>
                <Text bold={active} color="#E6EDF3" wrap="truncate">
                  {s.title}
                </Text>
              </Box>
              <Text color="#F85149">{fmtDate(s.lastTime)}</Text>
            </Box>
            <Box flexDirection="row">
              <Text color={running ? '#3FB950' : '#8B949E'}>{'● '}</Text>
              <Box flexGrow={1}>
                <Text color="#8B949E" wrap="truncate">
                  {s.preview || s.title}
                </Text>
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
