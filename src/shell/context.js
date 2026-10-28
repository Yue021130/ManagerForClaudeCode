import React, { createContext, useContext } from 'react';

/**
 * ShellContext — 外壳下发给页面的通道
 *
 * App（外壳）渲染时提供：
 *   width/height — content 区域尺寸（已扣除顶栏/分割线/底栏）
 *   setMessage   — 页面向顶栏发成功反馈（✓ 绿色）
 *   setError     — 页面向顶栏发失败反馈（✗ 红色）
 *
 * 页面内使用：
 *   import { useShell } from '../shell/context.js';
 *   const { width, height, setMessage, setError } = useShell();
 */
const ShellContext = createContext(null);

export const ShellProvider = ShellContext.Provider;

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell 必须在 App 外壳内使用');
  return ctx;
}
