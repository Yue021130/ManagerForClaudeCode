import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChatEntry, ProjectInfo, SessionMeta } from './types.js';

/**
 * scan.ts — HISTORY 页纯数据层（无 React 依赖，可直接 node 单测）
 *
 * 数据源：~/.claude/projects/<编码目录>/<sessionId>.jsonl
 * 每行一个 JSON 事件；只认 user（真实提问）/ assistant（text 块 + tool_use 块），
 * 其余 15+ 种运行状态行（system/attachment/cost-state/api-request*…）全部丢弃。
 *
 * 性能：meta/对话双层缓存 + 增量续读——jsonl 只追加（重命名/移动会显式 invalidateSession），
 * mtime 变化时只解析新增字节，运行中大会话的 3s 轮询不再全量重读；
 * readConversationAsync 冷启动全量解析分片让出主线程，UI 不冻结。
 */

const TITLE_MAX = 40;
const PREVIEW_MAX = 80; // 首条提问快照（落地页卡片预览行）截断长度

export function claudeProjectsRoot(): string | null {
  const root = path.join(os.homedir(), '.claude', 'projects');
  return fs.existsSync(root) ? root : null;
}

/** 删除/归档的目标根目录（可恢复，不真删） */
export function backupRoot(kind: 'trash' | 'archive'): string {
  return path.join(os.homedir(), '.claude', 'backups', kind === 'trash' ? 'mfcc-trash' : 'mfcc-archive');
}

// ── 增量解析缓存 ──
// jsonl 只追加：缓存记住已解析到的字节偏移（永远停在 '\n' 之后——换行是 ASCII，
// 不会劈开多字节 UTF-8 字符；末尾没写完的半行不解析，等下次增量补上）。
// mtime 变了只读新增字节；文件变小（截断/重写）则整份重来。
// 重命名（改写 ai-title 行）和移动都会走 invalidateSession 显式清缓存。
interface MetaAcc {
  mtimeMs: number;
  readBytes: number;
  cwd: string | null;
  title: string;
  preview: string; // 首条真实用户消息快照（落地页卡片用），同标题清洗规则、截断 80 字
  firstTime: string | null;
  lastTime: string | null;
  userCount: number;
  assistantCount: number;
}
interface ConvAcc {
  mtimeMs: number;
  readBytes: number;
  entries: ChatEntry[];
  pendingTools: ChatEntry[]; // 等结果的 tool_use（跨增量边界保持配对）
}
const metaCache = new Map<string, MetaAcc>();
const convCache = new Map<string, ConvAcc>();

const freshMetaAcc = (): MetaAcc => ({
  mtimeMs: 0, readBytes: 0, cwd: null, title: '(空会话)', preview: '',
  firstTime: null, lastTime: null, userCount: 0, assistantCount: 0
});
const freshConvAcc = (): ConvAcc => ({ mtimeMs: 0, readBytes: 0, entries: [], pendingTools: [] });

export function invalidateSession(filePath: string): void {
  metaCache.delete(filePath);
  convCache.delete(filePath);
}

/** 读 [fromBytes, size) 的新增字节里「完整行」的部分（截至最后一个 \n），返回 null 表示没有完整行 */
function readCompleteLines(filePath: string, fromBytes: number, size: number): { text: string; bytes: number } | null {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(size - fromBytes);
    fs.readSync(fd, buf, 0, buf.length, fromBytes);
    const lastNl = buf.lastIndexOf(0x0a);
    if (lastNl === -1) return null;
    return { text: buf.subarray(0, lastNl + 1).toString('utf8'), bytes: lastNl + 1 };
  } finally {
    fs.closeSync(fd);
  }
}

// ── jsonl 行解析 ──
interface RawLine {
  type?: string;
  timestamp?: string;
  cwd?: string;
  isMeta?: boolean;
  requestedModel?: string;
  aiTitle?: string;         // type==='ai-title'：Claude Code 生成的会话标题
  message?: { content?: unknown };
}

