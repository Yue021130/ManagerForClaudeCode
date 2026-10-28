import chalk from 'chalk';
import { GOODBYE_ART } from './goodbye.js';

/**
 * splash — 启动页
 *
 * 和 goodbye.js 对称：Ink 挂载前先播开场画面
 *
 *   完全清屏 → 字符画渐显 → 定格呼吸动画（提示行常亮）→ 等回车 → 淡出 → 清屏交还 Ink
 *
 * 回车前的等待是本文件自己监听 stdin（raw mode），此时 Ink 还没挂载；
 * 交还前会移除监听并关掉 raw mode，不跟 Ink 抢输入。
 *
 * 字符画复用 goodbye.js 的 GOODBYE_ART，两处永远同步。
 * 想改文案就改下面两个常量。
 */

export const SPLASH_SUBTITLE = 'Manager For Claude Code';
export const SPLASH_HINT = '回 车 进 入 · Esc 退 出';

const FADE_IN = ['#3A3F4A', '#6B7280', '#9CA3AF', '#22D3EE'];
const FADE_OUT = ['#6B7280', '#2A2E36'];
const STEP_DELAY = 90;
const PULSE_MS = 450;          // 呼吸/闪烁节奏
const ART_BRIGHT = '#22D3EE';  // 呼吸亮档
const ART_DIM = '#157F96';     // 呼吸暗档

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * playSplash — 播放启动画面，停在呼吸动画上等回车，结束后屏幕已清空、光标在左上角
 *
 * @param stdout 输出流（默认 process.stdout）
 * @param stdin  输入流（默认 process.stdin，等待回车用）
 *
 * 非 TTY（管道/CI）静默跳过，不等按键，直接把终端交给 Ink。
 */
export async function playSplash({ stdout = process.stdout, stdin = process.stdin } = {}) {
  if (!stdout.isTTY || !stdin.isTTY) return;

  const cols = stdout.columns || 80;
  const rows = stdout.rows || 24;

  const artWidth = Math.max(...GOODBYE_ART.map(l => l.length));
  // 字符画 + 空行 + 副标题 + 空行 + 提示行
  const totalLines = GOODBYE_ART.length + 1 + 1 + 1 + 1;
  const leftPad = Math.max(0, Math.floor((cols - artWidth) / 2));
  const topPad = Math.max(0, Math.floor((rows - totalLines) / 2));
  const pad = ' '.repeat(leftPad);

  const displayWidth = (s) => [...s].reduce((w, c) => w + (c.codePointAt(0) > 0xFF ? 2 : 1), 0);
  const center = (text) =>
    ' '.repeat(Math.max(0, Math.floor((cols - displayWidth(text)) / 2))) + text;

  // 印一帧：首帧清屏；后续帧光标回移原位重印（不清屏，避免闪屏）
  const LINES_PER_FRAME = topPad + totalLines;
  let firstFrame = true;
  const frame = (artColor, subtitleColor, hintColor) => {
    if (firstFrame) {
      stdout.write('\x1b[2J\x1b[3J\x1b[H');
      firstFrame = false;
    } else {
      stdout.write(`\x1b[${LINES_PER_FRAME}A`);
    }
    stdout.write('\n'.repeat(topPad));
    for (const line of GOODBYE_ART) {
      stdout.write(pad + artColor(line) + '\n');
    }
    stdout.write('\n');
    stdout.write(subtitleColor(center(SPLASH_SUBTITLE)) + '\n');
    stdout.write('\n');
    stdout.write(hintColor(center(SPLASH_HINT)) + '\n');
  };

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
  await new Promise((resolve) => {
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
    const onData = (buf) => {
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
}
