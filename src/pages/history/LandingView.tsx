import { useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { PageProps } from '../../types.js';
import type { ProjectInfo, SessionMeta } from './types.js';
import { fmtDate, fmtSize } from './fmt.js';

/**
 * LandingView — HISTORY 落地页（数据看板 + 功能菜单）
 *
 * 左栏看板：统计行（总对话/项目/占用）→ 近 30 天贡献热力图（GitHub 绿阶、周一对齐）→
 *           最近活跃会话卡片（标题+时间 / ●+首条提问快照），底部钉一行操作提示。
 * 右侧功能条：历史总览 / 迁移管理 / 删除记录（图标 + 分隔线），下挂键位提示。
 *
 * 键位：←→ 切换区域（列表/菜单）  ↑↓ 移动  enter（列表=恢复会话弹窗，菜单=进入功能）
 *       / 进历史总览并开搜索  q 退出程序；Esc/数字键归外壳（Esc 退出、数字切页）。
 * locked=true（恢复弹窗开着）时本组件不吃任何键，键盘归弹窗。
 */

export type LandingTarget = 'overview' | 'migrate' | 'trash';

interface LandingProps extends PageProps {
  projects: ProjectInfo[];
  locked: boolean;                   // 恢复弹窗打开时锁键盘
  onSelect: (t: LandingTarget) => void;  // 右侧菜单 enter
  onResume: (s: SessionMeta) => void;    // 最近活跃卡片 enter → 恢复弹窗
  onSearch: () => void;                  // '/' → 进总览并开搜索
}

// 右侧功能菜单：图标 + 中文标签
const MENU: { id: LandingTarget; icon: string; label: string }[] = [
  { id: 'overview', icon: '◈', label: '历史总览' },
  { id: 'migrate', icon: '⇄', label: '迁移管理' },
  { id: 'trash', icon: '✕', label: '删除记录' }
];

const STRIP_W = 13;              // 右侧功能条宽（图标+空格+4 汉字 = 11 列 + 留白）
const RUNNING_MS = 3 * 60_000;   // 与 overview 同标准：3 分钟内有写入视为运行中

// GitHub 深色贡献绿阶：0 / 1-2 / 3-5 / 6-9 / 10+ 次
const HEAT = ['#21262D', '#0E4429', '#006D32', '#26A641', '#39D353'];
const heatLevel = (n: number): number => (n <= 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4);

interface DayCell { count: number } // count<0 = 范围外（周一对齐补的头尾），画空白

/** 近 30 天贡献：按会话 lastTime 的本地日期计数；网格回退对齐到周一，竖向一周一行 */
function buildHeatmap(projects: ProjectInfo[]): { weeks: DayCell[][]; total: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - 29 * 86400000);
  const counts = new Map<string, number>();
  let total = 0;
  for (const p of projects) {
    for (const s of p.sessions) {
      if (!s.lastTime) continue;
      const d = new Date(s.lastTime);
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (day < start || day > today) continue;
      const key = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    }
  }
  const weeks: DayCell[][] = [];
  const gridStart = new Date(start.getTime() - ((start.getDay() + 6) % 7) * 86400000); // 回退到周一
  for (let cur = new Date(gridStart); cur <= today; ) {
    const week: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
      const inRange = cur >= start && cur <= today;
      const key = `${cur.getFullYear()}-${cur.getMonth() + 1}-${cur.getDate()}`;
      week.push({ count: inRange ? counts.get(key) ?? 0 : -1 });
      cur = new Date(cur.getTime() + 86400000);
    }
    weeks.push(week);
  }
  return { weeks, total };
}

