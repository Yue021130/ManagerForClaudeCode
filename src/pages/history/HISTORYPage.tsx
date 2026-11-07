import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PageMeta, PageProps } from '../../types.js';
import { useShell } from '../../shell/context.js';
import ScrollableList from '../../components/ScrollableList.js';
import DetailPanel from '../../components/DetailPanel.js';
import VerticalDivider from '../../components/VerticalDivider.js';
import {
  scanAllProjects,
  scanSession,
  claudeProjectsRoot,
  readConversation,
  moveSession,
  exportMarkdown,
  renameSessionTitle
} from './scan.js';
import { requestResume, spawnResumeNewWindow } from './resume.js';
import type { ChatEntry, ProjectInfo, SessionMeta } from './types.js';

/**
 * HISTORY 页 — Claude Code 历史对话管理
 *
 * 三栏：项目列表 | 会话列表 | 对话预览
 * 数据：~/.claude/projects/<dir>/<sessionId>.jsonl（见 scan.ts）
 *
 * 键位：↑↓ 移动（随焦点）  ←→/tab 切焦点  enter 下钻/进详情  space 粘贴段展开/收起
 *       / 搜索（Enter 或删空退出）  d 删除（弹窗输入 YUE 确认）  x 归档  e 导出MD  r 重命名（弹窗，运行中锁定）
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
    ['e', '导出'],
    ['r', '重命名'],
    ['ss', '恢复']
  ]
};

// ── 展示格式化 ──
// 注意：jsonl 时间戳是 UTC ISO 串，必须转本地时区再切分，直接 slice 会差 8 小时（UTC+8）
const fmtDate = (iso: string | null): string => {
  if (!iso) return '--     --:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--     --:--';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const fmtSize = (b: number): string =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)}M` : b >= 1024 ? `${Math.round(b / 1024)}K` : `${b}B`;

const projName = (p: ProjectInfo): string => (p.cwd ? path.basename(p.cwd) : p.dirName);

// 展示路径：home 前缀缩成 ~，省横向空间
const shortPath = (p: string): string => {
  const home = os.homedir();
  return p.toLowerCase().startsWith(home.toLowerCase()) ? '~' + p.slice(home.length) : p;
};

// 显示宽度（CJK/全角 2 列，其余 1 列；… 是歧义宽字符，string-width 与终端都按 1 列）
const strW = (s: string): number => {
  let n = 0;
  for (const c of s) n += c === '…' ? 1 : (c.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
  return n;
};

// 路径放不下时中段省略：~\Desktop\…\ManagerForClaudeCode —— 优先保住尾部项目名，
// 比 wrap="truncate" 直接砍尾巴有用（砍尾巴恰恰把最重要的项目名砍没了）
const fitPath = (p: string, maxW: number): string => {
  if (strW(p) <= maxW) return p;
  const segs = p.split(/[\\/]+/);
  if (segs.length >= 2) {
    const last = segs[segs.length - 1];
    for (let keep = segs.length - 2; keep >= 1; keep--) {
      const cand = `${segs.slice(0, keep).join('\\')}\\…\\${last}`;
      if (strW(cand) <= maxW) return cand;
    }
    if (strW(`…\\${last}`) <= maxW) return `…\\${last}`;
  }
  let tail = p;
  while (tail && strW('…' + tail) > maxW) tail = tail.slice(1);
  return '…' + tail;
};

// 模型名展示：只去供应商前缀（openai/gpt-x → gpt-x）。不做长度截断——
// 头部行本身有 wrap="truncate" 兜底，硬砍 16 字符会把 deepseek-flash[...] 这类名字拦腰切断
const shortModel = (m: string): string => m.slice(m.lastIndexOf('/') + 1);

// 「运行中」判定窗口：N 分钟内有写入视为正在使用（Claude Code 日志句柄不常驻，只能看 mtime）
const RUNNING_MIN = 3;
const RUNNING_WINDOW_MS = RUNNING_MIN * 60_000;
// 与 scan.ts TITLE_MAX 一致：标题最长 40 字
const TITLE_MAX = 40;
const isFreshPath = (p: string): boolean => {
  try {
    return Date.now() - fs.statSync(p).mtimeMs < RUNNING_WINDOW_MS;
  } catch {
    return false;
  }
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
  // 运行中检测：Claude Code 写日志是开-写-关（句柄不常驻，Restart Manager 探不到），
  // 改用 mtime 新鲜度：3 分钟内有写入 = 正在使用
  const [confirmLocked, setConfirmLocked] = useState(false);

  // ── 重命名弹窗（风格同删除确认；运行中锁定同标准：mtime 3 分钟新鲜度）──
  const [renaming, setRenaming] = useState<SessionMeta | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState(false); // 标题为空，内联红字提示

  // ── 恢复会话弹窗（ss 双击触发；运行中锁定同删除/重命名标准）──
  const [resuming, setResuming] = useState<SessionMeta | null>(null);
  const [resumeChoice, setResumeChoice] = useState<0 | 1>(0); // 0=当前终端 1=新窗口
  const { exit } = useApp();

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
    () => buildBlocks(entries, Math.max(10, previewW - 6), expandedPastes),
    [entries, previewW, expandedPastes]
  );
  const vIdx = Math.min(previewIdx, Math.max(0, blocks.length - 1));

  // ── 详情视图（enter 展开整块，esc 返回） ──
  const [detail, setDetail] = useState<Block | null>(null);
  const [detailIdx, setDetailIdx] = useState(0);
  const detailLines = useMemo(() => {
    if (!detail) return [];
    const w = Math.max(10, width - 4);
    // 工具块：完整内容 = 调用 + 红绿 diff + 结果（与预览同一构造）
    if (detail.entry.role === 'tool') return buildToolLines(detail.entry, w);
    return buildEntryLines(detail.entry, w, expandedPastes).lines;
  }, [detail, width, expandedPastes]);
  const dIdx = Math.min(detailIdx, Math.max(0, detailLines.length - 1));

  // 轮询里要用最新值（不重建 interval），每渲染同步进 ref
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const previewWRef = useRef(previewW);
  previewWRef.current = previewW;
  // gg 双击检测：上次按 g 的时间戳（预览/详情共用，500ms 窗口）
  const lastGRef = useRef(0);
  // ss 双击检测：恢复选中会话（500ms 窗口）
  const lastSRef = useRef(0);
  const expandedRef = useRef(expandedPastes);
  expandedRef.current = expandedPastes;
  const blocksLenRef = useRef(blocks.length);
  blocksLenRef.current = blocks.length;

  // ── 实时刷新：每 3s stat 全部会话文件，一次扫描喂全部用途 ──
  //  1) mtime < 3min        → 绿点（运行中）
  //  2) mtime 变化          → 刷新该会话 meta（标题/时间/大小实时）
  //  3) 目录形状变化        → 全量重扫（新会话出现 / 旧会话消失）
  //  4) 预览选中文件有写入  → 重载对话；原本停在末尾则跟随末尾，阅读中途不打扰
  const [runningSet, setRunningSet] = useState<Set<string>>(new Set());
  const mtimesRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!projects) return;
    const root = claudeProjectsRoot();
    if (!root) return;
    let alive = true;
    const tick = () => {
      const prev = mtimesRef.current;
      const fresh = new Map<string, number>();
      let shapeChanged = false;
      for (const p of projects) {
        let files: string[];
        try {
          files = fs.readdirSync(path.join(root, p.dirName)).filter((f) => f.endsWith('.jsonl'));
        } catch {
          shapeChanged = true;
          continue;
        }
        if (files.length !== p.sessions.length) shapeChanged = true;
        for (const s of p.sessions) {
          try {
            fresh.set(s.filePath, fs.statSync(s.filePath).mtimeMs);
          } catch {
            shapeChanged = true;
          }
        }
      }
      if (!alive) return;
      const now = Date.now();
      const running = new Set<string>();
      for (const [fp, mt] of fresh) {
        if (now - mt < RUNNING_WINDOW_MS) running.add(fp);
      }
      setRunningSet(running);
      if (shapeChanged) {
        rescan();
        return;
      }
      const changed: string[] = [];
      for (const [fp, mt] of fresh) {
        if (prev.get(fp) !== mt) changed.push(fp);
      }
      mtimesRef.current = fresh;
      if (!changed.length) return;
      setProjects((ps) =>
        ps
          ? ps.map((p) => ({
              ...p,
              sessions: p.sessions.map((s) => {
                if (!changed.includes(s.filePath)) return s;
                try {
                  return scanSession(s.filePath);
                } catch {
                  return s;
                }
              })
            }))
          : ps
      );
      const pfp = previewRef.current?.session.filePath;
      if (pfp && changed.includes(pfp)) {
        try {
          const list = readConversation(pfp);
          const meta = scanSession(pfp); // meta 一并刷新（问数/答数/大小实时）
          setPreview((old) => (old ? { session: meta, entries: list } : old));
          setPreviewIdx((idx) => {
            const newLen = buildBlocks(list, Math.max(10, previewWRef.current - 6), expandedRef.current).length;
            return idx >= blocksLenRef.current - 2 ? Math.max(0, newLen - 1) : idx;
          });
        } catch {
          /* 读取失败等下一轮 */
        }
      }
    };
    tick();
    const timer = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [projects]);
  const isRunning = (s: SessionMeta): boolean => runningSet.has(s.filePath);

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
      const newBlocks = buildBlocks(list, Math.max(10, previewW - 6), new Set());
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
    // 执行前复查：最近 3 分钟有写入 = 会话可能正在使用，拦截防止记录劈叉
    if (isFreshPath(target.filePath)) {
      const verb = kind === 'trash' ? '删除' : '归档';
      setError(`「${target.title.slice(0, 16)}」最近 ${RUNNING_MIN} 分钟内有写入（会话可能正在运行），不可${verb}`);
      return;
    }
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

    // 恢复会话弹窗：↑↓/1/2 选择，enter 确认，esc 取消；其余键吃掉
    if (resuming) {
      if (key.escape) {
        setResuming(null);
        setKeysEnabled(true);
        return;
      }
      if (key.upArrow || key.downArrow) return setResumeChoice(c => (c === 0 ? 1 : 0));
      if (input === '1') return setResumeChoice(0);
      if (input === '2') return setResumeChoice(1);
      if (key.return) {
        const target = resuming;
        if (resumeChoice === 1) {
          // 新窗口：拉起即走，管理器不退出
          spawnResumeNewWindow(target)
            .then(() => setMessage(`已在新窗口恢复「${target.title.slice(0, 16)}」`))
            .catch((e) => setError(`恢复失败: ${String(e)}`));
          setResuming(null);
          setKeysEnabled(true);
          return;
        }
        // 当前终端：登记请求 → 退出 App，cli.tsx 接力拉起 claude（claude 退出后自动重挂 App）
        setResuming(null);
        requestResume(target);
        setTimeout(() => exit(), 0); // 同 Esc 的延迟一拍：避免在 input 派发栈内同步卸载
        return;
      }
      return;
    }

    // 删除确认弹窗：输入 YUE + enter 才执行；esc 取消；其余键吃掉
    if (confirming) {
      if (key.escape) {
        setConfirming(null);
        setConfirmInput('');
        setConfirmError(false);
        setConfirmLocked(false);
        setKeysEnabled(true);
        return;
      }
      if (key.return) {
        if (confirmInput === 'YUE') {
          if (confirmLocked) {
            setConfirmInput(''); // 运行中：清空输入并提示，不移除
            return;
          }
          const target = confirming;
          setConfirming(null);
          setConfirmInput('');
          setConfirmError(false);
          setConfirmLocked(false);
          setKeysEnabled(true);
          removeOrArchive('trash', target); // 执行前还会再复查一次
        } else {
          setConfirmInput('');
          setConfirmError(true);
        }
        return;
      }
      if (key.backspace || key.delete) {
        setConfirmError(false);
        return setConfirmInput(s => s.slice(0, -1));
      }
      if (!key.ctrl && !key.meta && input) {
        setConfirmError(false);
        return setConfirmInput(s => (s + input).slice(0, 3)); // 就 3 个槽位
      }
      return;
    }

    // 重命名弹窗：enter 提交（trim 非空、运行中锁定则拒）；esc 取消；其余键吃掉
    if (renaming) {
      if (key.escape) {
        setRenaming(null);
        setRenameInput('');
        setRenameError(false);
        setKeysEnabled(true);
        return;
      }
      if (key.return) {
        if (isFreshPath(renaming.filePath)) return; // 锁定：只能 esc（同删除确认）
        const title = renameInput.trim().slice(0, TITLE_MAX);
        if (!title) {
          setRenameError(true);
          return;
        }
        const target = renaming;
        try {
          renameSessionTitle(target.filePath, title);
          setRenaming(null);
          setRenameInput('');
          setRenameError(false);
          setKeysEnabled(true);
          setMessage(`已重命名为「${title.slice(0, 16)}」`);
          rescan();
        } catch (e) {
          setRenameError(true);
          setError(`重命名失败: ${String(e)}`);
        }
        return;
      }
      // Backspace 键两种字节都收：\b(0x08)→key.backspace、\x7f(0x7F)→key.delete（Windows 终端多发后者）
      if (key.backspace || key.delete) {
        setRenameError(false);
        return setRenameInput(s => s.slice(0, -1));
      }
      if (!key.ctrl && !key.meta && input) {
        setRenameError(false);
        return setRenameInput(s => (s + input).slice(0, TITLE_MAX));
      }
      return;
    }

    // 详情视图：↑↓ 滚动，gg/G 跳顶/底，space 展开/收起粘贴段，Esc 返回，吃掉其余键
    if (detail) {
      if (key.escape) return closeDetail();
      if (input === ' ') return togglePaste(detail.pasteIds);
      if (key.upArrow) return setDetailIdx(Math.max(0, dIdx - 1));
      if (key.downArrow) return setDetailIdx(Math.min(detailLines.length - 1, dIdx + 1));
      if (input === 'G') return setDetailIdx(Math.max(0, detailLines.length - 1));
      if (input === 'g') {
        const now = Date.now();
        if (now - lastGRef.current < 500) {
          lastGRef.current = 0;
          return setDetailIdx(0);
        }
        lastGRef.current = now;
        return;
      }
      return;
    }

    // 搜索模式：行内编辑；Enter / Esc / 删空退出
    if (searching) {
      if (key.escape || key.return || ((key.backspace || key.delete) && !query)) {
        setSearching(false);
        setKeysEnabled(true);
        if (key.backspace || key.delete) setQuery('');
        setSessIdx(0);
        return;
      }
      if (key.backspace || key.delete) return setQuery(q => q.slice(0, -1));
      if (!key.ctrl && !key.meta && input) return setQuery(q => q + input);
      return;
    }

    if (key.upArrow) return move(-1);
    if (key.downArrow) return move(1);
    if (key.leftArrow || (key.shift && key.tab)) return cycleFocus(-1);
    if (key.rightArrow || key.tab) return cycleFocus(1);

    // 预览列 vim 式跳转：gg 到顶、G 到底（500ms 内连按两次 g）
    if (focus === 'preview' && blocks.length) {
      if (input === 'G') return setPreviewIdx(blocks.length - 1);
      if (input === 'g') {
        const now = Date.now();
        if (now - lastGRef.current < 500) {
          lastGRef.current = 0;
          return setPreviewIdx(0);
        }
        lastGRef.current = now;
        return;
      }
    }

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
      setConfirmError(false);
      setConfirmLocked(isFreshPath(currentSession.filePath)); // 同步 mtime 检测，无等待
      setKeysEnabled(false); // 弹窗接管键盘：数字键不切页、Esc 不退出
      return;
    }
    if (input === 'x') return removeOrArchive('archive');
    if (input === 'e') return doExport();
    // ss 双击恢复会话（500ms 窗口，同 gg 手感）；运行中/无路径直接拦截不开弹窗
    if (input === 's') {
      const now = Date.now();
      if (now - lastSRef.current >= 500) {
        lastSRef.current = now;
        return;
      }
      lastSRef.current = 0;
      if (!currentSession) return;
      if (isFreshPath(currentSession.filePath)) {
        setError('最近三分钟有会话写入，不可恢复');
        return;
      }
      if (!currentSession.cwd) {
        setError('该会话没有记录项目路径，无法恢复');
        return;
      }
      setResuming(currentSession);
      setResumeChoice(0);
      setKeysEnabled(false); // 弹窗接管键盘：数字键不切页、Esc 不退出
      return;
    }
    if (input === 'r') {
      if (!currentSession) return;
      setRenaming(currentSession);
      setRenameInput(currentSession.title === '(空会话)' || currentSession.title === '(空消息)' ? '' : currentSession.title);
      setRenameError(false);
      setKeysEnabled(false); // 弹窗接管键盘：数字键不切页、Esc 不退出
      return;
    }
  });

  // ── 渲染 ──
  if (!projects) {
    return (
      <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
        <Text color="#A9B4C0">正在扫描 ~/.claude/projects …</Text>
      </Box>
    );
  }

  if (!projects.length) {
    return (
      <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
        <Text color="#8B949E">没有找到 Claude 对话历史（~/.claude/projects 为空）</Text>
      </Box>
    );
  }

  // ── 详情视图：整页替换三栏 ──
  if (detail) {
    const isUser = detail.role === 'user';
    return (
      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        <Box height={1} flexDirection="row" paddingX={1}>
          <Text bold color={isUser ? '#79C0FF' : '#A371F7'} wrap="truncate">
            <Text backgroundColor={isUser ? '#1F6FEB' : '#451256'}>{` ${isUser ? '😏' : '👾'} `}</Text>
            {` ${detail.label}${detail.time ? ` · ${detail.time}` : ''} · 完整内容`}
          </Text>
          <Box flexGrow={1} />
          <Text color="#8B949E">↑↓ 滚动  space 粘贴  esc 返回</Text>
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
            ) : ln.kind === 'tool' ? (
              <Text color={active ? '#0D1117' : ln.error || ln.tone === 'del' ? '#FF7B72' : ln.tone === 'add' ? '#3FB950' : ln.result || ln.tone === 'ctx' ? '#8B949E' : '#E3B341'}>
                {ln.text === '' ? ' ' : `  ${ln.text}`}
              </Text>
            ) : (
              <Text bold={ln.bold} color={active ? '#0D1117' : isUser ? '#F0A6C9' : '#C9D1D9'}>
                {ln.text === '' ? ' ' : <>{'  '}{boldSegs(ln.text)}</>}
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
                <Box flexShrink={0}>
                  <Text color={hot ? '#0D1117' : '#8B949E'}>{` ${p.sessions.length}`}</Text>
                </Box>
              </>
            );
          }}
        />
      </Box>

      <VerticalDivider />

      {/* ── 中：会话卡片（+ 搜索框） ── */}
      <Box width={sessW} flexDirection="column" paddingX={1}>
        {searching && (
          <Box>
            <Text color="#E3B341">/{query}</Text>
            <Text color="#E3B341">▌</Text>
          </Box>
        )}
        {/* 标题行：`SESSIONS · N`（不用灰底徽章，丑；计数只在这里出现一次） */}
        <Box>
          <Text bold color="#E6EDF3">{inSearch ? `搜索 “${query.trim()}”` : 'SESSIONS'}</Text>
          <Text color="#8B949E">{` · ${sessions.length}`}</Text>
        </Box>
        {/* 引导行：完整项目路径（无框；搜索模式下不显示）。计数已与标题合并，此处不重复。
            路径独占一整行，~ 开头后 44 列内基本都能全显；极端长路径才中段省略兜底 */}
        {!inSearch && project && (
          <Box>
            <Text color="#A9B4C0" wrap="truncate">
              {fitPath(project.cwd ? shortPath(project.cwd) : project.dirName, sessW - 2)}
            </Text>
          </Box>
        )}
        <SessionCards
          sessions={sessions}
          selectedIndex={sIdx}
          inSearch={inSearch}
          avail={height - (searching ? 1 : 0) - 1 - (inSearch ? 0 : 1)}
          width={sessW - 2}
          isRunning={isRunning}
        />
        {!sessions.length && (
          <Box>
            <Text color="#8B949E">{inSearch ? '没有匹配的会话' : '无会话'}</Text>
          </Box>
        )}
      </Box>

      <VerticalDivider />

      {/* ── 右：对话预览 ── */}
      <DetailPanel
        flexGrow
        isFocused={focus === 'preview'}
        title=""
        emptyMessage="enter 预览会话"
      >
        {/* 顶部不再放统计/路径行：消息直接从面板顶部开始（统计挪到中栏会话卡片） */}
        {preview && blocks.length > 0 && (
          <BlockWindow
            blocks={blocks}
            selected={focus === 'preview' ? vIdx : -1}
            avail={Math.max(4, height)}
            width={previewW}
          />
        )}
        {preview && blocks.length === 0 && (
          <Text color="#8B949E" wrap="truncate">此会话没有可展示的对话（可能是纯命令会话）</Text>
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
            {confirmLocked ? (
              <Text color="#FF7B72">⚠ 会话最近 {RUNNING_MIN} 分钟内有写入（可能正在运行），不可删除</Text>
            ) : (
              <Text color="#8B949E">移到 ~/.claude/backups/mfcc-trash，可恢复</Text>
            )}
          </Box>
          <Box justifyContent="center" marginBottom={1}>
            <Text color="#A9B4C0">输入 </Text>
            <Text bold color="#E3B341">YUE</Text>
            <Text color="#A9B4C0">  </Text>
            {[0, 1, 2].map(i => {
              const ch = confirmInput[i];
              const isCursor = i === confirmInput.length;
              return (
                <Text key={i}>
                  {i > 0 && ' '}
                  <Text
                    backgroundColor="#21262D"
                    bold={!!ch}
                    color={ch || isCursor ? '#E3B341' : '#8B949E'}
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
              <Text color="#8B949E">enter 确认 · esc 取消</Text>
            )}
          </Box>
        </Box>
      )}

      {renaming && (
        <Box
          position="absolute"
          marginTop={Math.max(0, Math.floor((height - 10) / 2))}
          width={width}
          flexDirection="column"
          borderStyle="single"
          borderLeft={false}
          borderRight={false}
          borderColor="#A371F7"
          backgroundColor="#0D1117"
          paddingY={1}
        >
          <Box justifyContent="center" marginBottom={1}>
            <Text bold color="#A371F7">重命名该会话</Text>
          </Box>
          <Box justifyContent="center">
            <Text color="#E6EDF3" wrap="truncate">
              {renaming.title.length > 24 ? `${renaming.title.slice(0, 24)}...` : renaming.title}
            </Text>
          </Box>
          <Box justifyContent="center" marginBottom={1}>
            {isFreshPath(renaming.filePath) ? (
              <Text color="#FF7B72">⚠ 会话最近 {RUNNING_MIN} 分钟内有写入（可能正在运行），不可重命名</Text>
            ) : (
              <Text color="#8B949E">同步写入会话文件，Claude Code 列表同样生效</Text>
            )}
          </Box>
          {!isFreshPath(renaming.filePath) && (
            <Box justifyContent="center" marginBottom={1}>
              <Text backgroundColor="#21262D">
                <Text color="#E6EDF3">{` ${renameInput}`}</Text>
                <Text color="#E3B341">_</Text>
                <Text>{' '}</Text>
              </Text>
            </Box>
          )}
          <Box justifyContent="center">
            {renameError ? (
              <Text color="#FF7B72">标题不能为空，重试或 esc 取消</Text>
            ) : isFreshPath(renaming.filePath) ? (
              <Text color="#8B949E">esc 取消</Text>
            ) : (
              <Text color="#8B949E">enter 确认 · esc 取消</Text>
            )}
          </Box>
        </Box>
      )}
      {resuming && (
        <Box
          position="absolute"
          marginTop={Math.max(0, Math.floor((height - 10) / 2))}
          width={width}
          flexDirection="column"
          borderStyle="single"
          borderLeft={false}
          borderRight={false}
          borderColor="#3FB950"
          backgroundColor="#0D1117"
          paddingY={1}
        >
          <Box justifyContent="center" marginBottom={1}>
            <Text bold color="#3FB950">恢复会话</Text>
          </Box>
          <Box justifyContent="center" marginBottom={1}>
            <Text color="#E6EDF3" wrap="truncate">
              {resuming.title.length > 24 ? `${resuming.title.slice(0, 24)}...` : resuming.title}
            </Text>
          </Box>
          {(['在当前终端恢复', '新开终端窗口恢复'] as const).map((label, i) => (
            <Box key={i} justifyContent="center">
              <Text bold={resumeChoice === i} color={resumeChoice === i ? '#E3B341' : '#A9B4C0'}>
                {`${resumeChoice === i ? '❯ ' : '  '}${i + 1}. ${label}`}
              </Text>
            </Box>
          ))}
          <Box justifyContent="center" marginTop={1}>
            <Text color="#8B949E">↑↓ 选择 · enter 确认 · esc 取消</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ── 预览块 ──

/** 展示行：普通文本行 / 折叠的粘贴段（chip 颜色块）/ 工具调用·结果·diff 行 */
type BlockLine =
  // table=renderTable 画出的网格行（截断时不能拦腰切）；bold=整行加粗（标题/表头）
  | { kind: 'text'; text: string; table?: boolean; bold?: boolean }
  | { kind: 'chip'; id: string; preview: string }
  | { kind: 'tool'; text: string; error?: boolean; result?: boolean; tone?: 'add' | 'del' | 'ctx' };

/**
 * Block — 预览区的一项 = 一条对话（Q / A / 工具调用·结果），整块选中/高亮
 *
 * 工具调用折叠成 ⚡ 行（工具名 + 命令/路径摘要，错误标红）；Edit/Update 带 old/new，
 * 渲染红绿 diff（原版颜色对比）；结果保留多行结构挂在调用下（└ 行）。
 * <pasted_content> 段默认折叠成一行 chip，space 展开/收起（pasteIds 切换）。
 * 正文按面板宽预折行，默认只露前 MAX_BLOCK_LINES 行（末行拼 ' ...'）；
 * 视口有剩余空间时 BlockWindow 会弹性展开被截断的块（选中块优先）。
 * enter 进详情视图看完整内容。
 */
type Block = {
  role: 'user' | 'assistant';
  label: string;       // 标签行：你 / AI · 模型（头像由渲染处加徽章）
  time: string | null; // 对话时间（渲染时右对齐到块宽）
  lines: BlockLine[];  // 展示行（已按粘贴展开状态生成）
  pasteIds: string[];  // 块内粘贴段 id（没有则 space 无效）
  entry: ChatEntry;
};

const MAX_BLOCK_LINES = 6;

// 存储文本里可能带 ANSI 转义（终端拷贝来的），渲染前剥掉
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const stripAnsi = (s: string): string => s.replace(ANSI_RE, '');

const charWidth = (code: number): number => (code > 0xFF ? 2 : 1);

/** 按显示宽度折行：优先在空格处断（英文单词不劈开），无断点（长单词/纯中文）才硬拆。
 *  空白与缩进原样保留（Read 结果的代码缩进不能丢），行尾空白丢弃 */
function wrapText(text: string, maxWidth: number): string[] {
  const widthOf = (s: string): number => {
    let n = 0;
    for (const c of s) n += c === '\t' ? 1 : charWidth(c.codePointAt(0) ?? 0);
    return n;
  };
  const lastBreak = (s: string): number => {
    // 最后一个空格/tab 展开位之后的下标；无则 -1
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i] === ' ') return i + 1;
    }
    return -1;
  };
  const out: string[] = [];
  let cur = '';
  let w = 0;
  let brk = -1; // 最后一个可断点之后的字符下标
  for (const ch of text) {
    // tab 就地展开成空格：终端把它跳到 8 的倍数列（最多 +7 格），
    // 而 ink/string-width 按 0~1 算——直接输出 tab 会让实际行宽超出预算物理折行
    if (ch === '\t') {
      const pad = 8 - (w % 8);
      cur += ' '.repeat(pad);
      w += pad;
      // 不设为断点：行号+内容是一个整体，断在这儿会把行号孤立成行
      continue;
    }
    const cw = charWidth(ch.codePointAt(0) ?? 0);
    if (w + cw > maxWidth) {
      const rest = brk > 0 ? cur.slice(brk) : '';
      // 断在空格后，需同时满足：断点前至少有 4 个非空白字符（不把行号/缩进孤立成行），且
      // 余段自身还有断点、或余段+当前字符能在新行单行放下——
      // 余段是无空格且放不下的超长块（纯中文/长单词）时宁可现在硬拆
      const preSolid = cur.slice(0, brk).replace(/ /g, '').length >= 4;
      if (brk > 0 && preSolid && (lastBreak(rest) !== -1 || widthOf(rest) + cw <= maxWidth)) {
        out.push(cur.slice(0, brk).replace(/\s+$/, ''));
        cur = rest;
        w = widthOf(cur);
        brk = lastBreak(cur);
      } else {
        out.push(cur.replace(/\s+$/, ''));
        cur = '';
        w = 0;
        brk = -1;
      }
    }
    cur += ch;
    w += cw;
    if (ch === ' ') brk = cur.length;
  }
  if (cur) out.push(cur.replace(/\s+$/, ''));
  return out.length ? out : [''];
}

// ── markdown 表格渲染（对齐 Claude Code 的 box-drawing 表格）──
// 检测连续 `|...|` 行 → ┌─┬─┐ 网格；超宽按比例压缩列宽，单元格内容折行不截断
const isTableRow = (line: string): boolean => {
  const t = line.trim();
  return t.length > 1 && t.startsWith('|') && t.endsWith('|');
};
// 单元格里的 **粗体** 标记必须剥掉再排版：标记参与列宽计算会让边框错位；
// 粗体在表格里不逐格渲染，由表头整行加粗代替
const splitRow = (line: string): string[] =>
  line.trim().slice(1, -1).split('|').map(c =>
    c.trim().replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
  );
const isSepRow = (cells: string[]): boolean =>
  cells.every(c => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')));

const twOf = (s: string): number =>
  [...s].reduce((w, c) => w + charWidth(c.codePointAt(0) ?? 0), 0);

const padW = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - twOf(s)));

