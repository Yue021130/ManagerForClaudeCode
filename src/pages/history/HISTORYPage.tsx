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
    ['enter', '预览'],
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

  // ── 预览：按行扁平化（ScrollableList 假设一项一行，超长对话必须预拆行） ──
  const lines = useMemo(
    () => buildPreviewLines(entries, Math.max(10, previewW - 4)),
    [entries, previewW]
  );
  const vIdx = Math.min(previewIdx, Math.max(0, lines.length - 1));

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
      // 定位到会话末尾（按扁平行计）
      const newLines = buildPreviewLines(list, Math.max(10, previewW - 4));
      setPreviewIdx(Math.max(0, newLines.length - 1));
      setFocus('preview');
    } catch (e) {
      setError(`读取失败: ${String(e)}`);
    }
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
      if (preview?.session.filePath === currentSession.filePath) setPreview(null);
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
    } else if (focus === 'preview' && lines.length) {
      setPreviewIdx(Math.min(Math.max(0, vIdx + dir), lines.length - 1));
    }
  };

  const cycleFocus = (dir: -1 | 1) => {
    const i = FOCUS_ORDER.indexOf(focus);
    setFocus(FOCUS_ORDER[(i + dir + FOCUS_ORDER.length) % FOCUS_ORDER.length]);
  };

  useInput((input, key) => {
    if (!projects) return;

    // 搜索模式：行内编辑；Enter 或删空退出（Esc 是全局退出，到不了这里）
    if (searching) {
      if (key.return || (key.backspace && !query)) {
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
        {preview && (
          <ScrollableList<PreviewLine>
            items={lines}
            selectedIndex={focus === 'preview' ? vIdx : -1}
            terminalHeight={height}
            width={previewW}
            headerOffset={7}
            minVisible={6}
            renderItem={(l, _i, active) => (
              <Text
                bold={l.label}
                color={
                  active
                    ? '#0D1117'
                    : l.role === 'tool'
                      ? '#57606A'
                      : l.label
                        ? l.role === 'user'
                          ? '#79C0FF'
                          : '#3FB950'
                        : l.role === 'user'
                          ? '#E6EDF3'
                          : '#C9D1D9'
                }
              >
                {l.text === '' ? ' ' : l.text}
              </Text>
            )}
          />
        )}
        {preview && entries.length === 0 && (
          <Text color="#57606A">此会话没有可展示的对话（可能是纯命令会话）</Text>
        )}
      </DetailPanel>
    </Box>
  );
}

// ── 预览扁平行 ──

/**
 * PreviewLine — 预览区的一项 = 终端上的一行
 *
 * ScrollableList 的虚拟滚动按「一项一行」算窗口；对话条目一条可能几百行，
 * 必须在数据层预先拆行+按面板宽度包好（CJK 宽字符按 2 列计），否则长内容
 * 直接溢出面板、画到屏幕各处。
 */
type PreviewLine = {
  role: 'user' | 'assistant' | 'tool';
  label: boolean; // true = 角色标签行（🧑/🤖）
  text: string;
};

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

/** 对话流 → 扁平行（标签行 + 正文各行 + 空行分隔） */
function buildPreviewLines(entries: ChatEntry[], maxWidth: number): PreviewLine[] {
  const lines: PreviewLine[] = [];
  for (const e of entries) {
    if (e.role === 'tool') {
      lines.push({ role: 'tool', label: false, text: `  ⚒ ${e.toolName}` });
      continue;
    }
    const isUser = e.role === 'user';
    lines.push({
      role: e.role,
      label: true,
      text: `${isUser ? '🧑 你' : '🤖 AI'}${e.timestamp ? ` · ${fmtDate(e.timestamp)}` : ''}`
    });
    for (const para of stripAnsi(e.text).split('\n')) {
      for (const l of wrapText(para, maxWidth)) {
        lines.push({ role: e.role, label: false, text: l });
      }
    }
    lines.push({ role: e.role, label: false, text: '' });
  }
  return lines;
}