function parseLine(line: string): RawLine | null {
  try {
    return JSON.parse(line) as RawLine;
  } catch {
    return null;
  }
}

/** 真实用户提问：user 行、非 meta、content 是字符串、不是 <command-name> 等内部指令 */
function isRealUserText(o: RawLine): o is RawLine & { message: { content: string } } {
  return (
    o.type === 'user' &&
    !o.isMeta &&
    typeof o.message?.content === 'string' &&
    !o.message.content.startsWith('<')
  );
}

/** 工具调用单行摘要：优先命令/脚本，其次文件路径/描述等。
 *  上限放宽到 1000 字：长脚本（多语句 PowerShell 等）预览/详情都要能看全，
 *  预览窗口每块最多露 MAX_BLOCK_LINES 行，不会撑爆布局 */
function toolBrief(name: string | undefined, input: unknown): string {
  const inp = (input ?? {}) as Record<string, unknown>;
  for (const k of ['command', 'script', 'file_path', 'description', 'prompt', 'pattern', 'url']) {
    const v = inp[k];
    if (typeof v === 'string' && v.trim()) {
      return v.replace(/\s+/g, ' ').trim().slice(0, 1000);
    }
  }
  return '(无参数)';
}

/** 工具结果摘要：保留多行结构（对齐原版 └ 展示），最多 200 行、每行 200 字。
 *  上限只约束详情渲染量与折行成本：预览块每块最多露 MAX_BLOCK_LINES 行（窗口预算另有约束），
 *  详情可滚动看全；超 200 行的极端输出（构建日志等）末尾标注剩余行数 */
const RESULT_MAX_LINES = 200;
const RESULT_LINE_MAX = 200;

function resultBrief(content: unknown, isError: boolean | undefined): { text: string; isError?: boolean } {
  let s = '';
  if (typeof content === 'string') {
    s = content;
  } else if (Array.isArray(content)) {
    s = content
      .map(x =>
        typeof x === 'object' && x !== null && 'text' in x
          ? String((x as { text?: unknown }).text ?? '')
          : String(x ?? '')
      )
      .join('\n');
  }
  const lines = s
    .split('\n')
    .map(l => l.trim().slice(0, RESULT_LINE_MAX))
    .filter(l => l)
    .slice(0, RESULT_MAX_LINES);
  const more = s.split('\n').filter(l => l.trim()).length - lines.length;
  return {
    text: (lines.join('\n') + (more > 0 ? `\n… 还有 ${more} 行` : '')) || '(空)',
    isError: !!isError
  };
}

