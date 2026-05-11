import { useState, useEffect } from 'react';
import { useStdout } from 'ink';

// 终端可用尺寸兜底值：非 TTY（管道/重定向）时 stdout.columns 不存在
const FALLBACK = { width: 120, height: 30 };

/**
 * useTerminalSize — 终端尺寸自适应 Hook
 *
 * stdout.columns/rows 是普通属性，只在渲染时读一次；
 * 终端 resize 不会自动触发 React 重渲染。
 * 这里订阅 stdout 的 'resize' 事件，把尺寸存进 state，
 * 尺寸一变 → App 重渲染 → 所有以 terminalWidth/Height 为 props 的页面跟着重排。
 */
export function useTerminalSize() {
  const { stdout } = useStdout();
  const [size, setSize] = useState(() => ({
    width: stdout?.columns || FALLBACK.width,
    height: stdout?.rows || FALLBACK.height
  }));

  useEffect(() => {
    if (!stdout) return;

    const onResize = () => {
      setSize({
        width: stdout.columns || FALLBACK.width,
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
