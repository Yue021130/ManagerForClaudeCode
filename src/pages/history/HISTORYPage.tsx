import { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import path from 'node:path';
import type { PageMeta, PageProps } from '../../types.js';
import { useShell } from '../../shell/context.js';
import ScrollableList from '../../components/ScrollableList.js';
import DetailPanel from '../../components/DetailPanel.js';
import VerticalDivider from '../../components/VerticalDivider.js';
import {
  scanAllProjects,
  readConversation,
  moveSession,
  exportMarkdown
} from './scan.js';
import type { ChatEntry, ProjectInfo, SessionMeta } from './types.js';

/**
 * HISTORY 页 — Claude Code 历史对话管理
 *
 * 三栏：项目列表 | 会话列表 | 对话预览
 * 数据：~/.claude/projects/<dir>/<sessionId>.jsonl（见 scan.ts）
 *
 * 键位：↑↓ 移动（随焦点）  ←→/tab 切焦点  enter 预览（项目行=下钻会话）
 *       / 搜索（Enter 或删空退出）  d 删除  x 归档  e 导出MD  r 重新扫描
 * 删除/归档 = 移到 ~/.claude/backups/，可恢复。
 */
export const meta: PageMeta = {
  num: 1,
  label: 'HISTORY',
  color: '#79C0FF',
  hints: [
    ['↑↓', '选择'],
    ['←→', '切换'],
    ['enter', '展开'],
    ['/', '搜索'],
    ['d', '删除'],
    ['x', '归档'],
    ['e', '导出']
  ]
};

// ── 展示格式化 ──
const fmtDate = (iso: string | null): string =>
  iso ? `${iso.slice(5, 10)} ${iso.slice(11, 16)}` : '--     --:--';

const fmtSize = (b: number): string =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)}M` : b >= 1024 ? `${Math.round(b / 1024)}K` : `${b}B`;

const projName = (p: ProjectInfo): string => (p.cwd ? path.basename(p.cwd) : p.dirName);

type Focus = 'project' | 'session' | 'preview';

const FOCUS_ORDER: Focus[] = ['project', 'session', 'preview'];

export default function HISTORYPage({ width, height }: PageProps) {
  const { setMessage, setError, setKeysEnabled } = useShell();

  // ── 数据 ──
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null); // null = 扫描中
  const [projIdx, setProjIdx] = useState(0);
  const [sessIdx, setSessIdx] = useState(0);
  const [focus, setFocus] = useState<Focus>('project');
  const [preview, setPreview] = useState<{ session: SessionMeta; entries: ChatEntry[] } | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);

  // ── 搜索 ──
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  // 首次扫描：让出首帧再扫（scan 同步阻塞 <100ms）
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setProjects(scanAllProjects());
      } catch (e) {
        setProjects([]);
        setError(`扫描失败: ${String(e)}`);
      }
    }, 10);
    return () => clearTimeout(t);
  }, [setError]);

  // 页面卸载时恢复外壳全局键（防止在搜索中途切走页面后数字键一直失灵）
  useEffect(() => () => setKeysEnabled(true), [setKeysEnabled]);

  // ── 派生数据 ──
  const pIdx = projects ? Math.min(projIdx, projects.length - 1) : 0;
  const project = projects?.[pIdx] ?? null;

  const sessions = useMemo<SessionMeta[]>(() => {
    if (!projects) return [];
    const q = query.trim().toLowerCase();
    if (!q) return project?.sessions ?? [];
    // 搜索模式：跨项目扁平过滤，行首标注项目名
    return projects.flatMap(p => p.sessions).filter(s => s.title.toLowerCase().includes(q));
  }, [projects, project, query]);

  const sIdx = Math.min(sessIdx, Math.max(0, sessions.length - 1));
  const currentSession = sessions[sIdx] ?? null;

  const entries = preview?.entries ?? [];

  // ── 布局宽度 ──
  const projW = Math.min(28, Math.max(16, Math.floor(width * 0.18)));
  const sessW = Math.min(46, Math.max(26, Math.floor(width * 0.30)));
  const previewW = Math.max(20, width - projW - sessW - 2); // -2 = 两条竖线

  // ── 预览：块为单位（Q 一块 A 一块；工具行不展示；长块截断 +...） ──
  const blocks = useMemo(
    () => buildBlocks(entries, Math.max(10, previewW - 4)),
    [entries, previewW]
  );
  const vIdx = Math.min(previewIdx, Math.max(0, blocks.length - 1));

  // ── 详情视图（enter 展开整块，esc 返回） ──
  const [detail, setDetail] = useState<Block | null>(null);
  const [detailIdx, setDetailIdx] = useState(0);
  const detailLines = useMemo(
    () => (detail ? wrapEntryText(detail.entry, Math.max(10, width - 4)) : []),
    [detail, width]
  );
  const dIdx = Math.min(detailIdx, Math.max(0, detailLines.length - 1));

  // ── 操作 ──
  const rescan = () => {
    try {
      setProjects(scanAllProjects());
    } catch (e) {
      setError(`扫描失败: ${String(e)}`);
    }
  };

  const openPreview = (s: SessionMeta) => {
    try {
      const list = readConversation(s.filePath);
      setPreview({ session: s, entries: list });
      // 定位到最后一块（按块计）
      const newBlocks = buildBlocks(list, Math.max(10, previewW - 4));
      setPreviewIdx(Math.max(0, newBlocks.length - 1));
      setFocus('preview');
    } catch (e) {
      setError(`读取失败: ${String(e)}`);
    }
  };

  const openDetail = (b: Block) => {
    setDetail(b);
    setDetailIdx(0);
    setKeysEnabled(false); // 详情模式接管 Esc（App 不退出）
  };

  const closeDetail = () => {
    setDetail(null);
    setKeysEnabled(true);
  };

  const removeOrArchive = (kind: 'trash' | 'archive') => {
    if (!currentSession) return;
    try {
      moveSession(currentSession.filePath, kind);
      setMessage(
        kind === 'trash'
          ? `已删除「${currentSession.title.slice(0, 16)}」（~/.claude/backups/mfcc-trash 可找回）`
          : `已归档「${currentSession.title.slice(0, 16)}」`
      );
      if (preview?.session.filePath === currentSession.filePath) {
        setPreview(null);
        setDetail(null);
      }
      rescan();
    } catch (e) {
      setError(`操作失败: ${String(e)}`);
    }
  };

  const doExport = () => {
    if (!currentSession) return;
    try {
      const list =
        preview?.session.filePath === currentSession.filePath
          ? preview.entries
          : readConversation(currentSession.filePath);
      const fileName = exportMarkdown(currentSession, list);
      setMessage(`已导出 exports/${fileName}`);
    } catch (e) {
      setError(`导出失败: ${String(e)}`);
    }
  };

  // ── 键盘 ──
  const move = (dir: -1 | 1) => {
    if (focus === 'project' && projects?.length) {
      const next = Math.min(Math.max(0, pIdx + dir), projects.length - 1);
      setProjIdx(next);
      setSessIdx(0); // 换项目总会话归零
    } else if (focus === 'session' && sessions.length) {
      setSessIdx(Math.min(Math.max(0, sIdx + dir), sessions.length - 1));
    } else if (focus === 'preview' && blocks.length) {
      setPreviewIdx(Math.min(Math.max(0, vIdx + dir), blocks.length - 1));
    }
  };

  const cycleFocus = (dir: -1 | 1) => {
    const i = FOCUS_ORDER.indexOf(focus);
    setFocus(FOCUS_ORDER[(i + dir + FOCUS_ORDER.length) % FOCUS_ORDER.length]);
  };

  useInput((input, key) => {
    if (!projects) return;

    // 详情视图：↑↓ 滚动，Esc 返回，吃掉其余键
    if (detail) {
      if (key.escape) return closeDetail();
      if (key.upArrow) return setDetailIdx(Math.max(0, dIdx - 1));
      if (key.downArrow) return setDetailIdx(Math.min(detailLines.length - 1, dIdx + 1));
      return;
    }

    // 搜索模式：行内编辑；Enter / Esc / 删空退出
    if (searching) {
      if (key.escape || key.return || (key.backspace && !query)) {
        setSearching(false);
        setKeysEnabled(true);
        if (key.backspace) setQuery('');
        setSessIdx(0);
        return;
      }
      if (key.backspace) return setQuery(q => q.slice(0, -1));
      if (!key.ctrl && !key.meta && input) return setQuery(q => q + input);
      return;
    }

    if (key.upArrow) return move(-1);
    if (key.downArrow) return move(1);
    if (key.leftArrow || (key.shift && key.tab)) return cycleFocus(-1);
    if (key.rightArrow || key.tab) return cycleFocus(1);

    if (key.return) {
      if (focus === 'project') return setFocus('session');
      if (focus === 'session' && currentSession) return openPreview(currentSession);
      if (focus === 'preview' && blocks[vIdx]) return openDetail(blocks[vIdx]);
      return;
    }

    if (input === '/') {
      setSearching(true);
      setKeysEnabled(false); // 关掉外壳数字切页，让按键都到搜索框
      setQuery('');
      setSessIdx(0);
      return;
    }
    if (input === 'd') return removeOrArchive('trash');
    if (input === 'x') return removeOrArchive('archive');
    if (input === 'e') return doExport();
    if (input === 'r') return rescan();
  });

  // ── 渲染 ──
  if (!projects) {
    return (
      <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
        <Text color="#8B949E">正在扫描 ~/.claude/projects …</Text>
      </Box>
    );
  }

  if (!projects.length) {
    return (
      <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
        <Text color="#57606A">没有找到 Claude 对话历史（~/.claude/projects 为空）</Text>
      </Box>
    );
  }

  // ── 详情视图：整页替换三栏 ──
  if (detail) {
    const isUser = detail.role === 'user';
    return (
      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        <Box height={1} flexDirection="row" paddingX={1}>
          <Text bold color={isUser ? '#79C0FF' : '#3FB950'}>{`${detail.label} · 完整内容`}</Text>
          <Box flexGrow={1} />
          <Text color="#57606A">↑↓ 滚动  esc 返回</Text>
        </Box>
        <ScrollableList<string>
          items={detailLines}
          selectedIndex={dIdx}
          terminalHeight={height}
          width={width}
          headerOffset={3}
          minVisible={8}
          renderItem={(line, _i, active) => (
            <Text color={active ? '#0D1117' : isUser ? '#E6EDF3' : '#C9D1D9'}>
              {line === '' ? ' ' : line}
            </Text>
          )}
        />
      </Box>
    );
  }

  const inSearch = query.trim().length > 0;

  return (
    <Box flexGrow={1} flexDirection="row" overflow="hidden">
      {/* ── 左：项目列表 ── */}
      <Box width={projW} flexDirection="column">
        <ScrollableList<ProjectInfo>
          title="PROJECTS"
          items={projects}
          selectedIndex={focus === 'project' ? pIdx : -1}
          terminalHeight={height}
          width={projW}
          headerOffset={5}
          renderItem={(p, _i, active) => (
            <>
              <Text bold={active} color={active ? '#0D1117' : '#E6EDF3'} wrap="truncate">
                {projName(p)}
              </Text>
              <Text color={active ? '#0D1117' : '#57606A'}>{` ${p.sessions.length}`}</Text>
            </>
          )}
        />
      </Box>

      <VerticalDivider />

      {/* ── 中：会话列表（+ 搜索框） ── */}
      <Box width={sessW} flexDirection="column">
        {searching && (
          <Box paddingX={1}>
            <Text color="#E3B341">/{query}</Text>
            <Text color="#E3B341">▌</Text>
          </Box>
        )}
        <ScrollableList<SessionMeta>
          title={inSearch ? `搜索 “${query.trim()}”` : 'SESSIONS'}
          items={sessions}
          selectedIndex={focus === 'session' ? sIdx : -1}
          terminalHeight={height - (searching ? 1 : 0)}
          width={sessW}
          headerOffset={5}
          renderItem={(s, _i, active) => (
            <>
              {inSearch && (
                <Text color={active ? '#0D1117' : '#57606A'} wrap="truncate">
                  {`${s.cwd ? path.basename(s.cwd) : '?'} · `}
                </Text>
              )}
              <Text color={active ? '#0D1117' : '#8B949E'}>{`${fmtDate(s.lastTime)} `}</Text>
              <Text bold={active} color={active ? '#0D1117' : '#E6EDF3'} wrap="truncate">
                {s.title}
              </Text>
            </>
          )}
        />
        {!sessions.length && (
          <Box paddingX={1}>
            <Text color="#57606A">{inSearch ? '没有匹配的会话' : '无会话'}</Text>
          </Box>
        )}
      </Box>

      <VerticalDivider />

      {/* ── 右：对话预览 ── */}
      <DetailPanel
        flexGrow
        isFocused={focus === 'preview'}
        title={preview ? `预览 — ${preview.session.title}` : '预览'}
        emptyMessage="enter 预览会话"
      >
        {preview && (
          <Box marginBottom={1}>
            <Text color="#57606A">
              {`${preview.session.userCount}问 ${preview.session.assistantCount}答 · ${fmtSize(
                preview.session.sizeBytes
              )} · ${fmtDate(preview.session.firstTime)} ~ ${fmtDate(preview.session.lastTime)}`}
            </Text>
          </Box>
        )}
        {preview && blocks.length > 0 && (
          <BlockWindow
            blocks={blocks}
            selected={focus === 'preview' ? vIdx : -1}
            avail={Math.max(4, height - 6)}
            width={previewW}
          />
        )}
        {preview && blocks.length === 0 && (
          <Text color="#57606A">此会话没有可展示的对话（可能是纯命令会话）</Text>
        )}
      </DetailPanel>
    </Box>
  );
}

// ── 预览块 ──

/**
 * Block — 预览区的一项 = 一条对话（Q 或 A），整块选中/高亮
 *
 * 工具调用（role==='tool'）在预览层直接丢弃（导出 MD 仍走原始 entries）。
 * 长块正文按面板宽预折行后截断到 MAX_BLOCK_LINES 行，末行拼 ' ...'，
 * enter 进详情视图看完整内容。
 */
type Block = {
  role: 'user' | 'assistant';
  label: string;      // 标签行：🧑 你 / 🤖 AI · 时间
  lines: string[];    // 预折行后的正文（已截断）
  truncated: boolean;
  height: number;     // 1 标签行 + lines.length + 1 块间空行
  entry: ChatEntry;
};

const MAX_BLOCK_LINES = 6;

// 存储文本里可能带 ANSI 转义（终端拷贝来的），渲染前剥掉
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const stripAnsi = (s: string): string => s.replace(ANSI_RE, '');

const charWidth = (code: number): number => (code > 0xFF ? 2 : 1);

/** 按显示宽度硬折行（不拆词，终端就是这么换行的） */
function wrapText(text: string, maxWidth: number): string[] {
  const out: string[] = [];
  let cur = '';
  let w = 0;
  for (const ch of text) {
    const cw = charWidth(ch.codePointAt(0) ?? 0);
    if (w + cw > maxWidth) {
      out.push(cur);
      cur = '';
      w = 0;
    }
    cur += ch;
    w += cw;
  }
  out.push(cur);
  return out;
}

/** 一条 entry 的正文 → 折行数组（详情视图用，不截断） */
function wrapEntryText(entry: ChatEntry, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of stripAnsi(entry.text).split('\n')) {
    out.push(...wrapText(para, maxWidth));
  }
  return out;
}

/** 对话流 → 块列表（丢弃工具行） */
function buildBlocks(entries: ChatEntry[], maxWidth: number): Block[] {
  const blocks: Block[] = [];
  for (const e of entries) {
    if (e.role === 'tool') continue;
    const isUser = e.role === 'user';
    const wrapped = wrapEntryText(e, maxWidth);
    const truncated = wrapped.length > MAX_BLOCK_LINES;
    const lines = truncated ? wrapped.slice(0, MAX_BLOCK_LINES) : wrapped;
    if (truncated) lines[lines.length - 1] = `${lines[lines.length - 1]} ...`;
    blocks.push({
      role: e.role,
      label: `${isUser ? '🧑 你' : '🤖 AI'}${e.timestamp ? ` · ${fmtDate(e.timestamp)}` : ''}`,
      lines,
      truncated,
      height: lines.length + 2,
      entry: e
    });
  }
  return blocks;
}

/**
 * BlockWindow — 按块高（不定高）计算可见窗口的预览列表
 *
 * ScrollableList 假设「一项一行」，块是不定高的（1～8 行），窗口按累计块高算：
 * 从选中块向上累加直到放不下，再向下补齐；两端画 ↑ N / ↓ N 溢出指示。
 */
function BlockWindow({
  blocks,
  selected,
  avail,
  width
}: {
  blocks: Block[];
  selected: number; // -1 = 无选中（焦点不在预览）
  avail: number;
  width: number;
}) {
  const sel = Math.max(0, Math.min(selected, blocks.length - 1));
  let start = sel;
  let used = blocks[sel]?.height ?? 0;
  while (start > 0 && used + blocks[start - 1].height <= avail) {
    start--;
    used += blocks[start].height;
  }
  let end = sel;
  while (end < blocks.length - 1 && used + blocks[end + 1].height <= avail) {
    end++;
    used += blocks[end].height;
  }

  const rowW = Math.max(1, width - 2); // paddingX 1*2

  return (
    <Box flexDirection="column" paddingX={1}>
      {start > 0 && <Text color="#57606A">{`↑ ${start}`}</Text>}
      {blocks.slice(start, end + 1).map((b, i) => {
        const realIdx = start + i;
        const active = realIdx === selected;
        const isUser = b.role === 'user';
        return (
          <Box key={realIdx} flexDirection="row" width={rowW}>
            <Text bold color={active ? '#79C0FF' : '#30363D'}>
              {active ? '❯ ' : '  '}
            </Text>
            <Box flexGrow={1} backgroundColor={active ? '#1F2937' : undefined}>
              <Text>
                <Text bold color={isUser ? '#79C0FF' : '#3FB950'}>{b.label}</Text>
                {'\n'}
                <Text color={isUser ? '#E6EDF3' : '#C9D1D9'}>{b.lines.join('\n')}</Text>
                {'\n'}
              </Text>
            </Box>
          </Box>
        );
      })}
      {end < blocks.length - 1 && <Text color="#57606A">{`↓ ${blocks.length - 1 - end}`}</Text>}
    </Box>
  );
}
