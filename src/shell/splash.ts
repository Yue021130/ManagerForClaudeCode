import chalk from 'chalk';
import { GOODBYE_ART } from './goodbye.js';

/**
 * splash — 启动页
 *
 * 和 goodbye.ts 对称：Ink 挂载前先播开场画面
 *
 *   完全清屏 → 字符画渐显 → 定格呼吸动画（提示行常亮）→ 等回车 → 淡出 → 清屏交还 Ink
 *
 * 回车前的等待是本文件自己监听 stdin（raw mode），此时 Ink 还没挂载；
 * 交还前会移除监听并关掉 raw mode，不跟 Ink 抢输入。
 *
 * resize 自适应：每帧现读终端尺寸重算居中边距；
 * 动画期间改了窗口大小 → 收到 resize 事件 → 下一帧全清重排。
 *
 * 字符画复用 goodbye.ts 的 GOODBYE_ART，两处永远同步。
 * 想改文案就改下面两个常量。
 */

export const SPLASH_SUBTITLE = 'Manager For Claude Code';
export const SPLASH_HINT = '回 车 进 入 · Esc 退 出';

const FADE_IN = ['#3A3F4A', '#6B7280', '#9CA3AF', '#22D3EE'];
const FADE_OUT = ['#6B7280', '#2A2E36'];
const STEP_DELAY = 90;
const PULSE_MS = 450;          // 呼吸节奏
const ART_BRIGHT = '#22D3EE';  // 呼吸亮档
const ART_DIM = '#157F96';     // 呼吸暗档

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const ART_WIDTH = Math.max(...GOODBYE_ART.map(l => l.length));
// 字符画 + 空行 + 副标题 + 空行 + 提示行
const TOTAL_LINES = GOODBYE_ART.length + 1 + 1 + 1 + 1;

const displayWidth = (s: string): number =>
  [...s].reduce((w, c) => w + ((c.codePointAt(0) ?? 0) > 0xFF ? 2 : 1), 0);

/**
 * playSplash — 播放启动画面，停在呼吸动画上等回车，结束后屏幕已清空、光标在左上角
 *
 * @param stdout 输出流（默认 process.stdout）
 * @param stdin  输入流（默认 process.stdin，等待回车用）
 *
 * 非 TTY（管道/CI）静默跳过，不等按键，直接把终端交给 Ink。
 */
export async function playSplash({
  stdout = process.stdout,
  stdin = process.stdin
}: {
  stdout?: typeof process.stdout;
  stdin?: typeof process.stdin;
} = {}): Promise<void> {
  if (!stdout.isTTY || !stdin.isTTY) return;

  // ── 帧渲染器：每帧现读终端尺寸（resize 即自适应）──
  let lastLines = 0;       // 上一帧印了多少行（光标回移用）
  let needsClear = true;   // 首帧 / resize 后全清重排
  const onResize = () => { needsClear = true; };
  stdout.on('resize', onResize);

  const frame = (artColor: (s: string) => string, subtitleColor: (s: string) => string, hintColor: (s: string) => string) => {
    const cols = stdout.columns || 80;
    const rows = stdout.rows || 24;
    const leftPad = Math.max(0, Math.floor((cols - ART_WIDTH) / 2));
    const topPad = Math.max(0, Math.floor((rows - TOTAL_LINES) / 2));
    const pad = ' '.repeat(leftPad);
    const center = (text: string) =>
      ' '.repeat(Math.max(0, Math.floor((cols - displayWidth(text)) / 2))) + text;

    if (needsClear) {
      stdout.write('\x1b[2J\x1b[3J\x1b[H');
      needsClear = false;
    } else {
      stdout.write(`\x1b[${lastLines}A`);
    }
    stdout.write('\n'.repeat(topPad));
    for (const line of GOODBYE_ART) {
      stdout.write(pad + artColor(line) + '\n');
    }
    stdout.write('\n');
    stdout.write(subtitleColor(center(SPLASH_SUBTITLE)) + '\n');
    stdout.write('\n');
    stdout.write(hintColor(center(SPLASH_HINT)) + '\n');

    lastLines = topPad + TOTAL_LINES;
  };

  try {
    // 1) 渐显（副标题最后一档亮起，提示行保持最暗）
    for (let i = 0; i < FADE_IN.length; i++) {
      const isLast = i === FADE_IN.length - 1;
      frame(
        chalk.hex(FADE_IN[i]),
        isLast ? chalk.hex('#9CA3AF') : chalk.hex('#2A2E36'),
        chalk.hex('#2A2E36')
      );
      await sleep(STEP_DELAY);
    }

    // 渐显收尾帧：提示行点亮（常亮，不再参与后续动画）
    frame(chalk.hex(ART_BRIGHT), chalk.hex('#9CA3AF'), chalk.hex('#E5E7EB'));

    // 2) 定格等待：只有字符画呼吸（亮青↔暗青），提示行常亮不闪，直到回车
    //    此时 Ink 未挂载，自己临时接管 stdin（raw mode 才能逐键捕获）
    const ENTER = ['\r', '\n'];
    await new Promise<void>((resolve) => {
      let tick = 0;
      const timer = setInterval(() => {
        tick++;
        frame(
          chalk.hex(tick % 2 === 0 ? ART_BRIGHT : ART_DIM),
          chalk.hex('#9CA3AF'),
          chalk.hex('#E5E7EB')
        );
      }, PULSE_MS);

      const cleanup = () => {
        clearInterval(timer);
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
      };
      const onData = (buf: Buffer) => {
        const input = buf.toString();
        if (input === '\x03' || input === '\x1b') {   // Ctrl+C / Esc：直接退出进程
          cleanup();
          stdout.write('\x1b[2J\x1b[3J\x1b[H');
          process.exit(0);
        }
        if (ENTER.includes(input)) {
          cleanup();
          resolve();
        }
      };

      stdin.setRawMode(true);
      stdin.resume();
      stdin.on('data', onData);
    });

    // 3) 淡出 → 清屏交还 Ink（光标在左上角，App 从这里开始画）
    for (const c of FADE_OUT) {
      frame(chalk.hex(c), chalk.hex(c), chalk.hex(c));
      await sleep(STEP_DELAY);
    }
    stdout.write('\x1b[2J\x1b[3J\x1b[H');
  } finally {
    stdout.removeListener('resize', onResize);
  }
}
