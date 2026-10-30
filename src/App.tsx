import { useState, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { ShellValue } from './types.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { ShellProvider } from './shell/context.js';
import { PAGE_REGISTRY } from './pages/registry.js';

// 顶栏右侧品牌文字 | 当前占位
const BRAND_TEXT = 'Yue 💫 · Claude Code Manager';

/**
 * App — 纯外壳：不认识任何具体页面，一切由 pages/registry.ts 驱动
 *
 * 职责：
 * - 顶栏：左侧页面 Tab，右侧品牌文字
 * - 底栏：左侧当前页 meta.hints，右侧页面反馈消息
 * - 全局键：Esc 退出、数字键按 meta.num 切页
 *    | 页面自己的按键在页面组件内部用 useInput 处理 ———— 只有当前页被挂载，互不干扰
 * - 布局：顶栏 / 分割线 / content / 分割线 / 底栏      (终端 resize 即时重排
 *
 * - 通过 ShellProvider 向页面下发 { setMessage, setError }；尺寸走 props
 */
export default function App() {
  const { exit } = useApp();

  // ── 导航状态：当前页 key，默认注册表第一项 ──
  const [pageKey, setPageKey] = useState(PAGE_REGISTRY[0].key);

  // ── 反馈状态：页面通过 useShell() 上报 ──
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // ── 页面输入模式（搜索框等）：禁用外壳数字切页，Esc 仍然生效 ──
  const [keysEnabled, setKeysEnabled] = useState(true);


  // ── 当前页 ──
  const current = PAGE_REGISTRY.find(p => p.key === pageKey) || PAGE_REGISTRY[0];

  // ── 全局键盘：只处理退出与切页，其余按键留给页面自己 ──
  useInput((input, key) => {
    // 按任意键清除上次的反馈消息
    if (message) setMessage(null);
    if (error) setError(null);

    // esc键退出
    // Esc 退出：延迟一拍再退。曾在 input 派发栈内同步 exit() 触发 Ink 卸载重入，
    // 恰好撞上启动扫描后的重渲染时卸载挂起（stdin 已拆、waitUntilExit 永不 resolve）。
    if (key.escape) { setTimeout(() => exit(), 0); return; }

    // 页面输入模式下，数字键让给页面（如搜索框）
    if (!keysEnabled) return;

    // 数字键切页
    const target = PAGE_REGISTRY.find(p => String(p.meta.num) === input);
    if (target) setPageKey(target.key);
  });

  const { width: terminalWidth, height: terminalHeight } = useTerminalSize();

  // 页面渲染：宽度满、高度扣除顶栏1+分割线2+底栏1
  const contentWidth = terminalWidth;
  const contentHeight = Math.max(1, terminalHeight - 4);

  // shell 通道：只下发反馈函数与输入模式开关；尺寸由 props 直传（见 PageProps）
  const shell = useMemo<ShellValue>(() => ({
    setMessage,
    setError,
    setKeysEnabled
  }), []);

  const ActiveComponent = current.Component;

  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
      {/* ── 顶栏：左侧 Tab / 右侧文字 ── */}
      <Box height={1} flexDirection="row" alignItems="center" paddingX={1}>
        {/*  左侧 Tab */}
        {PAGE_REGISTRY.map(p => {
          const active = p.key === current.key;
          return (
            <Box key={p.key} marginRight={2}>
              <Text
                bold={active}
                underline={active}
                color={active ? p.meta.color : '#57606A'}
              >
                {`${p.meta.num} ${p.meta.label}`}
              </Text>
            </Box>
          );
        })}
        <Box flexGrow={1} />
        {/*  右侧文本 */}
        <Text color="#57606A">{BRAND_TEXT}</Text>
      </Box>
      {/* ── 分割线 ── */}
      <Box height={1} paddingX={1}>
        <Text color="#30363D">{'─'.repeat(terminalWidth - 2)}</Text>
      </Box>


      {/* ── content：当前页 ── */}
      <Box flexGrow={1} flexDirection="row" overflow="hidden">
        <ShellProvider value={shell}>
          <ActiveComponent width={contentWidth} height={contentHeight} />
        </ShellProvider>
      </Box>


        {/* ── 分割线 ── */}
      <Box height={1} paddingX={1}>
        <Text color="#30363D">{'─'.repeat(terminalWidth - 2)}</Text>
      </Box>
      {/* ── 底栏：左侧键位 / 右侧反馈消息 ── */}
      <Box height={1} flexDirection="row" alignItems="center" paddingX={1}>
        {/*  左侧键位 */}
        {current.meta.hints.map(([k, label]) => (
          <Box key={k} flexDirection="row" marginRight={2}>
            <Text bold color="#E6EDF3">{k}</Text>
            <Text color="#57606A">{` ${label}`}</Text>
          </Box>
        ))}
        <Box flexGrow={1} />
        {/*  右侧反馈消息 */}
        {error && <Text bold color="#FF7B72">✗ {error}</Text>}
        {!error && message && <Text bold color="#56D364">✓ {message}</Text>}
      </Box>
    </Box>
  );
}