// 单元格内容按显示宽硬折行（不做词断——列宽可能只有个位数，词断反而浪费行高）
const wrapCell = (s: string, w: number): string[] => {
  const out: string[] = [];
  let cur = '';
  let n = 0;
  for (const c of s) {
    const cw = charWidth(c.codePointAt(0) ?? 0);
    if (n + cw > w && cur) {
      out.push(cur);
      cur = '';
      n = 0;
    }
    cur += c;
    n += cw;
  }
  out.push(cur);
  return out;
};

function renderTable(rows: string[], maxWidth: number): string[] {
  const parsed = rows.map(splitRow);
  const header = parsed[0];
  const body = parsed.slice(1).filter(r => !isSepRow(r));
  const cols = Math.max(...parsed.map(r => r.length));
  // 列宽 = 该列最长内容的显示宽（封顶 30），再按面板宽逐列压缩最宽列（压缩后内容折行不丢失）
  const colW: number[] = [];
  for (let c = 0; c < cols; c++) {
    let w = 3;
    for (const r of [header, ...body]) w = Math.max(w, twOf(r[c] ?? ''));
    colW.push(Math.min(w, 30));
  }
  const total = () => 1 + colW.reduce((a, b) => a + b + 3, 0); // '│' + ' cell │'×列数
  while (total() > maxWidth && Math.max(...colW) > 3) {
    colW[colW.indexOf(Math.max(...colW))]--;
  }
  // 一个逻辑行折成多条物理行：各单元格独立折行，行数取该组最高
  const row = (cells: string[]): string[] => {
    const wrapped = Array.from({ length: cols }, (_, c) => wrapCell(cells[c] ?? '', colW[c]));
    const h = Math.max(...wrapped.map(wc => wc.length));
    return Array.from({ length: h }, (_, i) =>
      '│' + wrapped.map((wc, c) => ` ${padW(wc[i] ?? '', colW[c])} │`).join('')
    );
  };
  const border = (l: string, m: string, r: string): string =>
    l + colW.map(w => '─'.repeat(w + 2)).join(m) + r;
  const out = [border('┌', '┬', '┐'), ...row(header), border('├', '┼', '┤')];
  for (const b of body) out.push(...row(b));
  out.push(border('└', '┴', '┘'));
  return out;
}

