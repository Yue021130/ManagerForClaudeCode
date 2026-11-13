import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

/**
 * Mascot — 统计面板上的象限块像素小人（Clawd 风格）
 *
 * 造型：U+2580 块元素一格承载 4 个子像素；眼睛是「缺象限」（▛/▜ 各缺一角）露出终端背景，
 *       眨眼帧换成 ▀（上下半块）即闭眼；品牌橙 #D97757。
 * 动画：终端没有「动画」原语，本质是定时器 + 覆盖重绘；Ink 双缓冲 diff 后每次只重写那几格。
 *       随机状态机三态：
 *       idle：初始家在面板最左端，随机眨眼（每拍 18%），随机起跑（每拍 4%，朝对面跑）
 *       run ：快速横移（90ms 一拍，全程约 1.3s），腿帧交替出步态、身后拖 8 列流动风带；
 *             奔跑全程不眨眼
 *       pop ：到端点直接停住、眨一眼（不消失、不闪），然后回 idle 等下一次起跑
 * 叠层：position absolute 覆盖在统计块同区（Yoga 绝对定位原点 = 父级内容区 (0,0)，
 *       无需 top/left，marginLeft 控制横移），跑过统计时小人盖在字上，离开后 Ink diff 复原文字。
 */

const HEAD = [' ▐▛███▜▌ ', ' ▐▀███▀▌ ']; // 0=睁眼 1=眨眼
const BODY = '▝▜█████▛▘';
const LEGS = ['  ▘▘ ▝▝  ', '  ▝▝ ▘▘  '];   // 两帧交替 = 走路/跑步步态

const COLOR = '#D97757';
const WIND_COLOR = '#6E7681';
const WIND_W = 8;
const WIND_BASE = '─╌╌ ─╌ ╌'; // 风带：逐帧滚动 + 行间错相 = 流动感

const IDLE_MS = 400;  // 待机/冒出拍
const RUN_MS = 90;    // 奔跑拍（快）
const RUN_STEPS = 14; // 全程约 14 拍 ≈ 1.3s
const POP_TICKS = 2;  // 到端点停顿 2 拍：首拍闭眼（眨一眼），全程不消失

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
  phase: 'idle' | 'run' | 'pop';
  t: number;                         // 阶段内帧数（步态/冒出节拍用）
  blink: boolean;                    // 本拍是否闭眼（idle/pop 随机或定时，run 恒 false）
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
  // idle：随机动作——眨眼 / 起跑（朝对面）
  if (maxX >= 4 && Math.random() < 0.04) {
    return { x: prev.x, dir: prev.x === 0 ? 1 : -1, phase: 'run', t: 0, blink: false };
  }
  return { ...prev, t: prev.t + 1, blink: Math.random() < 0.18 };
};

export default function Mascot({ width }: { width: number }) {
  const maxX = Math.max(0, width - MASCOT_W);
  const step = Math.max(2, Math.ceil(maxX / RUN_STEPS));
  const [s, setS] = useState<S>({ x: 0, dir: 1, phase: 'idle', t: 0, blink: false });

  // 每拍一个 setTimeout，间隔随 phase 变（run 快、idle/pop 慢）
  useEffect(() => {
    if (maxX < 4) return; // 太窄：静态 idle
    const timer = setTimeout(() => setS(prev => advance(prev, maxX, step)), s.phase === 'run' ? RUN_MS : IDLE_MS);
    return () => clearTimeout(timer);
  }, [s, maxX, step]);

  if (width < MASCOT_W) return null; // 放不下就不画

  const parts = [HEAD[s.blink ? 1 : 0], BODY, LEGS[s.phase === 'run' ? s.t % 2 : 0]];

  return (
    <Box position="absolute" width={width} height={3} flexDirection="column">
      {parts.map((part, row) => {
          // 定位一律用 marginLeft（布局边距不产生字符）；绝不能用空格文本推位——
          // 空格会写进屏幕缓冲区，小人走开后一直盖着统计文字
          if (s.phase !== 'run') {
            return (
              <Box key={row} flexDirection="row" marginLeft={s.x}>
                <Text color={COLOR}>{part}</Text>
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
                  <Text color={COLOR}>{part}</Text>
                </Box>
              </Box>
            );
          }
          const avail = Math.max(0, width - (s.x + MASCOT_W) - 1); // 右侧剩余宽度，风带不越界
          return (
            <Box key={row} flexDirection="row">
              <Box marginLeft={s.x}>
                <Text color={COLOR}>{part}</Text>
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
