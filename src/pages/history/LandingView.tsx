import { useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { PageProps } from '../../types.js';
import type { ProjectInfo, SessionMeta } from './types.js';
import { fmtDate, fmtSize, strW } from './fmt.js';

/**
 * LandingView — HISTORY 落地页（数据看板 + 功能菜单）
 *
 * 左栏看板：贡献面板（左 = 近一年热力图，星期为行/周为列 + 月份标签 + 空日暗点 + 绿阶图例；
 *           右 = 统计竖排：总对话/项目/占用）→ 最近活跃会话卡片（标题+时间 / ●+首条提问快照）。
 * 右侧功能条：历史总览 / 迁移管理 / 删除记录（图标 + 分隔线）。
 *
 * 键位：←→ 切换区域（列表/菜单）  ↑↓ 移动  enter（列表=恢复会话弹窗，菜单=进入功能）
 *       space 列表=进总览全屏预览该卡片  / 进历史总览并开搜索  q 退出程序
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

const STRIP_W = 13;              // 右侧功能条宽（图标+空格+4 汉字 = 11 列 + 留白）
const RUNNING_MS = 3 * 60_000;   // 与 overview 同标准：3 分钟内有写入视为运行中
const HEAT_WEEKS = 52;           // 热力图窗口：近一年（周为列铺满整行，空日画暗点）

// GitHub 深色贡献绿阶：0 / 1-2 / 3-5 / 6-9 / 10+ 次
const HEAT = ['#21262D', '#0E4429', '#006D32', '#26A641', '#39D353'];
const heatLevel = (n: number): number => (n <= 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4);

// 热力图行标签：星期为行（GitHub 式），周一在上
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

interface DayCell { count: number; month: number } // count<0 = 窗口外（周一对齐补的头尾），画空白

/** 贡献热力图：按会话 lastTime 的本地日期计数；近一年窗口，周一对齐（周为列、星期为行） */
function buildHeatmap(projects: ProjectInfo[]): { weeks: DayCell[][]; total: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - (HEAT_WEEKS * 7 - 1) * 86400000);
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
      week.push({ count: inRange ? counts.get(key) ?? 0 : -1, month: cur.getMonth() + 1 });
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
  onFullscreen,
  onSearch
}: LandingProps) {
  const { exit } = useApp();
  const [focus, setFocus] = useState<'list' | 'menu'>('list');
  const [listIdx, setListIdx] = useState(0);
  const [menuIdx, setMenuIdx] = useState(0);

  // ── 汇总：总量统计 + 全项目会话按 lastTime 倒序 + 热力图 ──
  const { totalSessions, totalBytes, recent, weeks, heatTotal } = useMemo(() => {
    const all = projects.flatMap(p => p.sessions);
    all.sort((a, b) => (b.lastTime ?? '').localeCompare(a.lastTime ?? '')); // ISO 串可按字典序比
    const heat = buildHeatmap(projects);
    return {
      totalSessions: all.length,
      totalBytes: all.reduce((n, s) => n + s.sizeBytes, 0),
      recent: all,
      weeks: heat.weeks,
      heatTotal: heat.total
    };
  }, [projects]);

  // 左栏内容宽 = 总宽 - 功能条 - 竖线 - 左右 padding
  const innerW = Math.max(10, width - STRIP_W - 1 - 2);

  // 格子宽度自适应：可用宽 ÷ 周数，限制在 2~3（年视图 53 列，pitch 3 正好铺满宽面板）
  const pitch = Math.max(2, Math.min(3, Math.floor((innerW - 14 - 3) / Math.max(1, weeks.length))));
  const cellW = pitch - 1;
  // 月份标签行：每周列首日的月份变了就标「N月」；太密时标签会糊，不画
  const showMonthRow = pitch >= 3;
  const monthRow: (string | null)[] = [];
  {
    let prevMonth = -1;
    let lastLabelW = -99;
    weeks.forEach((week, w) => {
      const m = week[0].month;
      if (m !== prevMonth) {
        prevMonth = m;
        if ((w - lastLabelW) * pitch >= 5) {
          monthRow.push(`${m}月`);
          lastLabelW = w;
          return;
        }
      }
      monthRow.push(null);
    });
  }

  // 高度预算：贡献面板（标题 1 + 月份行? + 星期 7 + 图例 1 + 上下边框 2）+ 分隔行 1 + 间隙 1，
  // 余下全给卡片（每张 4 行）
  const panelH = (showMonthRow ? 12 : 11);
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
    // 同外壳 Esc 的延迟一拍：避免在 input 派发栈内同步卸载
    if (input === 'q') setTimeout(() => exit(), 0);
  });

  return (
    <Box width={width} height={height} flexDirection="row">
      {/* ── 左栏：数据看板 ── */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {/* 贡献面板：左热力图 + 右统计竖排 */}
        <Box borderStyle="round" borderColor="#3A3D42" flexDirection="column" paddingX={1}>
          {/* 标题行：左名称右窗口内总数 */}
          <Box flexDirection="row">
            <Text color="#C9D1D9">近一年贡献</Text>
            <Box flexGrow={1} />
            <Text color="#E3B341">{`${heatTotal} 次对话`}</Text>
          </Box>
          <Box flexDirection="row" flexGrow={1}>
            {/* 热力图：星期为行（左侧标签）、周为列（旧左新右）；格 = cellW 列色块 + 1 空格 */}
            <Box flexDirection="column">
              {showMonthRow && (
                <Box flexDirection="row">
                  <Text>{'   '}</Text>
                  {monthRow.map((l, w) => (
                    <Text key={w} color="#6E7681">
                      {l ? l + ' '.repeat(Math.max(0, pitch - strW(l))) : ' '.repeat(pitch)}
                    </Text>
                  ))}
                </Box>
              )}
              {WEEKDAYS.map((wd, d) => (
                <Box key={d} flexDirection="row">
                  {/* 星期标签只留 一/三/五（GitHub 式），其余行留白 3 列 */}
                  <Text color="#6E7681">{d % 2 === 0 && d < 6 ? `${wd} ` : '   '}</Text>
                  {weeks.map((week, w) =>
                    week[d].count < 0 ? (
                      <Text key={w}>{' '.repeat(pitch)}</Text>
                    ) : week[d].count === 0 ? (
                      // 无贡献的日子画暗点占位，网格才完整（参考 ccusage 的虚线网格）
                      <Text key={w} color="#3A3D42">{'·' + ' '.repeat(pitch - 1)}</Text>
                    ) : (
                      <Text key={w}>
                        <Text backgroundColor={HEAT[heatLevel(week[d].count)]}>{' '.repeat(cellW)}</Text>
                        {' '}
                      </Text>
                    )
                  )}
                </Box>
              ))}
              {/* 绿阶图例：少 → 多（缩进 3 列与格子对齐） */}
              <Box flexDirection="row">
                <Text color="#6E7681">{'   少 '}</Text>
                {HEAT.map((c, i) => (
                  <Text key={i}>
                    <Text backgroundColor={c}>{'  '}</Text>
                    {' '}
                  </Text>
                ))}
                <Text color="#6E7681">多</Text>
              </Box>
            </Box>
            <Box flexGrow={1} />
            {/* 统计竖排：总对话 / 项目 / 占用（竖线分隔，垂直居中） */}
            <Box width={1} borderStyle="single" borderTop={false} borderBottom={false} borderRight={false} borderColor="#30363D" />
            <Box flexDirection="column" justifyContent="center" paddingX={2}>
              {(
                [
                  [String(totalSessions), '总对话', '#79C0FF'],
                  [String(projects.length), '项目', '#3FB950'],
                  [fmtSize(totalBytes), '占用', '#E3B341']
                ] as [string, string, string][]
              ).map(([v, l, c], i) => (
                <Box key={i} flexDirection="column" alignItems="center" marginTop={i ? 1 : 0}>
                  <Text bold color={c}>
                    {v}
                  </Text>
                  <Text color="#8B949E">{l}</Text>
                </Box>
              ))}
            </Box>
          </Box>
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
      </Box>
    </Box>
  );
}