// 标题行去掉 ### 标记（CC 渲染成加粗标题，我们整行加粗：stripHeading 拿文本，bold 标记由调用方打）
const stripHeading = (line: string): string => line.replace(/^#{1,6}\s+/, '');
const isHeading = (line: string): boolean => /^#{1,6}\s+/.test(line);

// 行内 **粗体** 渲染：split 捕获组，奇数段是粗体内容（表格单元格已在 splitRow 剥离标记，不走这里）
const boldSegs = (text: string): ReactNode[] => {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return [text];
  return parts.map((p, i) => (i % 2 === 1 ? <Text key={i} bold>{p}</Text> : p));
};

/** 工具行折行：剥 ANSI、按 \n 分段、逐段硬折（wrapText 不认换行符），空段跳过 */
function wrapToolLines(
  raw: string,
  maxWidth: number,
  error?: boolean,
  result?: boolean,
  tone?: 'add' | 'del' | 'ctx'
): BlockLine[] {
  const out: BlockLine[] = [];
  for (const para of stripAnsi(raw).split('\n')) {
    if (!para.trim()) continue;
    for (const t of wrapText(para, maxWidth)) out.push({ kind: 'tool', text: t, error, result, tone });
  }
  return out;
}

/**
 * 行级 LCS diff（Edit/Update 的红绿对比就是这么来的——数据层只有 old/new 原文，
 * 颜色是原版 TUI 现算的，我们也现算）。
 * 返回 null = 不做 diff（行数超上限，回退普通展示），调用方自行兜底。
 */
function lineDiff(
  oldText: string,
  newText: string,
  maxOps = 80
): { tag: 'ctx' | 'del' | 'add'; text: string }[] | null {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  if (a.length > 200 || b.length > 200) return null;
  const m = a.length;
  const n = b.length;
  const dp = new Uint16Array((m + 1) * (n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i * (n + 1) + j] =
        a[i] === b[j]
          ? dp[(i + 1) * (n + 1) + j + 1] + 1
          : Math.max(dp[(i + 1) * (n + 1) + j], dp[i * (n + 1) + j + 1]);
    }
  }
  const ops: { tag: 'ctx' | 'del' | 'add'; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ tag: 'ctx', text: a[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * (n + 1) + j] >= dp[i * (n + 1) + j + 1]) {
      ops.push({ tag: 'del', text: a[i] });
      i++;
    } else {
      ops.push({ tag: 'add', text: b[j] });
      j++;
    }
    if (ops.length > maxOps) return null;
  }
  while (i < m) {
    ops.push({ tag: 'del', text: a[i++] });
    if (ops.length > maxOps) return null;
  }
  while (j < n) {
    ops.push({ tag: 'add', text: b[j++] });
    if (ops.length > maxOps) return null;
  }
  return ops;
}

