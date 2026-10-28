import * as HISTORY from './HISTORYPage.js';
import * as PLUGINS from './PLUGINSPage.js';
import * as SETTING from './SETTINGPage.js';

/**
 * PAGE_REGISTRY — 页面注册表（外壳唯一认识页面的地方）
 *
 * 加页面 = 建一个 XxxPage.js（导出 meta + 默认组件）→ 在这里加一行。
 * App.js 只遍历此表渲染 Tab、派发数字键、渲染当前页，不认识任何具体页面。
 */
export const PAGE_REGISTRY = [
  { key: 'history', meta: HISTORY.meta, Component: HISTORY.default },
  { key: 'plugins', meta: PLUGINS.meta, Component: PLUGINS.default },
  { key: 'setting', meta: SETTING.meta, Component: SETTING.default }
];
