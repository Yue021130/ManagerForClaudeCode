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
 * - 顶栏：左侧页面 Tab（激活 = 粗体+下划线+页面主题色），右侧品牌文字
 * - 底栏：左侧当前页 meta.hints，右侧页面反馈消息（message/error）
 * - 全局键：Esc 退出、数字键按 meta.num 切页
 *   （页面自己的按键在页面组件内部用 useInput 处理——只有当前页被挂载，互不干扰）
 * - 布局：顶栏 / 分割线 / content / 分割线 / 底栏，终端 resize 即时重排
 * - 通过 ShellProvider 向页面下发 { width, height, setMessage, setError }
 */
export default function App() {
  const { exit } = useApp();

  // ── 导航状态：当前页 key，默认注册表第一项 ──
  const [pageKey, setPageKey] = useState(PAGE_REGISTRY[0].key);

  // ── 反馈状态：页面通过 useShell() 上报 ──
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const current = PAGE_REGISTRY.find(p => p.key === pageKey) || PAGE_REGISTRY[0];

  // ── 全局键盘：只处理退出与切页，其余按键留给页面自己 ──
  useInput((input, key) => {
    // 按任意键清除上次的反馈消息
    if (message) setMessage(null);
    if (error) setError(null);

    if (key.escape) { exit(); return; }

    const target = PAGE_REGISTRY.find(p => String(p.meta.num) === input);
    if (target) setPageKey(target.key);
  });

  const { width: terminalWidth, height: terminalHeight } = useTerminalSize();

  // content 区域尺寸：总高 - 顶栏1 - 分割线2 - 底栏1
  const shell = useMemo<ShellValue>(() => ({
    width: terminalWidth,
    height: Math.max(1, terminalHeight - 4),
    setMessage,
    setError
  }), [terminalWidth, terminalHeight]);

  const ActiveComponent = current.Component;

  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
      {/* ── 顶栏：左侧 Tab（粗体+下划线+页面色）/ 右侧品牌文字 ── */}
      <Box height={1} flexDirection="row" alignItems="center" paddingX={1}>
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
        <Text color="#57606A">{BRAND_TEXT}</Text>
      </Box>

      <Box height={1} paddingX={1}>
        <Text color="#30363D">{'─'.repeat(terminalWidth - 2)}</Text>
      </Box>

      {/* ── content：渲染当前页（切换即卸载旧页，状态不保留） ── */}
      <Box flexGrow={1} flexDirection="row" overflow="hidden">
        <ShellProvider value={shell}>
          <ActiveComponent width={shell.width} height={shell.height} />
        </ShellProvider>
      </Box>

      <Box height={1} paddingX={1}>
        <Text color="#30363D">{'─'.repeat(terminalWidth - 2)}</Text>
      </Box>

      {/* ── 底栏：左侧键位（键粗体亮 + 说明暗）/ 右侧反馈消息 ── */}
      <Box height={1} flexDirection="row" alignItems="center" paddingX={1}>
        {current.meta.hints.map(([k, label]) => (
          <Box key={k} flexDirection="row" marginRight={2}>
            <Text bold color="#E6EDF3">{k}</Text>
            <Text color="#57606A">{` ${label}`}</Text>
          </Box>
        ))}
        <Box flexGrow={1} />
        {error && <Text bold color="#FF7B72">✗ {error}</Text>}
        {!error && message && <Text bold color="#56D364">✓ {message}</Text>}
      </Box>
    </Box>
  );
}
