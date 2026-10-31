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
 * 性能：全量 21MB 实测 <100ms；metaCache/convCache 按 mtime 失效，
 * 删除/归档/外部改动后不会拿到脏数据。
 */

const TITLE_MAX = 40;

export function claudeProjectsRoot(): string | null {
  const root = path.join(os.homedir(), '.claude', 'projects');
  return fs.existsSync(root) ? root : null;
}

/** 删除/归档的目标根目录（可恢复，不真删） */
export function backupRoot(kind: 'trash' | 'archive'): string {
  return path.join(os.homedir(), '.claude', 'backups', kind === 'trash' ? 'mfcc-trash' : 'mfcc-archive');
}

// ── mtime 缓存 ──
const metaCache = new Map<string, { mtimeMs: number; meta: SessionMeta }>();
const convCache = new Map<string, { mtimeMs: number; entries: ChatEntry[] }>();

export function invalidateSession(filePath: string): void {
  metaCache.delete(filePath);
  convCache.delete(filePath);
}

// ── jsonl 行解析 ──
interface RawLine {
  type?: string;
  timestamp?: string;
  cwd?: string;
  isMeta?: boolean;
  requestedModel?: string;
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

/** 扫描单个会话文件 → 元信息（标题/时间/计数/体积） */
export function scanSession(filePath: string): SessionMeta {
  const st = fs.statSync(filePath);
  const cached = metaCache.get(filePath);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.meta;

  const meta: SessionMeta = {
    sessionId: path.basename(filePath, '.jsonl'),
    filePath,
    cwd: null,
    title: '(空会话)',
    firstTime: null,
    lastTime: null,
    userCount: 0,
    assistantCount: 0,
    sizeBytes: st.size
  };

  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    if (!line) continue;
    const o = parseLine(line);
    if (!o) continue;

    if (!meta.cwd && typeof o.cwd === 'string') meta.cwd = o.cwd;
    if (isRealUserText(o)) {
      meta.userCount++;
      if (meta.title === '(空会话)') {
        // 剥掉 <pasted_content> 标签，标题只留可读内容
        meta.title = o.message.content
          .replace(/<\/?pasted_content[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, TITLE_MAX) || '(空消息)';
      }
    } else if (o.type === 'assistant') {
      meta.assistantCount++;
    }
    if (o.timestamp) {
      if (!meta.firstTime || o.timestamp < meta.firstTime) meta.firstTime = o.timestamp;
      if (!meta.lastTime || o.timestamp > meta.lastTime) meta.lastTime = o.timestamp;
    }
  }

  metaCache.set(filePath, { mtimeMs: st.mtimeMs, meta });
  return meta;
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

/** 完整解析一个会话 → 对话流（工具调用折叠为单行 entry） */
export function readConversation(filePath: string): ChatEntry[] {
  const st = fs.statSync(filePath);
  const cached = convCache.get(filePath);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.entries;

  const entries: ChatEntry[] = [];
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    if (!line) continue;
    const o = parseLine(line);
    if (!o) continue;
    const ts = o.timestamp ?? null;

    if (isRealUserText(o)) {
      entries.push({ role: 'user', text: o.message.content, timestamp: ts });
    } else if (o.type === 'assistant' && Array.isArray(o.message?.content)) {
      const texts: string[] = [];
      for (const raw of o.message.content as { type?: string; text?: string; name?: string }[]) {
        if (raw.type === 'text' && typeof raw.text === 'string') {
          texts.push(raw.text);
        } else if (raw.type === 'tool_use') {
          entries.push({ role: 'tool', text: '', timestamp: ts, toolName: raw.name ?? 'tool' });
        }
      }
      if (texts.length) {
        entries.push({
          role: 'assistant',
          text: texts.join('\n'),
          timestamp: ts,
          model: typeof o.requestedModel === 'string' ? o.requestedModel : undefined
        });
      }
    }
  }

  convCache.set(filePath, { mtimeMs: st.mtimeMs, entries });
  return entries;
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
      lines.push(`> ⚒ ${e.toolName}`, '');
    } else {
      lines.push(`## ${e.role === 'user' ? '🧑 用户' : '🤖 Assistant'}`, '', e.text, '');
    }
  }

  fs.writeFileSync(path.join(outDir, fileName), lines.join('\n'), 'utf8');
  return fileName;
}
