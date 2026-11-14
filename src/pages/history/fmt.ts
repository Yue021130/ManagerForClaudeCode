/**
 * fmt.ts — HISTORY 页共享展示格式化（HISTORYPage 三栏 / LandingView 看板共用）
 *
 * 注意：jsonl 时间戳是 UTC ISO 串，必须转本地时区再切分，直接 slice 会差 8 小时（UTC+8）
 */

import os from 'node:os';

/** 会话时间 → 'MM-DD HH:mm' */
export const fmtDate = (iso: string | null): string => {
  if (!iso) return '--     --:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--     --:--';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 相对时间（落地页 QA 卡用）：今天 'HH:mm' / 昨天·前天 'HH:mm' / 30 天内 'N 天前' /
 *  更早同年 'MM-DD'、跨年 'YY-MM-DD'。按本地日期零点对齐算天数差 */
export const fmtRel = (iso: string | null, now: number = Date.now()): string => {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  const p = (n: number) => String(n).padStart(2, '0');
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const startOf = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const days = Math.floor((startOf(new Date(now)) - startOf(d)) / 86400000);
  if (days <= 0) return hm; // 今天（含未来时间，按今天算）
  if (days === 1) return `昨天 ${hm}`;
  if (days === 2) return `前天 ${hm}`;
  if (days < 30) return `${days} 天前`;
  return d.getFullYear() === new Date(now).getFullYear()
    ? `${p(d.getMonth() + 1)}-${p(d.getDate())}`
    : `${String(d.getFullYear()).slice(2)}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 本地日期键 'YYYY-MM-DD'：字典序即可比较前后（范围统计的日桶键） */
export const dayKey = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 字节数 → '1.2M' / '340K' / '512B' */
export const fmtSize = (b: number): string =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)}M` : b >= 1024 ? `${Math.round(b / 1024)}K` : `${b}B`;

/** 大计数 → '3.4M' / '12.5K' / '999'（token 量用，十进制 k/M） */
export const fmtCount = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

/** 显示宽度（CJK/全角 2 列，其余 1 列；… 是歧义宽字符，string-width 与终端都按 1 列） */
export const strW = (s: string): number => {
  let n = 0;
  for (const c of s) n += c === '…' ? 1 : (c.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
  return n;
};

/** 展示路径：home 前缀缩成 ~，省横向空间 */
export const shortPath = (p: string): string => {
  const home = os.homedir();
  return p.toLowerCase().startsWith(home.toLowerCase()) ? '~' + p.slice(home.length) : p;
};

/** 路径放不下时中段省略：~\Desktop\…\ManagerForClaudeCode —— 优先保住尾部项目名，
 *  比 wrap="truncate" 直接砍尾巴有用（砍尾巴恰恰把最重要的项目名砍没了） */
export const fitPath = (p: string, maxW: number): string => {
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