export default function LandingView({
  width,
  height,
  projects,
  locked,
  onSelect,
  onResume,
  onSearch
}: LandingProps) {
  const { exit } = useApp();
  const [focus, setFocus] = useState<'list' | 'menu'>('list');
  const [listIdx, setListIdx] = useState(0);
  const [menuIdx, setMenuIdx] = useState(0);

  // ── 汇总：总量统计 + 全项目会话按 lastTime 倒序 + 热力图 ──
  const { totalSessions, totalBytes, recent, weeks, total30 } = useMemo(() => {
    const all = projects.flatMap(p => p.sessions);
    all.sort((a, b) => (b.lastTime ?? '').localeCompare(a.lastTime ?? '')); // ISO 串可按字典序比
    const heat = buildHeatmap(projects);
    return {
      totalSessions: all.length,
      totalBytes: all.reduce((n, s) => n + s.sizeBytes, 0),
      recent: all,
      weeks: heat.weeks,
      total30: heat.total
    };
  }, [projects]);

  // 高度预算：统计 4 行 + 热力图(周数+4) + 分隔行 1 + 底部提示 1 + 间隙 3，余下全给卡片（每张 4 行）
  const heatH = weeks.length + 4;
  const cardBudget = Math.max(1, Math.floor((height - 4 - heatH - 1 - 1 - 3) / 4));
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
    if (input === '/') return onSearch();
    // 同外壳 Esc 的延迟一拍：避免在 input 派发栈内同步卸载
    if (input === 'q') setTimeout(() => exit(), 0);
  });

  // 左栏内容宽 = 总宽 - 功能条 - 竖线 - 左右 padding
  const innerW = Math.max(10, width - STRIP_W - 1 - 2);

  // 统计格子：上行数字、下行标签，格间一竖线（两行高）
  const statCell = (value: string, label: string, color: string, i: number) => (
    <Box key={i} flexDirection="row" flexGrow={1}>
      {i > 0 && <Text color="#30363D">{'│\n│'}</Text>}
      <Box flexGrow={1} flexDirection="column" alignItems="center">
        <Text bold color={color}>
          {value}
        </Text>
        <Text color="#8B949E">{label}</Text>
      </Box>
    </Box>
  );

  return (
    <Box width={width} height={height} flexDirection="row">
      {/* ── 左栏：数据看板 ── */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {/* 统计行：总对话 / 项目 / 占用 */}
        <Box borderStyle="round" borderColor="#3A3D42" flexDirection="row">
          {statCell(String(totalSessions), '总对话', '#79C0FF', 0)}
          {statCell(String(projects.length), '项目', '#3FB950', 1)}
          {statCell(fmtSize(totalBytes), '占用', '#E3B341', 2)}
        </Box>
        {/* 近 30 天贡献热力图 */}
        <Box borderStyle="round" borderColor="#3A3D42" flexDirection="column" paddingX={1} marginTop={1}>
          <Box flexDirection="row">
            <Text color="#8B949E">近 30 天贡献</Text>
            <Box flexGrow={1} />
            <Text color="#E3B341">{`${total30} 次对话`}</Text>
          </Box>
          {/* 星期表头与格子同距（格 2 列 + 1 空格 = 3 列；汉字标签 2 列 + 1 空格） */}
          <Text color="#6E7681">一 二 三 四 五 六 日</Text>
          {weeks.map((week, i) => (
            <Box key={i} flexDirection="row">
              {week.map((d, j) =>
                d.count < 0 ? (
                  <Text key={j}>{'   '}</Text>
                ) : (
                  <Text key={j}>
                    <Text backgroundColor={HEAT[heatLevel(d.count)]}>{'  '}</Text>
                    {' '}
                  </Text>
                )
              )}
            </Box>
          ))}
        </Box>
        {/* 最近活跃：分隔标题行 */}
        <Box flexDirection="row" marginTop={1}>
          <Text color="#8B949E">最近活跃 </Text>
          <Text color="#30363D">{'─'.repeat(Math.max(2, innerW - 8))}</Text>
        </Box>
        {shown.length === 0 && <Text color="#6E7681">（暂无会话记录）</Text>}
        {shown.map((s, i) => {
          const active = focus === 'list' && i === li;
          const empty = s.userCount === 0 && s.assistantCount === 0;
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
                  <Text bold={active} color={empty ? '#8B949E' : '#E6EDF3'} wrap="truncate">
                    {s.title}
                  </Text>
                </Box>
                <Text color="#F85149">{fmtDate(s.lastTime)}</Text>
              </Box>
              <Box flexDirection="row">
                <Text color={empty ? '#6E7681' : running ? '#3FB950' : '#8B949E'}>{empty ? '○ ' : '● '}</Text>
                <Box flexGrow={1}>
                  <Text color="#8B949E" wrap="truncate">
                    {empty ? '无对话内容' : s.preview || s.title}
                  </Text>
                </Box>
              </Box>
            </Box>
          );
        })}
        {/* 底部操作提示（钉在左栏底） */}
        <Box flexGrow={1} />
        <Text color="#6E7681">按 enter 恢复会话 · 按右侧按钮进入功能</Text>
      </Box>
      {/* ── 分隔竖线（左边框线画满整列） ── */}
      <Box width={1} borderStyle="single" borderTop={false} borderBottom={false} borderRight={false} borderColor="#30363D" />
      {/* ── 右侧功能条 ── */}
      <Box width={STRIP_W} flexDirection="column" paddingTop={1}>
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
        <Box flexDirection="column" marginTop={1}>
          <Text color="#6E7681">↑↓ 选择</Text>
          <Text color="#6E7681">enter 进入</Text>
        </Box>
      </Box>
    </Box>
  );
}
