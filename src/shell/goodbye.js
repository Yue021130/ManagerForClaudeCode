import chalk from 'chalk';

/**
 * goodbye — 退出画面
 *
 * 进程退场不走 Ink（卸载后再渲染 React 是自找麻烦），
 * 这里用纯 ANSI 转义序列 + chalk 直接写 stdout：
 *
 *   完全清屏（含 scrollback）→ 字符画由暗到亮渐显 → 定格保留
 *
 * ── 可自定义区域 ─────────────────────────────────────
 * 想改退出画面，就改下面这两个常量，其他不用动。
 */

// MFCC 方块字符画（6 行，等宽显示）
export const GOODBYE_ART = [
  '███╗   ███╗███████╗ ██████╗ ██████╗',
  '████╗ ████║██╔════╝██╔════╝██╔════╝',
  '██╔████╔██║█████╗  ██║     ██║     ',
  '██║╚██╔╝██║██╔══╝  ██║     ██║     ',
  '██║ ╚═╝ ██║██║     ╚██████╗╚██████╗',
  '╚═╝     ╚═╝╚═╝      ╚═════╝ ╚═════╝'
];

// 自定义告别文案（显示在时长下面一行）
export const CUSTOM_TEXT = '你说把爱渐渐放下会走更远';

// ── 以下为实现，一般不用动 ─────────────────────────────

// 渐显亮度步进：深灰 → 中灰 → 浅灰 → 主题青
const FADE_STEPS = ['#3A3F4A', '#6B7280', '#9CA3AF', '#22D3EE'];
const STEP_DELAY = 90;      // 每步间隔 ms，4 步 ≈ 0.36s
const ART_COLOR = '#22D3EE'; // 定格颜色（THEME.accent）

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 时长格式化：1分23秒 / 45 秒
function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}分${sec}秒` : `${sec} 秒`;
}

/**
 * playGoodbye — 播放退出画面
 *
 * @param durationMs 本次使用时长（cli.js 从启动计时）
 * @param stdout     输出流（默认 process.stdout，测试可注入假流）
 *
 * 非 TTY（管道/CI）直接静默返回，不往日志里灌控制码。
 */
export async function playGoodbye({ durationMs, stdout = process.stdout }) {
  if (!stdout.isTTY) return;

  const cols = stdout.columns || 80;
  const rows = stdout.rows || 24;

  // 画面总行数：字符画 + 空行 + 时长 + 自定义文案
  const artWidth = Math.max(...GOODBYE_ART.map(l => l.length));
  const totalLines = GOODBYE_ART.length + 1 + 1 + 1;

  // 水平/垂直居中
  const leftPad = Math.max(0, Math.floor((cols - artWidth) / 2));
  const topPad = Math.max(0, Math.floor((rows - totalLines) / 2));
  const pad = ' '.repeat(leftPad);

  const durationLine = `本次使用 ${formatDuration(durationMs)}`;
  // 按显示宽度居中（中文按 2 列算；字符画是纯符号按 length 算，不走这里）
  const displayWidth = (s) => [...s].reduce((w, c) => w + (c.codePointAt(0) > 0xFF ? 2 : 1), 0);
  const center = (text) =>
    ' '.repeat(Math.max(0, Math.floor((cols - displayWidth(text)) / 2))) + text;

  // 1) 完全清屏（\x1b[3J 连 scrollback 一起清），光标回左上角
  stdout.write('\x1b[2J\x1b[3J\x1b[H');

  // 2) 渐显：每步把光标移回画面顶部，用更亮的颜色重印同一组行
  for (let step = 0; step < FADE_STEPS.length; step++) {
    if (step > 0) {
      // 移回本画面第一行（上一次打印了多少行就上移多少行）
      stdout.write(`\x1b[${topPad + GOODBYE_ART.length}A`);
    }
    const color = chalk.hex(FADE_STEPS[step]);
    stdout.write('\n'.repeat(topPad));
    for (const line of GOODBYE_ART) {
      stdout.write(pad + color(line) + '\n');
    }
    if (step < FADE_STEPS.length - 1) await sleep(STEP_DELAY);
  }

  // 3) 定格：时长 + 自定义文案（暗色，不抢字符画的风头）
  stdout.write('\n');
  stdout.write(chalk.hex('#6B7280')(center(durationLine)) + '\n');
  stdout.write(chalk.hex('#9CA3AF')(center(CUSTOM_TEXT)) + '\n');
  stdout.write('\n');
  // 光标留在画面下方，shell 提示符接在这里
}
