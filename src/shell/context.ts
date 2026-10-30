import { createContext, useContext } from 'react';
import type { ShellValue } from '../types.js';

/**
 * ShellContext — 外壳下发给页面的通道  |  组件间传递数据的桥梁useContext
 *
 * App（外壳）渲染时提供：
 *   setMessage/setError — 页面向底栏发反馈（✓ 绿 / ✗ 红）
 *   setKeysEnabled     — 页面输入模式（搜索框）下禁用外壳数字切页
 *   （尺寸不走这里，页面从 props 拿 width/height，见 PageProps）
 *
 * 页面内使用：
 *   import { useShell } from '../shell/context.js';
 *   const { setMessage, setError, setKeysEnabled } = useShell();
 */
const ShellContext = createContext<ShellValue | null>(null);

export const ShellProvider = ShellContext.Provider;

export function useShell(): ShellValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell 必须在 App 外壳内使用'); // AI给的这个是什么意思啊？？？ 2026年10月30日09点38分
  return ctx;
}
