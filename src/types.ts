import type { ComponentType } from 'react';

/**
 * 框架契约类型 — 外壳与页面之间的接口
 *
 * 页面文件导出 meta: PageMeta + 默认组件
 * 在 pages/registry.ts 注册为 PageEntry。
 */

export interface PageMeta {
  num: number;                    // 数字键 1-9，全局切页用 | 不可重复
  label: string;                  // 顶栏 Tab 显示名
  color: string;                  // Tab 胶囊高亮色
  hints: [string, string][];      // 底栏键帽 [按键, 说明]
}

export interface PageProps {
  width: number;                  // content 区域尺寸（已扣除顶栏/分割线/底栏共 4 行）
  height: number;
}

export type PageComponent = ComponentType<PageProps>;

/* 页面注册泛型 */
export interface PageEntry {
  key: string;
  meta: PageMeta;
  Component: PageComponent;
}

/** 外壳通过 ShellProvider 下发给页面的通道（尺寸走 props，见 PageProps） */
export interface ShellValue {
  setMessage: (m: string | null) => void;   // 底栏右侧绿色 ✓
  setError: (e: string | null) => void;     // 底栏右侧红色 ✗
}
