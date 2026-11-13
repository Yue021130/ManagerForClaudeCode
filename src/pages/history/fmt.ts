/**
 * fmt.ts — HISTORY 页共享展示格式化（HISTORYPage 三栏 / LandingView 看板共用）
 *
 * 注意：jsonl 时间戳是 UTC ISO 串，必须转本地时区再切分，直接 slice 会差 8 小时（UTC+8）
 */

/** 会话时间 → 'MM-DD HH:mm' */
export const fmtDate = (iso: string | null): string => {
  if (!iso) return '--     --:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--     --:--';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 字节数 → '1.2M' / '340K' / '512B' */
export const fmtSize = (b: number): string =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)}M` : b >= 1024 ? `${Math.round(b / 1024)}K` : `${b}B`;

/** 显示宽度（CJK/全角 2 列，其余 1 列；… 是歧义宽字符，string-width 与终端都按 1 列） */
export const strW = (s: string): number => {
  let n = 0;
  for (const c of s) n += c === '…' ? 1 : (c.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
  return n;
};
