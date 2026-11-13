import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

/**
 * Mascot — 统计面板上的象限块像素小人（Clawd 风格）
 *
 * 造型：U+2580 块元素一格承载 4 个子像素；眼睛是「缺象限」（▛/▜ 各缺一角）露出终端背景，
 *       闭眼帧在眼睛位画深色下半块（眼睑线），头形不变、仍有五官；品牌橙 #D97757。
 * 动画：终端没有「动画」原语，本质是定时器 + 覆盖重绘；Ink 双缓冲 diff 后每次只重写那几格。
 *       随机状态机八态：
 *       idle：初始家在面板最左端，随机眨眼（每拍 18%），随机起跑（每拍 4%，朝对面跑）
 *       run ：快速横移（90ms 一拍，全程约 1.3s），腿帧交替出步态、身后拖 8 列流动风带；
 *             奔跑全程不眨眼
 *       pop ：到端点直接停住、眨一眼（不消失、不闪），然后回 idle 等下一次起跑
 *       jump：原地跳跃——下蹲蓄力（压扁帧）→ 跳起（叠层 marginTop=-1 上移一行，短暂盖过
 *             面板上边框，离开后 diff 复原）→ 落地压扁 → 复原；90ms 快拍，全程不眨眼
 *       sleep：待机 30s 无动作入睡——眼闭合上，头顶 z Z 逐个右漂渐隐（叠层 marginTop=-1，
 *             借面板上边框行当气泡行）；睡眠中每拍小概率起跑/起跳「立刻醒」
 *       happy：随机开心（idle 每拍 2%）——笑眼（眼睛位深色上半弧）+ 两侧爱心从头角升起、
 *             到头顶行后空心脉冲渐隐，6 拍（≈2.4s）回 idle
 *       look：东张西望（idle 每拍 3%）——眼睛两洞挪到同侧，身体/腿向该侧倾一列、
 *             近侧肩膀降半格；看左 2 拍 → 看右 2 拍回正
 *       turn：原地转身（idle 每拍 2%）——侧面收窄 → 背面无眼实心 → 侧面 → 回正（3 拍快转）
 *       wave：招手（idle 每拍 3%）——右臂举直贴头侧（右半块细臂+臂尖翘起），手点在上方 ▗/▖ 左右摆 3 个来回
 * 叠层：position absolute 覆盖在统计块同区（Yoga 绝对定位原点 = 父级内容区 (0,0)，
 *       无需 top/left，marginLeft 控制横移），跑过统计时小人盖在字上，离开后 Ink diff 复原文字。
 */

type Seg = [string, (string | undefined)?, (string | undefined)?]; // [文本, 前景?, 背景?]

