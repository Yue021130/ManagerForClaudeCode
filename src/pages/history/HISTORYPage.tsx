import { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import os from 'node:os';
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
 * 键位：↑↓ 移动（随焦点）  ←→/tab 切焦点  enter 下钻/进详情  space 粘贴段展开/收起
 *       / 搜索（Enter 或删空退出）  d 删除（弹窗输入 YUE 确认）  x 归档  e 导出MD  r 重新扫描
 * 会话选中即自动预览（120ms 防抖），enter 在会话行只是把焦点送进预览。
 * 删除/归档 = 移到 ~/.claude/backups/，可恢复。
 * <pasted_content> 段默认折叠成一行颜色块（前 20 字符 + …），space 展开。
 */
export const meta: PageMeta = {
  num: 1,
  label: 'HISTORY',
  color: '#79C0FF',
  hints: [
    ['↑↓', '选择'],
    ['←→', '切换'],
    ['enter', '展开'],
    ['space', '粘贴'],
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

// 展示路径：home 前缀缩成 ~，省横向空间
const shortPath = (p: string): string => {
  const home = os.homedir();
  return p.toLowerCase().startsWith(home.toLowerCase()) ? '~' + p.slice(home.length) : p;
};

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

  // ── 删除二次确认（弹窗，必须输入 YUE）──
  const [confirming, setConfirming] = useState<SessionMeta | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [confirmError, setConfirmError] = useState(false); // 输入不匹配，内联红字提示

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

  // ── 粘贴段展开状态：默认全部折叠成 chip，space 切换（切换会话时重置） ──
  const [expandedPastes, setExpandedPastes] = useState<ReadonlySet<string>>(new Set());

  // ── 预览：块为单位（Q 一块 A 一块；工具行不展示；长块截断 +...） ──
  const blocks = useMemo(
    () => buildBlocks(entries, Math.max(10, previewW - 4), expandedPastes),
    [entries, previewW, expandedPastes]
  );
  const vIdx = Math.min(previewIdx, Math.max(0, blocks.length - 1));

  // ── 详情视图（enter 展开整块，esc 返回） ──
  const [detail, setDetail] = useState<Block | null>(null);
  const [detailIdx, setDetailIdx] = useState(0);
  const detailLines = useMemo(
    () => (detail ? buildEntryLines(detail.entry, Math.max(10, width - 4), expandedPastes).lines : []),
    [detail, width, expandedPastes]
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

  // 读取会话进预览（不切焦点）；换会话时粘贴段回到全折叠、定位到最后一块
  const loadPreview = (s: SessionMeta) => {
    try {
      const list = readConversation(s.filePath);
      setPreview({ session: s, entries: list });
      setExpandedPastes(new Set());
      const newBlocks = buildBlocks(list, Math.max(10, previewW - 4), new Set());
      setPreviewIdx(Math.max(0, newBlocks.length - 1));
    } catch (e) {
      setError(`读取失败: ${String(e)}`);
    }
  };

  // enter 跳进预览焦点；自动预览已载过就不重复读文件
  const openPreview = (s: SessionMeta) => {
    if (preview?.session.filePath !== s.filePath) loadPreview(s);
    setFocus('preview');
  };

  // 选中即预览：当前会话变化后稍等一拍再载入（快速翻页只载最后停下的那条）
  const currentPath = currentSession?.filePath ?? null;
  useEffect(() => {
    if (!currentPath) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      if (currentSession) loadPreview(currentSession);
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只跟随 filePath；同一文件不重复载入
  }, [currentPath]);

  const openDetail = (b: Block) => {
    setDetail(b);
    setDetailIdx(0);
    setKeysEnabled(false); // 详情模式接管 Esc（App 不退出）
  };

  const closeDetail = () => {
    setDetail(null);
    setKeysEnabled(true);
  };

  // 切换一组粘贴段的展开状态（块内多个时同开同关）
  const togglePaste = (ids: string[]) => {
    if (!ids.length) return;
    setExpandedPastes(prev => {
      const next = new Set(prev);
      const allOpen = ids.every(id => next.has(id));
      for (const id of ids) {
        if (allOpen) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const removeOrArchive = (kind: 'trash' | 'archive', target: SessionMeta | null = currentSession) => {
    if (!target) return;
    try {
      moveSession(target.filePath, kind);
      setMessage(
        kind === 'trash'
          ? `已删除「${target.title.slice(0, 16)}」（~/.claude/backups/mfcc-trash 可找回）`
          : `已归档「${target.title.slice(0, 16)}」`
      );
      if (preview?.session.filePath === target.filePath) {
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

    // 删除确认弹窗：输入 YUE + enter 才执行；esc 取消；其余键吃掉
    if (confirming) {
      if (key.escape) {
        setConfirming(null);
        setConfirmInput('');
        setConfirmError(false);
        setKeysEnabled(true);
        return;
      }
      if (key.return) {
        if (confirmInput === 'YUE') {
          const target = confirming;
          setConfirming(null);
          setConfirmInput('');
          setConfirmError(false);
          setKeysEnabled(true);
          removeOrArchive('trash', target);
        } else {
          setConfirmInput('');
          setConfirmError(true);
        }
        return;
      }
      if (key.backspace) {
        setConfirmError(false);
        return setConfirmInput(s => s.slice(0, -1));
      }
      if (!key.ctrl && !key.meta && input) {
        setConfirmError(false);
        return setConfirmInput(s => (s + input).slice(0, 3)); // 就 3 个槽位
      }
      return;
    }

    // 详情视图：↑↓ 滚动，space 展开/收起粘贴段，Esc 返回，吃掉其余键
    if (detail) {
      if (key.escape) return closeDetail();
      if (input === ' ') return togglePaste(detail.pasteIds);
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

    // space：预览焦点下展开/收起选中块里的粘贴段
    if (input === ' ') {
      if (focus === 'preview' && blocks[vIdx]) togglePaste(blocks[vIdx].pasteIds);
      return;
    }

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
    if (input === 'd') {
      if (!currentSession) return;
      setConfirming(currentSession);
      setConfirmInput('');
      setKeysEnabled(false); // 弹窗接管键盘：数字键不切页、Esc 不退出
      return;
    }
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
          <Text color="#57606A">↑↓ 滚动  space 粘贴  esc 返回</Text>
        </Box>
        <ScrollableList<BlockLine>
          items={detailLines}
          selectedIndex={dIdx}
          terminalHeight={height}
          width={width}
          headerOffset={3}
          minVisible={8}
          renderItem={(ln, _i, active) =>
            ln.kind === 'chip' ? (
              <Text backgroundColor="#21262D" color="#E3B341">{` 📋 ${ln.preview}… `}</Text>
            ) : (
              <Text color={active ? '#0D1117' : isUser ? '#E6EDF3' : '#C9D1D9'}>
                {ln.text === '' ? ' ' : ln.text}
              </Text>
            )
          }
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
          // 当前项目常显标记：焦点在 = 蓝底高亮；焦点不在 = 深底蓝标（同会话列联动）
          selectedIndex={pIdx}
          activeColor={focus === 'project' ? '#79C0FF' : '#21262D'}
          activeTextColor={focus === 'project' ? '#0D1117' : '#79C0FF'}
          terminalHeight={height}
          width={projW}
          headerOffset={5}
          renderItem={(p, _i, active) => {
            const hot = active && focus === 'project';
            return (
              <>
                <Text bold={active} color={hot ? '#0D1117' : '#E6EDF3'} wrap="truncate">
                  {projName(p)}
                </Text>
                <Text color={hot ? '#0D1117' : '#57606A'}>{` ${p.sessions.length}`}</Text>
              </>
            );
          }}
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
          // 自动预览后当前会话永远带标记：焦点在 = 蓝底高亮；焦点不在 = 深底蓝标（正在预览）
          selectedIndex={sIdx}
          activeColor={focus === 'session' ? '#79C0FF' : '#21262D'}
          activeTextColor={focus === 'session' ? '#0D1117' : '#79C0FF'}
          terminalHeight={height - (searching ? 1 : 0)}
          width={sessW}
          headerOffset={5}
          renderItem={(s, _i, active) => {
            const hot = active && focus === 'session'; // 蓝底时用深字；深底联动标记保持亮字
            return (
              <>
                {inSearch && (
                  <Text color={hot ? '#0D1117' : '#57606A'} wrap="truncate">
                    {`${s.cwd ? path.basename(s.cwd) : '?'} · `}
                  </Text>
                )}
                <Text color={hot ? '#0D1117' : '#8B949E'}>{`${fmtDate(s.lastTime)} `}</Text>
                <Text bold={active} color={hot ? '#0D1117' : '#E6EDF3'} wrap="truncate">
                  {s.title}
                </Text>
              </>
            );
          }}
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
        title="预览"
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
        {preview?.session.cwd && (
          <Box marginBottom={1}>
            <Text color="#57606A" wrap="truncate">
              {`📁 ${shortPath(preview.session.cwd)}`}
            </Text>
          </Box>
        )}
        {preview && blocks.length > 0 && (
          <BlockWindow
            blocks={blocks}
            selected={focus === 'preview' ? vIdx : -1}
            avail={Math.max(4, height - 6 - (preview.session.cwd ? 1 : 0))}
            width={previewW}
          />
        )}
        {preview && blocks.length === 0 && (
          <Text color="#57606A">此会话没有可展示的对话（可能是纯命令会话）</Text>
        )}
      </DetailPanel>

      {/* ── 删除确认弹窗：通栏横带浮在列表之上 ──
          不用居中小框：小框左右边缘会把底层文字拦腰切断，视觉上边框像波浪线。
          横带横贯全宽、只留上下两条横边（必直），背景列表在带的上方/下方仍可见。 */}
      {confirming && (
        <Box
          position="absolute"
          marginTop={Math.max(0, Math.floor((height - 12) / 2))}
          width={width}
          flexDirection="column"
          borderStyle="single"
          borderLeft={false}
          borderRight={false}
          borderColor="#FF7B72"
          backgroundColor="#0D1117"
          paddingY={1}
        >
          <Box justifyContent="center" marginBottom={1}>
            <Text bold color="#FF7B72">确认删除该会话</Text>
          </Box>
          <Box justifyContent="center">
            <Text color="#E6EDF3" wrap="truncate">
              {confirming.title.length > 24 ? `${confirming.title.slice(0, 24)}...` : confirming.title}
            </Text>
          </Box>
          <Box justifyContent="center" marginBottom={1}>
            <Text color="#57606A">移到 ~/.claude/backups/mfcc-trash，可恢复</Text>
          </Box>
          <Box justifyContent="center" marginBottom={1}>
            <Text color="#8B949E">输入 </Text>
            <Text bold color="#E3B341">YUE</Text>
            <Text color="#8B949E">  </Text>
            {[0, 1, 2].map(i => {
              const ch = confirmInput[i];
              const isCursor = i === confirmInput.length;
              return (
                <Text key={i}>
                  {i > 0 && ' '}
                  <Text
                    backgroundColor="#21262D"
                    bold={!!ch}
                    color={ch || isCursor ? '#E3B341' : '#57606A'}
                  >
                    {` ${ch ?? (isCursor ? '_' : '·')} `}
                  </Text>
                </Text>
              );
            })}
          </Box>
          <Box justifyContent="center">
            {confirmError ? (
              <Text color="#FF7B72">输入不匹配，重试或 esc 取消</Text>
            ) : (
              <Text color="#57606A">enter 确认 · esc 取消</Text>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ── 预览块 ──

/** 展示行：普通文本行，或折叠的粘贴段（chip 颜色块，📋 + 前 20 字符 + …） */
type BlockLine =
  | { kind: 'text'; text: string }
  | { kind: 'chip'; id: string; preview: string };

/**
 * Block — 预览区的一项 = 一条对话（Q 或 A），整块选中/高亮
 *
 * 工具调用（role==='tool'）在预览层直接丢弃（导出 MD 仍走原始 entries）。
 * <pasted_content> 段默认折叠成一行 chip，space 展开/收起（pasteIds 切换）。
 * 正文按面板宽预折行，默认只露前 MAX_BLOCK_LINES 行（末行拼 ' ...'）；
 * 视口有剩余空间时 BlockWindow 会弹性展开被截断的块（选中块优先）。
 * enter 进详情视图看完整内容。
 */
type Block = {
  role: 'user' | 'assistant';
  label: string;       // 标签行：🧑 你 / 🤖 AI · 时间
  lines: BlockLine[];  // 展示行（已按粘贴展开状态生成）
  pasteIds: string[];  // 块内粘贴段 id（没有则 space 无效）
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

/** 消息文本里的 <pasted_content id="X">…</pasted_content id="X"> 段 */
type Segment = { kind: 'text'; text: string } | { kind: 'paste'; id: string; text: string };

const PASTE_RE = /<pasted_content id="([^"]+)">([\s\S]*?)<\/pasted_content id="\1">/g;

function parseSegments(text: string): Segment[] {
  const segs: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(PASTE_RE)) {
    if (m.index > last) segs.push({ kind: 'text', text: text.slice(last, m.index) });
    segs.push({ kind: 'paste', id: m[1], text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ kind: 'text', text: text.slice(last) });
  return segs;
}

/**
 * 一条 entry → 展示行：普通段折行；粘贴段折叠为 chip（或展开时折行）。
 * 首尾空行剥掉（粘贴内容常带前导/尾随换行，渲染出来是大片空白）。
 */
function buildEntryLines(
  entry: ChatEntry,
  maxWidth: number,
  expandedPastes: ReadonlySet<string>
): { lines: BlockLine[]; pasteIds: string[] } {
  const lines: BlockLine[] = [];
  const pasteIds: string[] = [];
  const wrapSeg = (text: string) => {
    for (const para of text.split('\n')) {
      for (const t of wrapText(para, maxWidth)) lines.push({ kind: 'text', text: t });
    }
  };
  for (const seg of parseSegments(stripAnsi(entry.text))) {
    if (seg.kind === 'text') {
      wrapSeg(seg.text);
    } else {
      pasteIds.push(seg.id);
      if (expandedPastes.has(seg.id)) {
        wrapSeg(seg.text);
      } else {
        lines.push({ kind: 'chip', id: seg.id, preview: seg.text.replace(/\s+/g, ' ').trim().slice(0, 20) });
      }
    }
  }
  let start = 0;
  let end = lines.length;
  // 先绑局部常量再收窄：lines[i] 每次访问都是新的联合类型，IDE 的 TS 5.x 不会对它收窄 2026年10月31日17点50分
  const blank = (i: number) => {
    const ln = lines[i];
    return ln.kind === 'text' && ln.text.trim() === '';
  };
  while (start < end && blank(start)) start++;
  while (end > start && blank(end - 1)) end--;
  return { lines: lines.slice(start, end), pasteIds };
}

/** 对话流 → 块列表（丢弃工具行；正文保留完整折行，截断交给视口） */
function buildBlocks(entries: ChatEntry[], maxWidth: number, expandedPastes: ReadonlySet<string>): Block[] {
  const blocks: Block[] = [];
  for (const e of entries) {
    if (e.role === 'tool') continue;
    const isUser = e.role === 'user';
    const { lines, pasteIds } = buildEntryLines(e, maxWidth, expandedPastes);
    blocks.push({
      role: e.role,
      label: `${isUser ? '🧑 你' : '🤖 AI'}${e.timestamp ? ` · ${fmtDate(e.timestamp)}` : ''}`,
      lines,
      pasteIds,
      entry: e
    });
  }
  return blocks;
}

/**
 * BlockWindow — 按块高（不定高）计算可见窗口的预览列表
 *
 * ScrollableList 假设「一项一行」，块是不定高的，窗口按累计块高算：
 * 从选中块向上累加再向下补齐，两端画 ↑ N / ↓ N 溢出指示。
 * 窗口算完后若还有剩余行，自适应填充，避免底部留白像「还有一页」：
 *   1. 弹性展开窗口内被截断的块（选中块优先）；
 *   2. 底部预窥下一块头部，顶部预窥上一块尾部（暗色，表示上下文）。
 * 只有对话内容真的到头了，才留空。
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
  const cap = (b: Block) => Math.min(b.lines.length, MAX_BLOCK_LINES);
  const minH = (b: Block) => cap(b) + 2; // 标签1 + 正文 + 块间空行1

  // 每块初始只露前 MAX_BLOCK_LINES 行
  const show = blocks.map(cap);

  let start = sel;
  let end = sel;
  let peekTop = 0;
  let peekBottom = 0;

  if (minH(blocks[sel]) >= avail) {
    // 极端小视口：只保证选中块可见
    show[sel] = Math.max(1, avail - 2);
  } else {
    // 整块窗口：从选中块向上累加，再向下补齐
    let used = minH(blocks[sel]);
    while (start > 0 && used + minH(blocks[start - 1]) <= avail) {
      start--;
      used += minH(blocks[start]);
    }
    while (end < blocks.length - 1 && used + minH(blocks[end + 1]) <= avail) {
      end++;
      used += minH(blocks[end]);
    }

    // 弹性扩展：剩余行先给选中块，再给窗口内其他被截断的块
    let leftover = avail - used;
    const expand = (i: number) => {
      const grow = Math.min(blocks[i].lines.length - show[i], leftover);
      show[i] += grow;
      leftover -= grow;
    };
    expand(sel);
    for (let i = start; i <= end && leftover > 0; i++) {
      if (i !== sel) expand(i);
    }

    // 仍有余量：底部预窥下一块头部（标签 + 前若干行，成本 = 行数 + 标签1 + 空行1）
    if (leftover >= 3 && end < blocks.length - 1) {
      const n = Math.min(blocks[end + 1].lines.length, leftover - 2);
      if (n > 0) {
        peekBottom = n;
        leftover -= n + 2;
      }
    }

    // 仍有余量：顶部预窥上一块尾部（纯行无标签，成本 = 行数 + 空行1）
    if (leftover >= 2 && start > 0) {
      peekTop = Math.min(blocks[start - 1].lines.length, leftover - 1);
    }
  }

  const firstRendered = peekTop > 0 ? start - 1 : start;
  const lastRendered = peekBottom > 0 ? end + 1 : end;
  const rowW = Math.max(1, width - 2); // paddingX 1*2

  // 取块的前 n 行；未展示完整且末行是普通文本时拼 ' ...'（chip 本身就代表截断）
  const headLines = (b: Block, n: number): BlockLine[] => {
    const ls = b.lines.slice(0, Math.max(1, n));
    if (n < b.lines.length) {
      const last = ls[ls.length - 1];
      if (last.kind === 'text') ls[ls.length - 1] = { ...last, text: `${last.text} ...` };
    }
    return ls;
  };

  const renderBlock = (b: Block, realIdx: number, lines: BlockLine[]) => {
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
            {lines.flatMap((ln, i) => [
              i > 0 ? '\n' : '',
              ln.kind === 'chip' ? (
                <Text key={i} backgroundColor="#21262D" color="#E3B341">{` 📋 ${ln.preview}… `}</Text>
              ) : (
                <Text key={i} color={isUser ? '#E6EDF3' : '#C9D1D9'}>{ln.text}</Text>
              )
            ])}
            {'\n'}
          </Text>
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      {firstRendered > 0 && <Text color="#57606A">{`↑ ${firstRendered}`}</Text>}
      {peekTop > 0 && (
        <Box flexDirection="row" width={rowW}>
          <Text color="#30363D">{'  '}</Text>
          <Box flexGrow={1}>
            <Text color="#57606A">{`${blocks[start - 1].lines
              .slice(-peekTop)
              .map(ln => (ln.kind === 'chip' ? `📋 ${ln.preview}…` : ln.text))
              .join('\n')}\n`}</Text>
          </Box>
        </Box>
      )}
      {blocks.slice(start, end + 1).map((b, i) => renderBlock(b, start + i, headLines(b, show[start + i])))}
      {peekBottom > 0 && renderBlock(blocks[end + 1], end + 1, headLines(blocks[end + 1], peekBottom))}
      {lastRendered < blocks.length - 1 && (
        <Text color="#57606A">{`↓ ${blocks.length - 1 - lastRendered}`}</Text>
      )}
    </Box>
  );
}
