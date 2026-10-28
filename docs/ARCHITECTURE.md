# ManagerForClaudeCode — 架构文档

## 1. 项目概述

基于 **React + Ink** 的终端 TUI 骨架。当前处于骨架状态：只保留页面导航框架，3 个页面（HISTORY / PLUGINS / SETTING）为占位页，待逐个填充。

| 维度 | 技术选型 |
|------|---------|
| UI 框架 | React 19 |
| 终端渲染 | Ink 6（React for terminals） |
| 构建 | TypeScript（tsc，strict，输出到 dist/） |
| 模块 | ES Modules |

---

## 2. 架构总览

```
┌──────────────────────────────────────────────┐
│ cli.tsx (入口)                                 │
│ render(<App/>) — Ink 挂载，接管终端            │
└───────────────────┬──────────────────────────┘
                    │
┌───────────────────▼──────────────────────────┐
│ App.tsx (纯外壳，~100 行，不认识任何具体页面)    │
│                                              │
│  顶栏：页面胶囊 Tab + 反馈消息(message/error)   │
│  ─────────────────────────────────────────   │
│  content：渲染当前页 Component                 │
│  ─────────────────────────────────────────   │
│  底栏：当前页 hints + esc quit                  │
│                                              │
│  全局键：Esc 退出 / 数字键切页                   │
│  下发：ShellProvider { width, height,        │
│         setMessage, setError }               │
└───────────────────┬──────────────────────────┘
                    │ 遍历
        ┌───────────▼────────────┐
        │ pages/registry.ts      │  ← 加页面只改这里
        │ PAGE_REGISTRY = [      │
        │   { key, meta,         │
        │     Component }, ...   │
        │ ]                      │
        └───────────┬────────────┘
        ┌──────┬────┴───┬────────┐
        ▼      ▼        ▼        ▼
     HISTORYPage PLUGINSPage SETTINGPage   （各自 useInput 管自己的按键）
        │
        ▼
  components/ + hooks/（通用积木，见 §4）
```

核心原则：**外壳通用，页面自治**。App.tsx 不 import 任何页面实现，只遍历注册表；页面不感知外壳布局，只拿 `width/height` 渲染 content 区域。

---

## 3. 页面契约（填充新页面只要两步）

### 3.1 页面文件必须导出两样东西

```tsx
// src/pages/XxxPage.tsx
import { Box, Text, useInput } from 'ink';
import type { PageMeta, PageProps } from '../types.js';
import { useShell } from '../shell/context.js';

export const meta: PageMeta = {
  num: 5,                              // 数字键 1-9，全局切页用（不可重复）
  label: 'XXX',                        // 顶栏 Tab 显示名
  color: '#D2A8FF',                    // Tab 胶囊高亮色（hex 或 ANSI 色名）
  hints: [['↑↓', 'nav'], ['↵', 'run']], // 底栏键帽；外壳自动追加 esc quit
};

export default function XxxPage({ width, height }: PageProps) {
  const { setMessage, setError } = useShell();  // 向顶栏发反馈

  useInput((input, key) => {
    // 页面自己的按键在这里处理
    // 注意：Esc 和已注册的数字键被外壳全局占用，页面收不到
  });

  return (/* content 区域内容，尺寸以 width/height 为准 */);
}
```

### 3.2 注册

```js
// src/pages/registry.ts
import * as XXX from './XxxPage.js';  // ESM 下 import 仍写 .js

export const PAGE_REGISTRY = [
  // ...原有页面
  { key: 'xxx', meta: XXX.meta, Component: XXX.default },
];
```

完事。不用动 App.tsx 或任何其他文件。

### 3.3 行为约定

- **按键隔离**：只有当前页被挂载（切页即卸载旧页，页面 state 不保留），所以各页面的 `useInput` 互不干扰。
- **反馈**：`setMessage('已保存')` → 顶栏右侧绿色 ✓；`setError('失败原因')` → 红色 ✗。用户按任意键自动清除。
- **尺寸**：`width/height` props 和 `useShell()` 里都有，已扣除顶栏/分割线/底栏（共 4 行）；终端拉伸时实时更新。

---

## 4. 通用积木（components/ + hooks/）

填充页面时优先复用，不要重造：

| 文件 | 用途 |
|------|------|
| `types.ts` | 框架契约类型：PageMeta / PageProps / PageEntry / ShellValue |
| `components/ScrollableList.tsx` | 虚拟滚动列表（超出屏幕只渲染可见窗口，↑N/↓N 指示） |
| `components/DetailPanel.tsx` | 右侧详情面板容器（标题 + 焦点指示 + 空态） |
| `components/SidebarLayout.tsx` | 左面板 + 竖线 + 右面板的两栏布局 |
| `components/SectionHeader.tsx` | `── 标题 ────` 区块分隔 |
| `components/StatusBadge.tsx` | ON / OFF 状态胶囊 |
| `components/ActionHint.tsx` | `❯ 标签` 操作提示行 |
| `components/VerticalDivider.tsx` | 面板间竖线 |
| `hooks/useTerminalSize.ts` | 终端尺寸 + resize 订阅（外壳已用，页面一般用 props 即可） |
| `hooks/useScrollableList.ts` | ScrollableList 的底层窗口计算 |

颜色不再集中管理（theme.js 已删）：直接在组件里写 hex 字面量，现有文件里的配色值可作为默认参照。

---

## 5. 构建与运行

```bash
npm run build    # tsc：src → dist（strict 全量类型检查）
npm run dev      # watch 模式
npm start        # build + node dist/cli.js
```

`bin` 名仍为 `mcp-manager`（遗留，骨架期不改）。

---

## 6. 历史说明

骨架化之前有完整业务实现（CCR 路由管理 / MCP 服务器移除恢复 / Skills 插件管理 / 自动备份），数据层为 `ConfigManager.js`（读写 `~/.claude.json` 与插件注册表）和 `CcrConfigManager.js`（读写 `~/.claude-code-router/config.json`）。已删除，可从 git 历史找回后挂到新页面里。