const HEAD_OPEN = ' ▐▛███▜▌ '; // 睁眼：眼睛是缺象限（▛/▜ 各缺一角）露终端背景
// 眨眼：整头全橙实心
const HEAD_CLOSED = ' ▐█████▌ ';
// 睡觉闭眼：眼睛位 ▀ 上下双色——上半主体橙补头形、下半深橙眼睑线
const HEAD_SLEEP: Seg[] = [
  [' ▐'],
  ['▀', '#D97757', '#9E4A2A'],
  ['███'],
  ['▀', '#D97757', '#9E4A2A'],
  ['▌ ']
];
const BODY = '▝▜█████▛▘';
// 笑眼（happy）：眼睛位 ▀ 上下双色——上半深橙笑眼弧、下半主体橙，和瞌睡的下眼睑区分
const HEAD_HAPPY: Seg[] = [
  [' ▐'],
  ['▀', '#9E4A2A', '#D97757'],
  ['███'],
  ['▀', '#9E4A2A', '#D97757'],
  ['▌ ']
];
const LEGS = ['  ▘▘ ▝▝  ', '  ▝▝ ▘▘  '];   // 两帧交替 = 走路/跑步步态
// 东张西望：眼睛两洞（▛/▜ 缺象限）挪到同侧相邻 = 眼珠转向；身体相应侧移一列
const HEAD_LOOK_L = ' ▐▛▜███▌ ';
const HEAD_LOOK_R = ' ▐███▛▜▌ ';
// 东张西望身体：近侧肩膀降半格（▄）出倾斜感；渲染时身体/腿整体再向看的一侧移一列
const BODY_LOOK_L = '▝▄█████▛▘';
const BODY_LOOK_R = '▝▜█████▄▘';
// 原地转身：侧面收窄（无手臂）/ 背面无眼实心；正面 → 侧面 → 背面 → 侧面 → 回正
const HEAD_SIDE = '  ▐███▌  ';
const BODY_SIDE = ' ▝▜███▛▘ ';
const LEGS_SIDE = '   ▘ ▝   ';
const HEAD_BACK = ' ▐█████▌ ';
// 招手：右臂举直贴头侧（头行右端 ▐ 右半块，与头缘 ▌ 间留半格缝 = 细手臂，不糊成柱子），
// 体行右臂尖翘起（▝）接上手臂，手点在上方气泡行 ▗/▖ 左右摆 = 挥手
const HEAD_WAVE = ' ▐▛███▜▌▐';
const BODY_WAVE = '▝▜█████▛▝';
// 压扁帧（跳跃蓄力/落地）：头压扁、身体摊平、腿收起（第三行空串 = 不画，留白由 diff 复原）
const SQUASH = [' ▐▄███▄▌ ', '▀▀▀▀▀▀▀▀▀', ''];

const COLOR = '#D97757';
const WIND_COLOR = '#6E7681';
const WIND_W = 8;
const WIND_BASE = '─╌╌ ─╌ ╌'; // 风带：逐帧滚动 + 行间错相 = 流动感

const IDLE_MS = 400;  // 待机/冒出拍
const RUN_MS = 90;    // 奔跑拍（快）
const BLINK_MS = 120; // 闭眼只停 120ms 就睁开（快眨，不拖沓）
const RUN_STEPS = 14; // 全程约 14 拍 ≈ 1.3s
const POP_TICKS = 2;  // 到端点停顿 2 拍：首拍闭眼（眨一眼），全程不消失
const JUMP_TICKS = 4; // 跳跃节拍：下蹲 → 跳起 ×2 → 落地压扁，第 5 拍回 idle
const SLEEP_TICKS = 75; // idle 连续 75 拍（≈30s）无动作入睡
// 鼾声气泡帧：右漂 + 小写变大写（升高感），后半程渐隐；叠层借面板上边框行当气泡行
const Z_FRAMES = ['z', ' z', '  Z', '   Z'];
// 开心爱心（🥰 式）：两侧各一颗，t0 贴头两侧角 → t1 升到头顶行 → t2 空心脉冲 → t3 渐隐
const HEART_COLOR = '#F778BA';
const HAPPY_TICKS = 6; // 开心 6 拍（≈2.4s）回 idle
const LOOK_TICKS = 4; // 东张西望 4 拍：看左 ×2 → 看右 ×2 → 回 idle
const TURN_TICKS = 3; // 原地转身 3 拍：侧面 → 背面 → 侧面 → 回 idle
const WAVE_TICKS = 6; // 招手 6 拍（≈2.4s）：手左右摆 3 个来回
// t0 头部帧：爱心贴头两侧角（其余拍用 HEAD_HAPPY）
const HEAD_HAPPY_HEARTS: Seg[] = [
  ['♥', HEART_COLOR],
  ['▐'],
  ['▀', '#9E4A2A', '#D97757'],
  ['███'],
  ['▀', '#9E4A2A', '#D97757'],
  ['▌'],
  ['♥', HEART_COLOR]
];

export const MASCOT_W = 9; // 造型列宽（含两侧留白）

