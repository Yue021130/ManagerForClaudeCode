/**
 * HISTORY 页数据类型 — 数据层（scan.ts）与 UI 层（HISTORYPage.tsx）之间的契约
 */

/** 一次会话 = 一个 <sessionId>.jsonl 文件的元信息 */
export interface SessionMeta {
  sessionId: string;        // = 文件名（uuid）
  filePath: string;         // jsonl 完整路径
  cwd: string | null;       // 真实项目路径（取自行内 cwd 字段，目录名编码不可逆，不反推）
  title: string;            // 首个真实用户提问（截断 40 字），无则 '(空会话)'
  firstTime: string | null; // 首条事件时间（ISO）
  lastTime: string | null;  // 末条事件时间（ISO）
  userCount: number;        // 真实 user 行数（已排除 meta/命令）
  assistantCount: number;   // assistant 行数
  sizeBytes: number;        // 文件体积
}

/** 一个项目目录（~/.claude/projects/<dirName>/） */
export interface ProjectInfo {
  dirName: string;          // 编码后的目录名
  cwd: string | null;       // 展示用真实路径（取首个会话的 cwd）
  sessions: SessionMeta[];  // 按 lastTime 倒序
}

/** 预览用的一条对话（工具调用折叠为一行） */
export interface ChatEntry {
  role: 'user' | 'assistant' | 'tool';
  text: string;
  timestamp: string | null;
  toolName?: string;        // role==='tool' 时存在
  model?: string;           // role==='assistant' 时存在：该行 requestedModel
}