/** meta 单行累计：标题（ai-title 优先，其次首条用户消息）/ cwd / 计数 / 时间范围 */
function metaLine(acc: MetaAcc, o: RawLine): void {
  if (!acc.cwd && typeof o.cwd === 'string') acc.cwd = o.cwd;
  // Claude Code 生成的真标题（ai-title 行），优先于首条用户消息截断
  if (o.type === 'ai-title' && typeof o.aiTitle === 'string' && o.aiTitle.trim()) {
    acc.title = o.aiTitle.trim().slice(0, TITLE_MAX);
  }
  if (isRealUserText(o)) {
    acc.userCount++;
    // 剥掉 <pasted_content> 标签，标题/快照只留可读内容
    const clean = o.message.content
      .replace(/<\/?pasted_content[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!acc.preview) acc.preview = clean.slice(0, PREVIEW_MAX); // 首条提问快照（落地页卡片用）
    if (acc.title === '(空会话)') {
      acc.title = clean.slice(0, TITLE_MAX) || '(空消息)';
    }
  } else if (o.type === 'assistant') {
    acc.assistantCount++;
  }
  if (o.timestamp) {
    if (!acc.firstTime || o.timestamp < acc.firstTime) acc.firstTime = o.timestamp;
    if (!acc.lastTime || o.timestamp > acc.lastTime) acc.lastTime = o.timestamp;
  }
}

/** 扫描单个会话文件 → 元信息（标题/时间/计数/体积）；增量：只解析新增字节 */
export function scanSession(filePath: string): SessionMeta {
  const st = fs.statSync(filePath);
  let acc = metaCache.get(filePath);
  if (!acc || st.size < acc.readBytes) acc = freshMetaAcc(); // 无缓存 / 文件被截断重写：全量
  if (acc.mtimeMs !== st.mtimeMs && st.size > acc.readBytes) {
    const chunk = readCompleteLines(filePath, acc.readBytes, st.size);
    if (chunk) {
      for (const line of chunk.text.split('\n')) {
        if (!line) continue;
        const o = parseLine(line);
        if (o) metaLine(acc, o);
      }
      acc.readBytes += chunk.bytes;
    }
    acc.mtimeMs = st.mtimeMs;
  }
  metaCache.set(filePath, acc);

  const meta: SessionMeta = {
    sessionId: path.basename(filePath, '.jsonl'),
    filePath,
    cwd: acc.cwd,
    title: acc.title,
    preview: acc.preview,
    firstTime: acc.firstTime,
    lastTime: acc.lastTime,
    userCount: acc.userCount,
    assistantCount: acc.assistantCount,
    sizeBytes: st.size,
    mtimeMs: st.mtimeMs
  };
  // 用户重命名覆盖最后生效（即使之后又出现新的 ai-title 也不顶掉）
  const ovr = titleOverrides()[filePath];
  if (ovr) meta.title = ovr;
  return meta;
}

// ── 重命名覆盖（旁挂 JSON + 同步改写会话文件里的 ai-title 行，CC 列表同步生效） ──
const titlesFile = (): string => path.join(backupRoot('trash'), '..', 'mfcc-titles.json');
let titlesCache: { mtimeMs: number; map: Record<string, string> } | null = null;

function titleOverrides(): Record<string, string> {
  try {
    const st = fs.statSync(titlesFile());
    if (titlesCache && titlesCache.mtimeMs === st.mtimeMs) return titlesCache.map;
    const map = JSON.parse(fs.readFileSync(titlesFile(), 'utf8')) as Record<string, string>;
    titlesCache = { mtimeMs: st.mtimeMs, map };
    return map;
  } catch {
    return {};
  }
}

/** 把新标题写回会话 jsonl 的 ai-title 行（没有就追加；有多条全替换，兼容首/末两种读取方） */
function syncAiTitleIntoJsonl(filePath: string, title: string): void {
  const sessionId = path.basename(filePath, '.jsonl');
  const line = JSON.stringify({ type: 'ai-title', aiTitle: title, sessionId });
  const st = fs.statSync(filePath); // 记录原 mtime，写回后恢复（不重触发运行中锁定、不乱 CC 排序）
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  let replaced = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('"ai-title"')) {
      lines[i] = line;
      replaced = true;
    }
  }
  if (!replaced) {
    if (lines.length && lines[lines.length - 1] === '') lines[lines.length - 1] = line;
    else lines.push(line);
  }
  let out = lines.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  const tmp = filePath + '.mfcc-tmp';
  fs.writeFileSync(tmp, out, 'utf8');
  fs.renameSync(tmp, filePath);
  fs.utimesSync(filePath, st.atime, st.mtime);
}

/** 重命名会话标题：旁挂 JSON（我们永赢）+ 改写 jsonl 的 ai-title（CC 同步） */
export function renameSessionTitle(filePath: string, title: string): void {
  const map = { ...titleOverrides() };
  map[filePath] = title;
  const tmp = titlesFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2), 'utf8');
  fs.renameSync(tmp, titlesFile());
  titlesCache = null;
  syncAiTitleIntoJsonl(filePath, title);
  invalidateSession(filePath);
}

