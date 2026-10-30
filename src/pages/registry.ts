import type { PageEntry } from '../types.js';
import * as HISTORY from './HISTORYPage.js';
import * as PLUGINS from './PLUGINSPage.js';
import * as SETTING from './SETTINGPage.js';

/**
 * PAGE_REGISTRY — 页面注册表
 *
 * 🕸 加页面 = 建一个 XxxPage.tsx（导出 meta + 默认组件）→ 在这里加一行。
 *
 * App.tsx 只遍历此表渲染 Tab、派发数字键、渲染当前页，不认识任何具体页面。
 */
export const PAGE_REGISTRY: PageEntry[] = [
  { key: 'history', meta: HISTORY.meta, Component: HISTORY.default },
  { key: 'plugins', meta: PLUGINS.meta, Component: PLUGINS.default },
  { key: 'setting', meta: SETTING.meta, Component: SETTING.default }
];