/** 风带按帧滚动：向右跑风往后拖，向左跑反向滚 */
const windAt = (row: number, t: number, dir: 1 | -1): string => {
  const k = (t * 2 + row * 3) % WIND_W;
  const r = dir === 1 ? k : (WIND_W - k) % WIND_W;
  return WIND_BASE.slice(r) + WIND_BASE.slice(0, r);
};

interface S {
  x: number;                         // 面板内容区内左偏移（列）；0 = 最左端的家
  dir: 1 | -1;                       // 奔跑方向
  phase: 'idle' | 'run' | 'pop' | 'jump' | 'sleep' | 'happy' | 'look' | 'turn' | 'wave';
  t: number;                         // 阶段内帧数（步态/冒出/跳跃节拍用；idle 兼作入睡计时）
  blink: boolean;                    // 本拍是否闭眼（sleep 恒 true，run/jump/happy/look/turn/wave 恒 false）
}

const advance = (prev: S, maxX: number, step: number): S => {
  if (prev.phase === 'run') {
    const nx = prev.x + step * prev.dir;
    const arrived = prev.dir === 1 ? nx >= maxX : nx <= 0;
    if (arrived) return { x: prev.dir === 1 ? maxX : 0, dir: prev.dir, phase: 'pop', t: 0, blink: true }; // 停住眨一眼
    return { ...prev, x: nx, t: prev.t + 1, blink: false }; // 奔跑不眨眼
  }
  if (prev.phase === 'pop') {
    const nt = prev.t + 1;
    if (nt >= POP_TICKS) return { ...prev, phase: 'idle', t: 0, blink: false };
    return { ...prev, t: nt, blink: false };
  }
  if (prev.phase === 'jump') {
    const nt = prev.t + 1;
    if (nt >= JUMP_TICKS) return { ...prev, phase: 'idle', t: 0, blink: false };
    return { ...prev, t: nt, blink: false };
  }
  if (prev.phase === 'sleep') {
    // 睡眠中每拍约 1% 概率起跑/起跳「立刻醒」（平均睡 ~40s）；否则继续睡（鼾声帧随 t 滚动）
    if (maxX >= 4 && Math.random() < 0.003) return { ...prev, phase: 'jump', t: 0, blink: false };
    if (maxX >= 4 && Math.random() < 0.007) {
      return { x: prev.x, dir: prev.x === 0 ? 1 : -1, phase: 'run', t: 0, blink: false };
    }
    return { ...prev, t: prev.t + 1, blink: true };
  }
  if (prev.phase === 'happy') {
    const nt = prev.t + 1;
    if (nt >= HAPPY_TICKS) return { ...prev, phase: 'idle', t: 0, blink: false };
    return { ...prev, t: nt, blink: false };
  }
  if (prev.phase === 'look') {
    const nt = prev.t + 1;
    if (nt >= LOOK_TICKS) return { ...prev, phase: 'idle', t: 0, blink: false };
    return { ...prev, t: nt, dir: nt < 2 ? -1 : 1, blink: false }; // 前两拍看左，后两拍看右
  }
  if (prev.phase === 'turn') {
    const nt = prev.t + 1;
    if (nt >= TURN_TICKS) return { ...prev, phase: 'idle', t: 0, blink: false };
    return { ...prev, t: nt, blink: false };
  }
  if (prev.phase === 'wave') {
    const nt = prev.t + 1;
    if (nt >= WAVE_TICKS) return { ...prev, phase: 'idle', t: 0, blink: false };
    return { ...prev, t: nt, blink: false };
  }
  // idle：随机动作——眨眼 / 原地起跳 / 开心 / 东张西望 / 原地转身 / 招手 / 起跑（朝对面）；连续无动作 30s 入睡
  if (maxX >= 4 && Math.random() < 0.02) {
    return { ...prev, phase: 'jump', t: 0, blink: false };
  }
  if (maxX >= 4 && Math.random() < 0.02) {
    return { ...prev, phase: 'happy', t: 0, blink: false };
  }
  if (maxX >= 4 && Math.random() < 0.03) {
    return { ...prev, phase: 'look', dir: -1, t: 0, blink: false };
  }
  if (maxX >= 4 && Math.random() < 0.02) {
    return { ...prev, phase: 'turn', t: 0, blink: false };
  }
  if (maxX >= 4 && Math.random() < 0.03) {
    return { ...prev, phase: 'wave', t: 0, blink: false };
  }
  if (maxX >= 4 && Math.random() < 0.04) {
    return { x: prev.x, dir: prev.x === 0 ? 1 : -1, phase: 'run', t: 0, blink: false };
  }
  if (prev.t + 1 >= SLEEP_TICKS) return { ...prev, phase: 'sleep', t: 0, blink: true };
  return { ...prev, t: prev.t + 1, blink: prev.blink ? false : Math.random() < 0.18 }; // 闭过眼必睁开，不连眨
};