/** 扫描全部项目目录（空目录跳过；项目按最新会话倒序） */
export function scanAllProjects(): ProjectInfo[] {
  const root = claudeProjectsRoot();
  if (!root) return [];

  const projects: ProjectInfo[] = [];
  for (const dirName of fs.readdirSync(root)) {
    const dirPath = path.join(root, dirName);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const sessions: SessionMeta[] = [];
    for (const f of fs.readdirSync(dirPath)) {
      if (!f.endsWith('.jsonl')) continue;
      try {
        sessions.push(scanSession(path.join(dirPath, f)));
      } catch {
        // 单个文件读失败（占用/权限）不拖垮整个扫描
      }
    }
    if (!sessions.length) continue;

    sessions.sort((a, b) => (b.lastTime ?? '').localeCompare(a.lastTime ?? ''));
    projects.push({ dirName, cwd: sessions[0].cwd ?? null, sessions });
  }

  projects.sort((a, b) =>
    (b.sessions[0]?.lastTime ?? '').localeCompare(a.sessions[0]?.lastTime ?? '')
  );
  return projects;
}

/** 对话流单行累计：真实提问/工具结果挂回/AI 文本与 tool_use 保序落 entry */
function convLine(acc: ConvAcc, o: RawLine): void {
  const ts = o.timestamp ?? null;

  if (isRealUserText(o)) {
    acc.entries.push({ role: 'user', text: o.message.content, timestamp: ts });
  } else if (o.type === 'user' && !o.isMeta && Array.isArray(o.message?.content)) {
    // 工具结果挂在 user 行的 content 数组里（tool_use 的返回），按序挂回调用条目
    for (const raw of o.message.content as {
      type?: string;
      content?: unknown;
      is_error?: boolean;
    }[]) {
      if (raw.type !== 'tool_result') continue;
      const r = resultBrief(raw.content, raw.is_error);
      const call = acc.pendingTools.shift();
      if (call) {
        call.result = r.text;
        call.resultError = r.isError;
      } else {
        // 无对应调用（跨会话截断等）：落孤立结果条目
        acc.entries.push({ role: 'tool', text: r.text, timestamp: ts, toolName: 'result', isError: r.isError });
      }
    }
  } else if (o.type === 'assistant' && Array.isArray(o.message?.content)) {
    const model = typeof o.requestedModel === 'string' ? o.requestedModel : undefined;
    // 按 content 块顺序逐条落 entry：text 块与 tool_use 块可能交错，保序才符合时间线
    for (const raw of o.message.content as {
      type?: string;
      text?: string;
      name?: string;
      input?: unknown;
    }[]) {
      if (raw.type === 'text' && typeof raw.text === 'string' && raw.text.trim()) {
        acc.entries.push({ role: 'assistant', text: raw.text, timestamp: ts, model });
      } else if (raw.type === 'tool_use') {
        const ent: ChatEntry = {
          role: 'tool',
          text: toolBrief(raw.name, raw.input),
          timestamp: ts,
          toolName: raw.name ?? 'tool',
          model
        };
        // Edit/Update 带上 old/new：UI 层算红绿 diff（原版 TUI 的颜色对比就是这么来的）
        if ((raw.name === 'Edit' || raw.name === 'Update') && raw.input && typeof raw.input === 'object') {
          const inp = raw.input as Record<string, unknown>;
          const o = typeof inp.old_string === 'string' ? inp.old_string : null;
          const nw = typeof inp.new_string === 'string' ? inp.new_string : null;
          // 超限的编辑不做 diff：LCS 成本与渲染量失控，回退普通展示
          if (o !== null && nw !== null && o.length <= 4000 && nw.length <= 4000) {
            ent.oldText = o;
            ent.newText = nw;
          }
        }
        acc.entries.push(ent);
        acc.pendingTools.push(ent);
      }
    }
  }
}

/** 增量把 [acc.readBytes, size) 里的完整行解析进 acc（同步，增量字节通常很小） */
function convAppend(acc: ConvAcc, filePath: string, size: number): void {
  if (size <= acc.readBytes) return;
  const chunk = readCompleteLines(filePath, acc.readBytes, size);
  if (!chunk) return;
  for (const line of chunk.text.split('\n')) {
    if (!line) continue;
    const o = parseLine(line);
    if (o) convLine(acc, o);
  }
  acc.readBytes += chunk.bytes;
}

