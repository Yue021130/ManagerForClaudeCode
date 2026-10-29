import chalk from 'chalk';

/**
 * goodbye — 退出画面
 *
 * 进程退场不走 Ink
 * 这里用纯 ANSI 转义序列 + chalk 直接写 stdout：
 *
 *   完全清屏 → 字符画由暗到亮渐显 → 定格保留
 *
 * 画面是紧凑的：左上角一个小块，只占几行，不居中也不铺满全屏
 *
 */

// 字符画
export const GOODBYE_ART = [
  '███╗   ███╗███████╗ ██████╗ ██████╗',
  '████╗ ████║██╔════╝██╔════╝██╔════╝',
  '██╔████╔██║█████╗  ██║     ██║     ',
  '██║╚██╔╝██║██╔══╝  ██║     ██║     ',
  '██║ ╚═╝ ██║██║     ╚██████╗╚██████╗',
  '╚═╝     ╚═╝╚═╝      ╚═════╝ ╚═════╝'
];

// 自定义告别文案
export const CUSTOM_TEXT = '你说把爱渐渐放下会走更远。';

// ── 以下为实现，一般不用动 ─────────────────────────────

// 渐显亮度步进：深灰 → 中灰 → 浅灰 → 主题青
const FADE_STEPS = ['#3A3F4A', '#6B7280', '#9CA3AF', '#22D3EE'];
const STEP_DELAY = 90;      // 每步间隔 ms，4 步 ≈ 0.36s

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// 时长格式化
function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}分${sec}秒` : `${sec} 秒`;
}

/**
 * playGoodbye — 播放退出画面
 *
 * @param durationMs 本次使用时长
 * @param stdout     输出流
 *
 * 本质： 向 stdout输入流 中写内容。
 *
 * 非 TTY（管道/CI）直接静默返回，不往日志里灌控制码。
 */
export async function playGoodbye({
  durationMs,
  stdout = process.stdout
}: {
  durationMs: number;
  stdout?: typeof process.stdout;
}): Promise<void> {
  if (!stdout.isTTY) return;

  // 不居中：退出画面是左上角的一个紧凑小块，只占几行，左侧留两格呼吸
  const topPad = 1;
  const pad = '  ';

  const durationLine = `🥰 本次使用 ${formatDuration(durationMs)}。`;

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

  // 3) 定格：时长 + 自定义文案
  //  文本严格左对齐，只有字符画留两格
  stdout.write('\n');
  stdout.write(chalk.hex('#6B7280')(durationLine) + '\n');
  stdout.write(chalk.hex('#9CA3AF')(CUSTOM_TEXT) + '\n');
  stdout.write('\n');
}