export default function Mascot({ width }: { width: number }) {
  const maxX = Math.max(0, width - MASCOT_W);
  const step = Math.max(2, Math.ceil(maxX / RUN_STEPS));
  const [s, setS] = useState<S>({ x: 0, dir: 1, phase: 'idle', t: 0, blink: false });

  // 每拍一个 setTimeout，间隔随状态变（run/jump 快拍；idle/pop 闭眼只停 120ms；sleep 慢拍）
  useEffect(() => {
    if (maxX < 4) return; // 太窄：静态 idle
    const ms =
      s.phase === 'run' || s.phase === 'jump'
        ? RUN_MS
        : (s.phase === 'idle' || s.phase === 'pop') && s.blink
          ? BLINK_MS
          : IDLE_MS;
    const timer = setTimeout(() => setS(prev => advance(prev, maxX, step)), ms);
    return () => clearTimeout(timer);
  }, [s, maxX, step]);

  if (width < MASCOT_W) return null; // 放不下就不画

  // 睡眠：闭眼（HEAD_SLEEP）；开心：笑眼（HEAD_HAPPY）；东张西望：HEAD_LOOK_L/R；转身：侧面/背面帧；招手：HEAD_OPEN+翘臂（手点画在气泡行）；跳跃蓄力/落地用压扁帧；其余正常造型
  const sleeping = s.phase === 'sleep';
  const happy = s.phase === 'happy';
  const waving = s.phase === 'wave';
  const parts: (string | Seg[])[] = sleeping
    ? [HEAD_SLEEP, BODY, LEGS[0]]
    : happy
      ? [s.t === 0 ? HEAD_HAPPY_HEARTS : HEAD_HAPPY, BODY, LEGS[0]]
      : s.phase === 'look'
        ? [s.dir === -1 ? HEAD_LOOK_L : HEAD_LOOK_R, s.dir === -1 ? BODY_LOOK_L : BODY_LOOK_R, LEGS[0]]
        : s.phase === 'turn'
          ? s.t === 1
            ? [HEAD_BACK, BODY, LEGS[0]]
            : [HEAD_SIDE, BODY_SIDE, LEGS_SIDE]
          : s.phase === 'wave'
            ? [HEAD_WAVE, BODY_WAVE, LEGS[0]]
            : s.phase === 'jump' && (s.t === 0 || s.t === 3)
              ? SQUASH
              : [s.blink ? HEAD_CLOSED : HEAD_OPEN, BODY, LEGS[s.phase === 'run' ? s.t % 2 : 0]];
  // 跳起两拍 / 睡眠 / 开心 / 招手（借面板上边框行画气泡）：叠层上移一行，离开后 diff 复原
  const floating = sleeping || happy || waving;
  const lift = floating || (s.phase === 'jump' && (s.t === 1 || s.t === 2)) ? -1 : 0;
  const zFrame = Z_FRAMES[s.t % Z_FRAMES.length];
  // 爱心两侧升起：t1 到顶（实心）→ t2 空心脉冲 → t3 渐隐；t0/t4-5 不画顶行爱心
  const heartAt = { glyph: s.t === 1 ? '♥' : '♡', dim: s.t === 3 };

  // 行内容渲染：字符串单色；Seg[] 分段上色（睡觉眼睑 / 开心笑眼 = ▀ 上下双色）
  const rowContent = (part: string | Seg[]) =>
    typeof part === 'string' ? (
      <Text color={COLOR}>{part}</Text>
    ) : (
      <Text color={COLOR}>
        {part.map(([txt, c, bg], i) =>
          c || bg ? (
            <Text key={i} color={c} backgroundColor={bg}>{txt}</Text>
          ) : (
            txt
          )
        )}
      </Text>
    );

  return (
    <Box position="absolute" marginTop={lift} width={width} height={floating ? 4 : 3} flexDirection="column">
      {sleeping && (
        <Box flexDirection="row" marginLeft={s.x + 2}>
          <Text bold color="#C9D1D9" dimColor={s.t % Z_FRAMES.length >= 2}>{zFrame}</Text>
        </Box>
      )}
      {waving && (
        // 手点在头右上方左右摆（▗ 低位 ↔ ▖ 高位错一格）；行有内容不塌陷，无需占位
        <Box flexDirection="row" marginLeft={s.x + (s.t % 2 === 0 ? 7 : 8)}>
          <Text color={COLOR}>{s.t % 2 === 0 ? '▗' : '▖'}</Text>
        </Box>
      )}
      {happy && (
        // 气泡行常驻占位（height=1 防空 Box 塌陷）：少了它头部帧会整体上移一行错位
        <Box flexDirection="row" height={1}>
          {s.t >= 1 && s.t <= 3 && (
            <>
              <Box marginLeft={s.x}>
                <Text bold color={HEART_COLOR} dimColor={heartAt.dim}>{heartAt.glyph}</Text>
              </Box>
              <Box marginLeft={MASCOT_W - 2}>
                <Text bold color={HEART_COLOR} dimColor={heartAt.dim}>{heartAt.glyph}</Text>
              </Box>
            </>
          )}
        </Box>
      )}
      {parts.map((part, row) => {
          // 定位一律用 marginLeft（布局边距不产生字符）；绝不能用空格文本推位——
          // 空格会写进屏幕缓冲区，小人走开后一直盖着统计文字
          if (s.phase !== 'run') {
            // 东张西望：身体/腿向看的一侧倾一列（头不动，出探身感），贴边时钳住
            const lean = s.phase === 'look' && row > 0 ? s.dir : 0;
            const mx = Math.min(Math.max(0, s.x + lean), maxX);
            return (
              <Box key={row} flexDirection="row" marginLeft={mx}>
                {rowContent(part)}
              </Box>
            );
          }
          // 奔跑：身后拖风带（向右跑风在左，向左跑风在右）
          const wind = windAt(row, s.t, s.dir);
          if (s.dir === 1) {
            const wx = Math.max(0, s.x - WIND_W);
            return (
              <Box key={row} flexDirection="row">
                <Box marginLeft={wx}>
                  <Text color={WIND_COLOR}>{wind}</Text>
                </Box>
                <Box marginLeft={Math.max(0, s.x - wx - WIND_W)}>
                  {rowContent(part)}
                </Box>
              </Box>
            );
          }
          const avail = Math.max(0, width - (s.x + MASCOT_W) - 1); // 右侧剩余宽度，风带不越界
          return (
            <Box key={row} flexDirection="row">
              <Box marginLeft={s.x}>
                {rowContent(part)}
              </Box>
              {avail > 0 && (
                <Box marginLeft={1}>
                  <Text color={WIND_COLOR}>{wind.slice(0, avail)}</Text>
                </Box>
              )}
            </Box>
          );
        })}
    </Box>
  );
}
