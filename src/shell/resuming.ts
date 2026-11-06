/**
 * resuming — 「当前终端恢复会话」的过渡画面（YUE loader 风格，零依赖纯 ANSI）
 *
 * App 卸载后到 claude 画出自己的界面之间有 1~3 秒空窗（claude 启动慢），
 * 黑着屏像卡死。这段过场盖住空窗：
 *
 *   藏光标 → 循环帧：YUE 粗体字符画 + ⠋ 转圈「正在恢复会话」+ 闪烁光标 ▌
 *            + 灰色会话标题 + 底部随机冷笑话（每 28 帧换一条）
 *   → 固定时长播完 → 还光标 + 清屏交给 claude
 *
 * 不定键盘、不等事件（此时 Ink 已卸载、claude 未启动，无人抢终端）；
 * 帧间原位重画（光标移回帧首覆写 + \x1b[K 清行尾），只在开头清一次屏——
 * 循环里用 \x1b[2J 在 Windows Terminal 会把每帧推进回滚缓冲（帧排队堆屏）。
 */

const LOGO = `
Y   Y  U   U  EEEE
 Y Y   U   U  E
  Y    U   U  EEE
  Y    U   U  E
  Y     UUU   EEEE`.replace(/^\n/, '');

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const QUOTES = ['Mmm... 甜甜圈', "D'oh!", 'Mmm... 啤酒', '工作是人类的本質？我选睡觉'];

const FRAME_MS = 90;
const DURATION_MS = 2600; // ≈ 一次 quote 轮换周期，盖过 claude 启动空窗

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const pickQuote = () => QUOTES[Math.floor(Math.random() * QUOTES.length)];

export async function playResuming({
  stdout = process.stdout,
  title = ''
}: {
  stdout?: typeof process.stdout;
  title?: string;
} = {}): Promise<void> {
  if (!stdout.isTTY) return;

  const subtitle = title ? `「${title.length > 24 ? `${title.slice(0, 24)}…` : title}」` : '';
  let quote = pickQuote();
  let t = 0;

  // 每帧固定 9 行：LOGO 5 行 + 空行 + 状态行 + 标题行 + 冷笑话行
  const frameLines = (spin: string): string[] => [
    ...LOGO.split('\n').map(l => `\x1b[1m${l}\x1b[0m`),
    '',
    `  ${spin} 正在恢复会话\x1b[5m▌\x1b[0m`,      // \x1b[5m = 闪烁
    `  \x1b[38;5;245m${subtitle}\x1b[0m`,
    `  \x1b[3;38;5;245m"${quote}"\x1b[0m`          // \x1b[3m = 斜体
  ];

  stdout.write('\x1b[?25l'); // 藏光标
  stdout.write('\x1b[2J\x1b[3J\x1b[H'); // 起始清屏一次（仅这一次）
  let lastLines = 0;
  try {
    const start = Date.now();
    while (Date.now() - start < DURATION_MS) {
      if (t % 28 === 0) quote = pickQuote();
      const lines = frameLines(SPIN[t % 10]);
      // 原位重画：光标移回帧首再逐行覆写。
      // 千万别在循环里 \x1b[2J——Windows Terminal 的 2J 是把整屏推进回滚缓冲，
      // 每帧清一次 = 每帧都被 dump 进滚动历史（帧排队堆屏的 bug 就是这么来的）
      if (lastLines > 0) stdout.write(`\x1b[${lastLines - 1}A\r`);
      stdout.write(lines.map(l => l + '\x1b[K').join('\n')); // \x1b[K 清行尾残字（quote 变短时）
      lastLines = lines.length;
      t++;
      await sleep(FRAME_MS);
    }
  } finally {
    // 还光标；清掉帧内容同样用「回帧首 + \x1b[J 擦下方」，不用 2J（同上，防回滚堆屏）
    stdout.write(`\x1b[?25h\x1b[${Math.max(0, lastLines - 1)}A\r\x1b[J`);
  }
}