/** 完整解析一个会话 → 对话流（工具调用折叠为单行 entry）；增量：只解析新增字节 */
export function readConversation(filePath: string): ChatEntry[] {
  const st = fs.statSync(filePath);
  let acc = convCache.get(filePath);
  if (!acc || st.size < acc.readBytes) acc = freshConvAcc(); // 无缓存 / 文件被截断重写：全量
  if (acc.mtimeMs !== st.mtimeMs) {
    convAppend(acc, filePath, st.size);
    acc.mtimeMs = st.mtimeMs;
  }
  convCache.set(filePath, acc);
  return acc.entries;
}

/**
 * readConversation 的异步版：缓存命中/增量追加走同步快路；
 * 冷启动全量解析时异步读文件 + 每 400 行让出一次主线程，大会话不冻结 UI。
 * 调用方需自防竞态（序号令牌），本函数返回的可能是开始解析时的快照。
 */
export async function readConversationAsync(filePath: string): Promise<ChatEntry[]> {
  const st = await fs.promises.stat(filePath);
  const cached = convCache.get(filePath);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.entries;
  if (cached && st.size >= cached.readBytes) {
    convAppend(cached, filePath, st.size);
    cached.mtimeMs = st.mtimeMs;
    return cached.entries;
  }

  // 冷启动全量：异步读 + 分片解析
  const text = await fs.promises.readFile(filePath, 'utf8');
  const acc = freshConvAcc();
  const lastNl = text.lastIndexOf('\n');
  const completeLen = lastNl === -1 ? 0 : lastNl + 1;
  let pos = 0;
  let n = 0;
  while (pos < completeLen) {
    const e = text.indexOf('\n', pos);
    const line = e === -1 ? text.slice(pos) : text.slice(pos, e);
    pos = e === -1 ? completeLen : e + 1;
    if (!line) continue;
    const o = parseLine(line);
    if (o) convLine(acc, o);
    if (++n % 400 === 0) await new Promise<void>(r => setImmediate(r));
  }
  acc.readBytes = Buffer.byteLength(text.slice(0, completeLen), 'utf8');
  acc.mtimeMs = st.mtimeMs; // 读取期间文件又变了也不要紧：下次 mtime 对不上会增量补
  convCache.set(filePath, acc);
  return acc.entries;
}

/** 移动会话到备份目录（删除=trash / 归档=archive），返回目标路径 */
export function moveSession(filePath: string, kind: 'trash' | 'archive'): string {
  const destDir = backupRoot(kind);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(filePath));
  fs.renameSync(filePath, dest);
  invalidateSession(filePath);
  invalidateSession(dest);
  return dest;
}

/** 导出会话为 Markdown 到 <cwd>/exports/，返回文件名 */
export function exportMarkdown(meta: SessionMeta, entries: ChatEntry[]): string {
  const outDir = path.join(process.cwd(), 'exports');
  fs.mkdirSync(outDir, { recursive: true });

  const safeTitle = meta.title.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 30) || 'session';
  const fileName = `${meta.sessionId.slice(0, 8)}-${safeTitle}.md`;

  const lines: string[] = [
    `# ${meta.title}`,
    '',
    `> 会话 ${meta.sessionId} · ${meta.firstTime ?? ''} ~ ${meta.lastTime ?? ''}`,
    ''
  ];
  for (const e of entries) {
    if (e.role === 'tool') {
      lines.push(`> ⚒ ${e.toolName} ${e.text}`);
      if (e.result) lines.push(`> └ ${e.result}`);
      lines.push('');
    } else {
      lines.push(`## ${e.role === 'user' ? '🧑 用户' : '🤖 Assistant'}`, '', e.text, '');
    }
  }

  fs.writeFileSync(path.join(outDir, fileName), lines.join('\n'), 'utf8');
  return fileName;
}
