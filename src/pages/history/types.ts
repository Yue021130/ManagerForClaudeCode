/**
 * HISTORY 页数据类型 — 数据层（scan.ts）与 UI 层（HISTORYPage.tsx）之间的契约
 */

/** 单日用量桶：范围统计的最小粒度（按行时间戳的本地日期归集，QA 级） */
export interface DayStat {
  input: number;      // 当日 input_tokens 累计（每轮全量上下文，含重复发送）
  output: number;     // 当日 output_tokens 累计
  user: number;       // 当日真实提问数
  assistant: number;  // 当日 assistant 行数
  bytes: number;      // 当日写入的 jsonl 字节（按行长度近似）
}

/** 一次会话 = 一个 <sessionId>.jsonl 文件的元信息 */
export interface SessionMeta {
  sessionId: string;        // = 文件名（uuid）
  filePath: string;         // jsonl 完整路径
  cwd: string | null;       // 真实项目路径（取自行内 cwd 字段，目录名编码不可逆，不反推）
  title: string;            // 首个真实用户提问（截断 40 字），无则 '(空会话)'
  preview: string;          // 首条真实用户消息快照（同标题清洗规则，截断 80 字），无则 ''
  firstTime: string | null; // 首条事件时间（ISO）
  lastTime: string | null;  // 末条事件时间（ISO）
  userCount: number;        // 真实 user 行数（已排除 meta/命令）
  assistantCount: number;   // assistant 行数
  inputTokens: number;      // assistant 行 usage.input_tokens 累计（每轮全量上下文，含重复发送）
  outputTokens: number;     // assistant 行 usage.output_tokens 累计（模型实际生成量）
  days: Record<string, DayStat>; // 'YYYY-MM-DD'（本地）→ 当日桶；范围统计按它逐日过滤
  sizeBytes: number;        // 文件体积
  mtimeMs: number;          // 文件最后写入时间（epoch ms），判断「运行中/最近活跃」用
}

/** 一个项目目录（~/.claude/projects/<dirName>/） */
export interface ProjectInfo {
  dirName: string;          // 编码后的目录名
  cwd: string | null;       // 展示用真实路径（取首个会话的 cwd）
  sessions: SessionMeta[];  // 按 lastTime 倒序
}

/** 预览用的一条对话（工具调用/结果折叠为一行；结果挂到对应调用上） */
export interface ChatEntry {
  role: 'user' | 'assistant' | 'tool';
  text: string;
  timestamp: string | null;
  toolName?: string;        // role==='tool' 时存在：工具名；孤立结果（无对应调用）为 'result'
  isError?: boolean;        // 孤立结果条目：调用是否出错
  result?: string;          // role==='tool' 时存在：该调用的返回摘要（多行结构保留）
  resultError?: boolean;    // result 对应的调用是否出错
  oldText?: string;         // Edit/Update 调用的 old_string（≤4000 字，用于红绿 diff）
  newText?: string;         // Edit/Update 调用的 new_string
  model?: string;           // role==='assistant' 时存在：该行 requestedModel
}