/** 工具块行 = ⚡ 调用行 +（Edit/Update 的）红绿 diff 行 + └ 结果行。预览与详情共用 */
function buildToolLines(e: ChatEntry, maxWidth: number): BlockLine[] {
  const lines: BlockLine[] = [];
  const raw = e.toolName === 'result'
    ? `${e.isError ? '✗' : '└'} ${e.text}`
    : `⚡ ${e.toolName ? `${e.toolName} ` : ''}${e.text}`;
  lines.push(...wrapToolLines(raw, maxWidth, e.isError));
  if (e.oldText != null && e.newText != null) {
    const ops = lineDiff(e.oldText, e.newText);
    if (ops) {
      for (const op of ops) {
        const mark = op.tag === 'add' ? '+ ' : op.tag === 'del' ? '- ' : '  ';
        lines.push(...wrapToolLines(mark + op.text, maxWidth, false, false, op.tag));
      }
    }
  }
  if (e.result) {
    const rraw = `${e.resultError ? '✗' : '└'} ${e.result}`;
    lines.push(...wrapToolLines(rraw, maxWidth, e.resultError, true));
  }
  return lines;
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
 * 首尾空行剥掉、中间连续空行压成一行（粘贴内容常带大量换行，渲染出来是大片空白）。
 */
function buildEntryLines(
  entry: ChatEntry,
  maxWidth: number,
  expandedPastes: ReadonlySet<string>
): { lines: BlockLine[]; pasteIds: string[] } {
  const lines: BlockLine[] = [];
  const pasteIds: string[] = [];
  const wrapSeg = (text: string) => {
    const ls = text.split('\n');
    for (let i = 0; i < ls.length; i++) {
      // 连续 ≥2 行 |...| 即 markdown 表格：整段交给 renderTable 画成网格（表头行加粗）
      if (isTableRow(ls[i]) && i + 1 < ls.length && isTableRow(ls[i + 1])) {
        let j = i;
        while (j < ls.length && isTableRow(ls[j])) j++;
        // 表头可能折成多行：├ 分隔线之前的内容行都是表头，整行加粗
        const tbl = renderTable(ls.slice(i, j), maxWidth);
        const sepIdx = tbl.findIndex(t => t.startsWith('├'));
        tbl.forEach((t, k) =>
          lines.push({ kind: 'text', text: t, table: true, bold: k > 0 && (sepIdx === -1 || k < sepIdx) })
        );
        i = j - 1;
        continue;
      }
      // markdown 标题：去 # 标记，整行加粗
      const heading = isHeading(ls[i]);
      for (const t of wrapText(stripHeading(ls[i]), maxWidth))
        lines.push({ kind: 'text', text: t, bold: heading || undefined });
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
  // 连续空行压成一行：粘贴段后常跟多个换行，原样渲染会空一大片
  const trimmed = lines.slice(start, end);
  const collapsed: BlockLine[] = [];
  for (const ln of trimmed) {
    const prev = collapsed[collapsed.length - 1];
    if (ln.kind === 'text' && ln.text.trim() === '' && prev?.kind === 'text' && prev.text.trim() === '') continue;
    collapsed.push(ln);
  }
  return { lines: collapsed, pasteIds };
}

/** 对话流 → 块列表（用户/AI 文本按 paste 折叠展开；工具调用·结果各成一块，正文保留完整折行，截断交给视口） */
function buildBlocks(entries: ChatEntry[], maxWidth: number, expandedPastes: ReadonlySet<string>): Block[] {
  const blocks: Block[] = [];
  for (const e of entries) {
    if (e.role === 'tool') {
      // 工具块 = ⚡ 调用 +（Edit/Update 的）红绿 diff + └ 结果；行已按面板宽预折——
      // 不折会让正文 Text 超出盒宽被 yoga 二次折行，块高变大顶破窗口预算（溢出即乱排）
      const lines = buildToolLines(e, maxWidth);
      blocks.push({
        role: 'assistant',
        label: `AI${e.model ? ` · ${shortModel(e.model)}` : ''}`,
        time: e.timestamp ? fmtDate(e.timestamp) : null,
        lines,
        pasteIds: [],
        entry: e
      });
      continue;
    }
    const isUser = e.role === 'user';
    const { lines, pasteIds } = buildEntryLines(e, maxWidth, expandedPastes);
    blocks.push({
      role: e.role,
      label: `${isUser ? '你' : 'AI'}${!isUser && e.model ? ` · ${shortModel(e.model)}` : ''}`,
      time: e.timestamp ? fmtDate(e.timestamp) : null,
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

  // 纯函数：给定正文预算，计算窗口（每块初始只露前 MAX_BLOCK_LINES 行）
  const computeWindow = (budget: number) => {
    const show = blocks.map(cap);
    let start = sel;
    let end = sel;
    let peekTop = 0;
    let peekBottom = 0;

    if (minH(blocks[sel]) >= budget) {
      // 极端小视口：只保证选中块可见
      show[sel] = Math.max(1, budget - 2);
    } else {
      // 整块窗口：从选中块向上累加，再向下补齐
      let used = minH(blocks[sel]);
      while (start > 0 && used + minH(blocks[start - 1]) <= budget) {
        start--;
        used += minH(blocks[start]);
      }
      while (end < blocks.length - 1 && used + minH(blocks[end + 1]) <= budget) {
        end++;
        used += minH(blocks[end]);
      }

      // 弹性扩展：剩余行先给选中块，再给窗口内其他被截断的块
      let leftover = budget - used;
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
    return { show, start, end, peekTop, peekBottom };
  };

  // ↑/↓ 指示行在窗口预算之外渲染：若不预留，窗口列会超出固定高度的内容区，
  // yoga 溢出后子节点全部叠在 top=0（块头被正文覆盖、时间被吃掉）。
  // 先试满预算，实际会渲染几条指示行就扣掉几条重算（最多 2 条，收敛有保证）。
  let win = computeWindow(avail);
  for (let reserve = 0; reserve <= 2; reserve++) {
    win = computeWindow(Math.max(1, avail - reserve));
    const first = win.peekTop > 0 ? win.start - 1 : win.start;
    const last = win.peekBottom > 0 ? win.end + 1 : win.end;
    const indicators = (first > 0 ? 1 : 0) + (last < blocks.length - 1 ? 1 : 0);
    if (indicators <= reserve) break;
  }
  const { show, start, end, peekTop, peekBottom } = win;

  const firstRendered = peekTop > 0 ? start - 1 : start;
  const lastRendered = peekBottom > 0 ? end + 1 : end;
  const rowW = Math.max(1, width - 2); // paddingX 1*2
  const contentW = Math.max(1, rowW - 2); // 内容盒 = 行宽 - 标记列2

  // 截断徽章：跟在末行文字后面。行尾没位置时终端会把它折到第 0 列（溢出 bug），
  // 所以截断时必须把末行缩短到 内容宽 - 徽章宽 - 缩进2，保证永远塞得下
  const ELLIPSIS_BADGE = ' 🔽 ……… ';
  const badgeW = [...ELLIPSIS_BADGE].reduce((w, ch) => w + ((ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1), 0);
  const fitWidth = (s: string, budget: number): string => {
    let w = 0;
    const out: string[] = [];
    for (const ch of s) {
      const cw = (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
      if (w + cw > budget) break;
      out.push(ch);
      w += cw;
    }
    return out.join('');
  };

  // 取块的前 n 行（n 含徽章占的行）；截断时末行缩短给徽章让位。
  // text 和 tool 末行都要让——tool 行（长命令/结果）不让位时徽章会被挤出面板右缘
  const headLines = (b: Block, n: number): { body: BlockLine[]; truncated: boolean; badgeOwnLine: boolean } => {
    if (b.lines.length <= n) return { body: b.lines.slice(), truncated: false, badgeOwnLine: false };
    const body = b.lines.slice(0, Math.max(0, n - 1));
    let lastLn = body[body.length - 1];
    // 截断点落在表格里：边框行拦腰切断 + 徽章拼在残框上没法看。
    // 找回这张表的顶边框 ┌，把末行换成等宽底边框 └─┴─┘ 让网格闭合，徽章单独占一行。
    if (lastLn?.kind === 'text' && lastLn.table) {
      let topIdx = body.length - 1;
      while (topIdx >= 0) {
        const ln = body[topIdx];
        if (ln.kind === 'text' && ln.table && ln.text.startsWith('┌')) break;
        topIdx--;
      }
      if (topIdx >= 0 && topIdx < body.length - 1) {
        const top = (body[topIdx] as { text: string }).text;
        const bottom = top.replaceAll('┌', '└').replaceAll('┬', '┴').replaceAll('┐', '┘');
        body[body.length - 1] = { kind: 'text', text: bottom, table: true };
        return { body, truncated: true, badgeOwnLine: true };
      }
      // 退化：表格连表头都露不出来 → 整段表格撤下，徽章跟在前面内容后
      body.splice(topIdx >= 0 ? topIdx : body.length - 1);
      lastLn = body[body.length - 1];
      if (!lastLn) return { body, truncated: true, badgeOwnLine: true }; // 块里只有表格：徽章独占一行
    }
    if (lastLn && (lastLn.kind === 'text' || lastLn.kind === 'tool')) {
      const budget = Math.max(0, contentW - badgeW - 2); // -2 = 行首缩进
      const shrunk = fitWidth(lastLn.text, budget);
      body[body.length - 1] =
        lastLn.kind === 'text'
          ? { kind: 'text', text: shrunk, table: lastLn.table }
          : { kind: 'tool', text: shrunk, error: lastLn.error, result: lastLn.result };
    }
    return { body, truncated: true, badgeOwnLine: false };
  };

  const renderBlock = (b: Block, realIdx: number, hl: { body: BlockLine[]; truncated: boolean; badgeOwnLine: boolean }) => {
    const active = realIdx === selected;
    const isUser = b.role === 'user';
    const { body, truncated, badgeOwnLine } = hl;
    return (
      <Box key={realIdx} flexDirection="row" width={rowW}>
        <Text bold color={active ? '#79C0FF' : '#6E7681'}>
          {active ? '❯ ' : '  '}
        </Text>
        <Box flexGrow={1} flexDirection="column" backgroundColor={active ? '#1F2937' : undefined}>
          {/* 块头一行：左 头像+名字+模型；右 对话时间右对齐。
              时间放固定 11 格、禁止收缩的盒子：窄面板时挤压力全给左侧截断，
              否则时间 Text 会被压窄折成两行碎片（"10-29 "/"09:14" 分家）。
              面板实在太窄（<20）时宁可不显示时间，也不让它折行 */}
          <Box flexDirection="row">
            <Text bold color={isUser ? '#79C0FF' : '#A371F7'} wrap="truncate">
              <Text backgroundColor={isUser ? '#1F6FEB' : '#451256'}>{` ${isUser ? '😏' : '👾'} `}</Text>
              {` ${b.label}`}
            </Text>
            <Box flexGrow={1} />
            {b.time && contentW >= 20 && (
              <Box width={11} flexShrink={0}>
                <Text color={isUser ? '#79C0FF' : '#A371F7'}>{b.time}</Text>
              </Box>
            )}
          </Box>
          <Text>
            {body.flatMap((ln, i) => [
              i > 0 ? '\n' : '',
              ln.kind === 'chip' ? (
                <Text key={i} backgroundColor="#21262D" color="#E3B341">{` 📋 ${ln.preview}… `}</Text>
              ) : ln.kind === 'tool' ? (
                /* 工具行不用 dimColor：暗灰在深色背景上几乎看不见。
                   调用黄、结果灰、错误红；diff 行红删绿加、上下文灰 */
                <Text key={i} color={
                  ln.error || ln.tone === 'del' ? '#FF7B72'
                  : ln.tone === 'add' ? '#3FB950'
                  : ln.result || ln.tone === 'ctx' ? '#8B949E'
                  : '#E3B341'
                }>{`  ${ln.text}`}</Text>
              ) : (
                <Text key={i} bold={ln.kind === 'text' ? ln.bold : undefined} color={isUser ? '#F0A6C9' : '#C9D1D9'}>
                  {'  '}{boldSegs(ln.text)}
                </Text>
              )
            ])}
            {/* 截断徽章：普通截断跟在缩短后的末行后面；表格闭合截断时单独占一行（不拼在边框上） */}
            {truncated && badgeOwnLine ? '\n' : ''}
            {truncated && <Text backgroundColor="#3A3D42" color="#A371F7">{ELLIPSIS_BADGE}</Text>}
            {'\n'}
          </Text>
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      {firstRendered > 0 && <Text color="#8B949E">{`↑ ${firstRendered}`}</Text>}
      {peekTop > 0 && (
        <Box flexDirection="row" width={rowW}>
          <Text color="#6E7681">{'  '}</Text>
          <Box flexGrow={1}>
            <Text color="#8B949E">{`${blocks[start - 1].lines
              .slice(-peekTop)
              .map(ln => (ln.kind === 'chip' ? `📋 ${ln.preview}…` : ln.text.replace(/\*\*(.+?)\*\*/g, '$1')))
              .join('\n')}\n`}</Text>
          </Box>
        </Box>
      )}
      {blocks.slice(start, end + 1).map((b, i) => renderBlock(b, start + i, headLines(b, show[start + i])))}
      {peekBottom > 0 && renderBlock(blocks[end + 1], end + 1, headLines(blocks[end + 1], peekBottom))}
      {lastRendered < blocks.length - 1 && (
        <Text color="#8B949E">{`↓ ${blocks.length - 1 - lastRendered}`}</Text>
      )}
    </Box>
  );
}

/**
 * SessionCards — 中栏会话卡片列（固定行高 4：上框/内容2行/下框，卡间无空行——
 * 完整卡片感与信息密度的折中：一屏约 6-7 张）
 *
 * 不复用 ScrollableList（它假设一项一行）；窗口切换逻辑内联在下方 windowFor，
 * 指示行（↑ N / ↓ N）占用通过 reserve 循环从预算里预扣，保证总高永不超父盒。
 *
 * 卡片：round 边框，选中 = 边框紫 #A371F7 + 浅灰底 #2A2A3E + 左 🎃 标记（2 列）；
 * 未选中 = 暗灰框无底、竖条位置空格占位。
 * 行1：运行中绿● + 标题（(空会话) 灰，搜索模式前缀 [项目名]）；
 * 行2：彩色统计（问绿/答黄/大小橙）+ 右侧红色最后活跃时间（只显示一个时间）。
 */
const CARD_H = 4;

function SessionCards({
  sessions,
  selectedIndex,
  inSearch,
  avail,
  width,
  isRunning
}: {
  sessions: SessionMeta[];
  selectedIndex: number;
  inSearch: boolean;
  avail: number;
  width: number;
  isRunning: (s: SessionMeta) => boolean;
}) {
  // 指示行（↑ N / ↓ N）自身也占行高：先按满预算切窗口，实际要画几条指示就从
  // 预算里扣几行重切（最多 2 条，收敛有保证——同 BlockWindow 的 reserve 循环）。
  // 不预留会让内容总高超过父盒 1~2 行：yoga 默认 flexShrink=1 会把超出量按比例
  // 摊给所有卡片（每张卡 4 行被压成 3.x 行再各自取整）→ 边框行与内容行重叠，
  // 下边框横线插进统计行（正是"时间压框线/卡片塌陷"乱版的根因）。
  const windowFor = (rows: number) => {
    const listVisible = Math.max(1, rows);
    const maxScroll = Math.max(0, sessions.length - listVisible);
    const scrollOffset = Math.max(0, Math.min(selectedIndex - Math.floor(listVisible / 2), maxScroll));
    return {
      scrollOffset,
      visibleList: sessions.slice(scrollOffset, scrollOffset + listVisible),
      hasMoreAbove: scrollOffset > 0,
      hasMoreBelow: scrollOffset + listVisible < sessions.length,
      aboveCount: scrollOffset,
      belowCount: sessions.length - scrollOffset - listVisible
    };
  };
  let win = windowFor(Math.floor(avail / CARD_H));
  for (let reserve = 0; reserve <= 2; reserve++) {
    win = windowFor(Math.floor((avail - reserve) / CARD_H));
    const indicators = (win.hasMoreAbove ? 1 : 0) + (win.hasMoreBelow ? 1 : 0);
    if (indicators <= reserve) break;
  }
  const { visibleList, hasMoreAbove, hasMoreBelow, aboveCount, belowCount, scrollOffset } = win;

  const innerW = Math.max(10, width);        // 卡片盒宽（= 栏内容宽）
  const textW = Math.max(8, innerW - 4);     // 卡内行区 = 内宽 - 左右边框2 - ▌▌竖条2

  return (
    <Box flexDirection="column" width={width}>
      {hasMoreAbove && <Text color="#8B949E">{`↑ ${aboveCount}`}</Text>}
      {visibleList.map((s, i) => {
        const realIdx = scrollOffset + i;
        const active = realIdx === selectedIndex;
        const empty = s.title === '(空会话)' || s.title === '(空消息)';
        return (
          <Box
            key={realIdx}
            width={innerW}
            flexShrink={0}
            borderStyle="round"
            borderColor={active ? '#A371F7' : '#3A3D42'}
            backgroundColor={active ? '#2A2A3E' : undefined}
          >
            {/* 左竖条 2 列：选中 = 🎃（emoji 宽 2 列，与未选中的双空格等宽），未选中 = 空格占位。*/}
            <Box width={2} flexShrink={0}>
              {active ? <Text>🎃</Text> : <Text>{'  '}</Text>}
            </Box>
            <Box flexDirection="column" width={textW}>
              {/* 行1：运行● + 标题（时间只保留行2一个，避免同日重复/跨天截断的双时间乱象） */}
              <Box flexDirection="row">
                <Box width={2} flexShrink={0}>
                  {isRunning(s) ? <Text color="#3FB950">●</Text> : <Text>{'  '}</Text>}
                </Box>
                <Box flexGrow={1}>
                  <Text bold={active} color={empty ? '#8B949E' : '#E6EDF3'} wrap="truncate">
                    {inSearch ? `[${s.cwd ? path.basename(s.cwd) : '?'}] ` : ''}
                    {s.title}
                  </Text>
                </Box>
              </Box>
              {/* 行2：彩色统计（绿问/黄答/橙大小，照原右栏统计行分工）+ 右侧紫时间范围 */}
              <Box flexDirection="row">
                <Box width={2} flexShrink={0}>
                  <Text>{'  '}</Text>
                </Box>
                <Box flexGrow={1}>
                  <Text wrap="truncate">
                    <Text color="#3FB950">{`${s.userCount} 问`}</Text>
                    <Text color="#8B949E">{' · '}</Text>
                    <Text color="#E3B341">{`${s.assistantCount} 答`}</Text>
                    <Text color="#8B949E">{' · '}</Text>
                    <Text color="#F0883E">{fmtSize(s.sizeBytes)}</Text>
                  </Text>
                </Box>
                <Box flexShrink={1}>
                  <Text color="#F85149" wrap="truncate">{fmtDate(s.lastTime)}</Text>
                </Box>
                {/* 右端 1 列呼吸垫：时间不贴右边框，避免"压线"观感 */}
                <Box width={1} flexShrink={0}>
                  <Text>{' '}</Text>
                </Box>
              </Box>
            </Box>
          </Box>
        );
      })}
      {hasMoreBelow && <Text color="#8B949E">{`↓ ${belowCount}`}</Text>}
    </Box>
  );
}
