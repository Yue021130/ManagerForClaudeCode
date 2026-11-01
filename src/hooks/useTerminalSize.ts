import { useState, useEffect } from 'react';
import { useStdout } from 'ink';

// 终端可用尺寸兜底值：非 TTY（管道/重定向）时 stdout.columns 不存在
//   AI怎么老是写这种过度考虑优化 的 防御性代码 的代码 Yue0211302026年10月30日19点21分
const FALLBACK = { width: 120, height: 30 };

// 安全边距：有效宽度 = 物理宽度 - 1。
// 原因：截断行（meta 行/cwd 行 wrap="truncate"）末尾的「…」等字符顶在终端最右格时，
// 中文环境的 ConPTY 会把它渲染成 2 格 → 物理溢出硬换行 → ink 光标计数漂移 →
// 之后每帧错位重画（meta 行被反复重画、时间碎片飞散、徽章背景错位）。
// 留 1 列后任何行都够不到物理右缘，这类「边界宽字符」一次性兜住。
const SAFE_MARGIN = 1;

export interface TerminalSize {
  width: number;
  height: number;
}

/**
 * useTerminalSize — 终端尺寸自适应 Hook
 *
 * stdout.columns/rows 是普通属性，只在渲染时读一次；
 * 终端 resize 不会自动触发 React 重渲染。
 * 这里订阅 stdout 的 'resize' 事件，把尺寸存进 state，
 * 尺寸一变 → App 重渲染 → 所有以 terminalWidth/Height 为 props 的页面跟着重排。
 */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();

  // 参数是函数形式 () => ...（惰性初始化）：只在首次渲染时执行一次，避免每次渲染都重算
  const [size, setSize] = useState<TerminalSize>(() => ({
    width: (stdout?.columns || FALLBACK.width) - SAFE_MARGIN,
    height: stdout?.rows || FALLBACK.height
  }));

  // useEffect — 订阅 resize 事件
  /*
  *• 挂载时：stdout.on('resize', ...) 挂上监听。
     用户一拖窗口，Node 发出 resize 事件 → onResize 执行 → setSize 更新 state → React 检测到 state变了 → 重渲染 App
   • 清理函数：返回的 () => { stdout.off(...) } 在组件卸载时执行，防止内存泄漏和重复监听
   • 依赖数组 [stdout]：stdout 变了（理论上极少）才重新订阅
  * */
  useEffect(() => {
    if (!stdout) return;

    const onResize = () => {
      setSize({
        width: (stdout.columns || FALLBACK.width) - SAFE_MARGIN,
        height: stdout.rows || FALLBACK.height
      });
    };

    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  return size;
}
