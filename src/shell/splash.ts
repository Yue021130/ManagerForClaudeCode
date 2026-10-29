import chalk from 'chalk';
import {GOODBYE_ART} from './goodbye.js';

/**
 * splash — 启动页
 *
 *   完全清屏 → 字符画渐显 → 定格呼吸动画→ 等键盘事件 → 淡出 → 清屏交还 Ink
 *
 * 回车前的等待是本文件自己监听 stdin（raw mode），此时 Ink 还没挂载；
 * 交还前会移除监听并关掉 raw mode，不跟 Ink 抢输入。
 *
 * resize 自适应：每帧现读终端尺寸重算居中边距；
 * 动画期间改了窗口大小 → 收到 resize 事件 → 下一帧全清重排。
 *
 */

export const SPLASH_SUBTITLE = 'Manager For Claude Code';
export const SPLASH_HINT = 'Enter 进 入 · Esc 退 出';

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
 * playSplash
 *
 * @param stdout 输出流
 * @param stdin  输入流
 *
 * 非 TTY（管道/CI）静默跳过，不等按键，直接把终端交给 Ink。
 */

/*
Q：TS泛型解析：
     export async function playSplash({
       stdout = process.stdout,      // ① 解构 + 属性默认值
       stdin = process.stdin
     }: {
       stdout?: typeof process.stdout;   // ② 参数的类型注解（可选属性）
       stdin?: typeof process.stdin;
     } = {}): Promise<void> {            // ③ 整个参数的默认值


?: 表示这个属性可以不给
stdout?: 的意思是这个 key 可有可无——因为不给时有默认值兜底。typeof process.stdout 是「取 process.stdout 的类型」，即 Node 的 tty.WriteStream
   类型，不手写一遍。

} = {} 是整个参数对象的默认值
   这是关键的一块。它让 playSplash()——括号里什么都不传——也合法：
   • 有 = {}：playSplash() 等价于 playSplash({})，空对象再解构，两个属性各自落到默认值 process.stdout / process.stdin
   • 没有 = {}：传空就报错了，undefined 不能解构

*/
export async function playSplash({
  stdout = process.stdout,
  stdin = process.stdin
}: {
  stdout?: typeof process.stdout;
  stdin?: typeof process.stdin;
} = {}): Promise<void> {
  if (!stdout.isTTY || !stdin.isTTY) return;

  // ── 帧渲染器：每帧现读终端尺寸（自适应）──
  let lastLines = 0;       // 上一帧印了多少行
  let needsClear = true;   // 首帧 / resize 后全清重排
  const onResize = () => { needsClear = true; };
  stdout.on('resize', onResize);  // 如果触发了resize,那么自动掉用onResize。

  /*
   const frame = (
       artColor: (s: string) => string,
       subtitleColor: (s: string) => string,
       hintColor: (s: string) => string
     ) => { ... }

• 参数：三个「染色函数」。类型 (s: string) => string 意思是「吃一个字符串，吐一个字符串」——实际传进来的就是 chalk.hex('#22D3EE') 这类 chalk
  上色函数，给字符串包上 ANSI 颜色码
• 为什么是函数而不是颜色字符串：chalk 的用法是 chalk.hex('#xxx')(文本)，把「颜色」本身做成函数传进来，frame 内部直接 artColor(line) 就能给整
  行字符画染色，不用关心具体是哪个颜色
• 返回值：没有 return，隐式返回 undefined（它只负责往 stdout 写，是个副作用函数）
  * */
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
    await new Promise<void>((resolve) => {  // resolve为空 |2026年10月29日12点10分　Ｙｕｅ021130 | 学习能力大不如前。
      let tick = 0;

      // 定时器自动触发重画渲染和呼吸效果
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
        stdin.removeListener('data', onData);  // 移除监听器
        stdin.setRawMode(false);  // 关闭 raw mode
        stdin.pause();  // 暂停 stdin
      };
      const onData = (buf: Buffer) => {
        const input = buf.toString();
        if (input === '\x03' || input === '\x1b') {   // Ctrl+C / Esc：直接退出进程
          cleanup();
          stdout.write('\x1b[2J\x1b[3J\x1b[H');
          /*
   ┌─────────┬────────────────────────────────────────────────────────────────────────────────────────────┐
   │ 片段     │ 含义                                                                                        │
   ├─────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
   │ \x1b[2J │ 清可见区域（erase entire display）——把屏幕上所有可见字符抹掉                                        │
   ├─────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
   │ \x1b[3J │ 清回滚缓冲（erase scrollback）——连往上翻页能看到的历史内容一起清掉，防止用户往上翻看到残影                  │
   ├─────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
   │ \x1b[H  │ 光标归位（home）——把光标移到左上角 (1, 1)，从这里重新画                                              │
   └─────────┴────────────────────────────────────────────────────────────────────────────────────────────┘
          * */
          process.exit(0);
        }
        if (ENTER.includes(input)) {    // 如果按下回车
          cleanup();
          resolve();
        }
      };

      /*
      *  终端默认是行模式：你按的字符先存在内部缓冲区，直到回车才整行吐给程序。所以平时程序拿到的总是一整行。
          raw mode 把这层取消——按一下键，立刻把那个字节发给程序
     默认模式:  按 E → 按 n → 按 t → 按 e → 按 r → 程序收到 "Enter"
     raw mode:  按 E → 程序立刻收到 'E'，再按立刻收到下一个
      * */
      stdin.setRawMode(true);  //关掉行缓冲
      stdin.resume(); // 让流开始流动 | 通知 Node「开始往 'data' 事件推送数据」
      stdin.on('data', onData); // 接收到数据就调用 onData 处理
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
