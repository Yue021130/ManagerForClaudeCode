// 核心：“内核”和“渲染器”分开。计算逻辑和diff生成虚拟树是内核，画到哪里是渲染器。
// Yue021130：内核->后端 |  渲染器->前端


/**
 * CLI 入口 — 唯一职责是用 Ink 渲染 React 应用到终端
 * Ink 是 "React for terminals"，把 JSX 转成 ANSI 终端输出
 *
 * ── 和浏览器渲染的本质对比 ──────────────────────────────
 * 本质是一样的：React 内核（组件 / state / diff）与渲染目标解耦，
 * 差别只在最后一公里"树变成什么"：
 *
 *   浏览器:  ReactDOM.createRoot(node).render(<App/>)
 *            虚拟 DOM → 真实 DOM 节点(div/span) → CSS 布局 → 像素
 *
 *   终端:    render(<App/>)  ← 本文件,来自 ink 而不是 react-dom
 *            虚拟 DOM → 文本节点树 → yoga flexbox 布局 → ANSI 转义序列
 *
 * 相同点:
 *   - 同一个 React 内核,同一套组件/JSX/Hooks/状态驱动重渲染模型
 *   - 都靠 reconciliation(diff) 只更新变化的部分,而不是整屏重画
 *   - 布局都用 flexbox —— Ink 内置 yoga(和 React Native 同款布局引擎),
 *     所以 <Box flexDirection="row"> 写起来和 CSS flex 几乎一一对应
 * 不同点:
 *   - 输出介质: 像素画布 vs 字符网格(没有像素,样式只有颜色/加粗等 ANSI 码)
 *   - 事件来源: DOM 事件(onClick/onChange) vs stdin 按键(本项目用 useInput)
 *   - 无持久实体: DOM 节点常驻可查询,终端只是被反复覆写的字符流
 */
import React from 'react';
// 这里的 render 来自 ink —— 相当于浏览器的 ReactDOM,只是   渲染器换了后端
import { render } from 'ink';
import App from './App.js';
import { playSplash } from './shell/splash.js';
import { playGoodbye } from './shell/goodbye.js';

// 生命周期三段式：
//   启动页（splash）→ App 运行 → 退出画面（goodbye）
// splash/goodbye 都是纯 ANSI 直写 stdout，不经过 Ink；
// Ink 挂载前屏幕已清空、光标在左上角，卸载后由 goodbye 接管
const startTime = Date.now();
await playSplash();

// render() 挂载 <App/> 到终端,接管 stdout/stdin
// Ink 自动处理: 只重绘变化行(ANSI 光标控制)、stdin 原始模式捕获按键、
// 退出时恢复终端状态 —— 对应浏览器里 React/DOM 替你做的事
const { waitUntilExit } = render(<App />);

// 退出流程：用户在 App 里按 q → Ink 卸载 → waitUntilExit 兑现 →
// goodbye 接管 stdout：完全清屏 → 字符画渐显 → 定格（shell 提示符接在画面下）
await waitUntilExit();
await playGoodbye({ durationMs: Date.now() - startTime });
