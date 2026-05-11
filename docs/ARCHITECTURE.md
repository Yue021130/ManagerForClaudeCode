# Claude Code Manager — 架构文档

## 1. 项目概述

**Claude Code Manager** 是一个基于 **React + Ink** 的终端 CLI 工具，**专用于 Claude Code**：以 CCR（Claude Code Router）路由管理为核心，同时管理 MCP 服务器配置与 Skills 插件。

| 维度 | 技术选型 |
|------|---------|
| UI 框架 | React 19 |
| 终端渲染 | Ink 6.8（React for terminals） |
| 构建 | Babel 7（JSX → Node.js） |
| 模块 | ES Modules |
| 运行时 | Node.js >= 16 |

---

## 2. 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                    cli.js (入口)                         │
│               render(<App/>) — Ink 挂载                  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    App.js (根组件)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  状态管理     │  │  键盘路由     │  │  条件渲染     │ │
│  │  15+ useState │  │  useInput    │  │  page → Page  │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
└──────┬──────────┬──────────┬──────────────┬─────────────┘
       │          │          │              │
       ▼          ▼          ▼              ▼
┌──────────┐ ┌──────┐  ┌────────┐  ┌──────────┐
│CCR (核心)│ │MCP   │  │Skills  │  │Settings  │
│Page      │ │Page  │  │Page    │  │Page      │
└────┬─────┘ └──┬───┘  └───┬────┘  └──────────┘
     │          │          │
     └──────────┼──────────┘
                │
   ┌────────────▼─────────────┐
   │    共享组件 (components/)  │
   │  SidebarLayout ScrollableList │
   │  DetailPanel   StatusBadge    │
   │  SectionHeader ActionHint     │
   │  VerticalDivider              │
   └────────────────────────────┘
                │
   ┌────────────▼─────────────┐
   │   服务层 (Service Layer)  │
   │  ┌────────────────────┐  │
   │  │ ConfigManager      │  │  ← 读写 ~/.claude.json
   │  │ (MCP + Skills)     │  │       ~/.claude/plugins/
   │  ├────────────────────┤  │
   │  │ CcrConfigManager   │  │  ← 读写 ~/.claude-code-router/config.json
   │  │ (路由规则)          │  │
   │  └────────────────────┘  │
   └─────────────────────────┘
                │
   ┌────────────▼─────────────┐
   │       文件系统             │
   │  ~/.claude.json           │
   │  ~/.claude/plugins/...    │
   │  ~/.claude-code-router/...│
   │  ~/.claude-backups/       │
   └──────────────────────────┘
```

---

## 3. 分层设计

### 3.1 入口层 — `cli.js`

```
cli.js
├── #!/usr/bin/env node       ← 可直接执行
├── import App               ← 根组件
└── render(<App />)           ← Ink 接管终端
```

唯一职责：**挂载 React 应用到终端**。Ink 自动处理全屏刷新、键盘输入捕获、退出清理。

### 3.2 应用层 — `App.js`

App.js 是整个应用的神经中枢，承担三个核心职责：

| 职责 | 实现 |
|------|------|
| **全局状态** | 15+ `useState`，覆盖导航、选择、数据、服务实例、UI 反馈 |
| **键盘路由** | 一个集中的 `useInput` 回调，按 `page → activeWindow → key` 三级分发 |
| **页面调度** | 4 个 Page 组件按 `page` 值条件渲染 |

**状态分类：**

```
导航层:  page, activeWindow
选择层:  selectedIndex, detailMenuIndex
数据层:  mcpServers, skills, ccrData
服务层:  configManager, ccrManager  (Manager 实例)
反馈层:  error, message, pendingDelete（删除确认）
CCR专属: ccrActiveWindow, ccrSelectedProvider, ccrSelectedRouterRule, ccrShowKeys, ccrEditMode, ccrEditSelected
```

**键盘输入处理流程：**

```
按键 → useInput
  ├── pendingDelete? → 模态确认（y 确认 / n、Esc 取消，其余全拦截）
  ├── q → exit()
  ├── Tab/←→ → 切换 activeWindow (MCP) 或 ccrActiveWindow (CCR)
  ├── 0-3 → 切换 page（CCR / MCP / Skills / Settings）
  ├── ↑↓ → 根据 page + activeWindow 移动选中索引
  ├── Enter → 根据 page + activeWindow 执行操作
  ├── d → MCP 快速删除（进入确认态）
  ├── s → CCR 切换 API Key 显示
  └── r → 刷新所有数据
```

**删除确认流（模态）：**

```
d / 菜单 Delete
  → setPendingDelete(name)        ← 进入确认态，其余按键全部拦截
  → MCPPage 底部渲染确认条 "Delete "xxx"? y=yes / n=no"
  → y: deleteMcpServer → 刷新 → 提示已删除
  → n / Esc: 取消
```

删除是**永久的**（无回收站）；安全兜底依赖写前自动备份（`~/.claude-backups/`，保留 10 份）。

### 3.3 服务层 — 两个 Manager

```
ConfigManager                CcrConfigManager
──────────────────────       ──────────────────────
管理 Claude Code 的配置       管理 CCR 路由配置

读取:                         读取:
 ~/.claude.json                ~/.claude-code-router/config.json
 ~/.claude/plugins/
 installed_plugins.json

职责:                         职责:
- MCP CRUD（删除永久）          - Provider 列表/详情
- Skills CRUD                  - Router 规则设置/清除
- 自动备份(10份)               - 路由值解析 "Provider,model"
                              - 自动备份(10份)
```

**安全设计 — 备份策略：**
每次写操作前自动备份到 `~/.claude-backups/`，保留最近 10 份。文件名格式：`{backupPrefix}-{ISO时间戳}.json`（`claude-config-` / `plugins-` / `ccr-config-` 前缀）。这是防止误操作的最后防线。

**数据视图 — getMcpServers()：**
直接映射 `~/.claude.json` 的 `mcpServers` 字段：

```
输入:  { mcpServers: { github: { type: "http", ..., disabled: false } } }

输出:  { github: { name: "github", enabled: true, config: {...} } }
```

### 3.4 UI 层 — Pages + Components

**页面组件（4 个，按键 0-3）：**

| 按键 | 页面 | 布局 | 核心功能 |
|------|------|------|---------|
| `0` | CCRPage | 自定义三栏 | Providers + 详情 + Router 规则（**核心页，启动默认**） |
| `1` | MCPPage | SidebarLayout (两栏) | MCP 列表 + 详情 + 删除确认条 |
| `2` | SkillsPage | SidebarLayout (两栏) | Skills 列表 + 详情 |
| `3` | SettingsPage | 单栏 | 检测状态 + 配置路径 + 版本 |

**共享组件（7 个）：**

| 组件 | 职责 |
|------|------|
| SidebarLayout | 左右分栏容器，内含 VerticalDivider |
| ScrollableList | 带虚拟滚动的列表，支持自定义 renderItem |
| DetailPanel | 详情面板容器（标题 + 焦点指示 + 空态） |
| StatusBadge | 启用/禁用状态标签 |
| SectionHeader | 区块分割线 `── 标题 ──` |
| ActionHint | 操作提示 `▸ 标签` |
| VerticalDivider | 竖线分隔符 `│` |

**MCP 页面的两栏布局：**

```
┌──────────────────┬───┬──────────────────────────────┐
│  MCP Servers     │ │ │  Details                     │
│  ▸ github      ● │ │ │  github                      │
│    filesystem  ○ │ │ │  Status Disabled              │
│                  │ │ │  ── Configuration ──          │
│                  │ │ │  type: http                   │
│                  │ │ │  url: https://...             │
│                  │ │ │  ── Actions ──                │
│                  │ │ │  ▸ Delete                     │
│                  │ │ │    Enable                     │
├──────────────────┴───┴──────────────────────────────┤
│ Delete "github"? y = yes / n = no   ← 确认态才显示   │
└─────────────────────────────────────────────────────┘
  activeWindow=0 (List)   activeWindow=1 (Details)
```

**CCR 页面的三栏布局：**

```
┌────────────┬──────────────────────┬────────────────┐
│ Providers  │ Provider             │ Router         │
│ ▸ provider1│  provider1           │ ▸ Default      │
│   provider2│  API Base ...        │     → p1,model │
│            │  API Key sk-1****xyz │   Think        │
│            │  Models ...          │     (not set)  │
└────────────┴──────────────────────┴────────────────┘
  ccrActiveWindow: 0=Providers 1=Detail 2=Router
```

### 3.5 工具层 — Hooks + Theme

| 模块 | 内容 |
|------|------|
| `hooks/useScrollableList` | 虚拟滚动计算：根据终端高度、选中索引计算可视窗口切片 |
| `hooks/useTerminalSize` | 终端尺寸自适应：订阅 stdout 'resize' 事件，尺寸变化驱动全树重渲染 |
| `theme.js` | 色彩方案、页面元信息（`PAGES` / `PAGE_META` / `MCP_WINDOWS`）、敏感数据脱敏函数 |

**自适应原理：** `stdout.columns/rows` 是普通属性，只在渲染时读一次，终端 resize 本身不会触发 React 重渲染。`useTerminalSize` 把尺寸存入 state 并订阅 `resize` 事件，尺寸一变 → App 重渲染 → 所有以 `terminalWidth/Height` 为 props 的页面（分栏宽度、虚拟滚动窗口、分隔线长度）即时重排。

---

## 4. 数据流

```
用户按键
  │
  ▼
App.js  useInput()
  │
  ├── 更新状态 (setPage, setSelectedIndex, ...)
  │     │
  │     ▼
  │   React 重渲染 → Page 组件更新
  │
  └── 操作数据 (调用 Manager)
        │
        ├── Manager.method()
        │     │
        │     ├── 修改内存中的 config 对象
        │     ├── backup()  ← 写前备份
        │     └── fs.writeFileSync()  ← 持久化
        │
        └── refreshData()
              │
              ├── Manager.reload()  ← 重新读文件
              └── setState()  ← 更新 UI
```

**关键模式：操作 → 持久化 → 刷新 → 反馈**

1. 调用 Manager 方法修改数据（内存 + 磁盘）
2. 调用 `refreshData()` 重新加载并更新 state
3. 设置 `message` / `error` 给用户反馈
4. React 自动重渲染 UI

---

## 5. 代码阅读指南

### 按功能线阅读

**想了解"MCP 删除是怎么实现的"？**
1. `App.js:useInput` → `d` 键或菜单 Delete 分支 → `setPendingDelete(name)`
2. 确认态按 `y` → `ConfigManager.deleteMcpServer()` → 从 `config.mcpServers` 删除
3. `ConfigManager.saveConfig()` → 备份 + 写文件
4. `App.js:refreshData()` → 重新加载，UI 更新

**想了解"CCR 路由设置是怎么实现的"？**
1. Router 面板选中规则按 `↵` → 无值进编辑模式，有值则清除
2. 编辑模式选择 Provider/Model → `CcrConfigManager.setRouterRule()`
3. 写入 `"ProviderName,model"` 格式到 `config.Router[ruleKey]`

**想了解"键盘导航如何工作"？**
1. `App.js:useInput` — 全局键盘处理
2. 三级分发：先判断 `page`，再判断 `activeWindow`，再判断按键
3. MCP 页面的 `activeWindow` 在 `MCP_WINDOWS.LIST/DETAILS` 间切换

### 按文件依赖阅读

```
cli.js
 └── App.js
       ├── ConfigManager.js   ← 核心，MCP/Skills/备份
       ├── CcrConfigManager.js ← 路由规则
       ├── theme.js           ← 纯配置
       └── pages/
             ├── CCRPage.js        ← 核心页，内置虚拟滚动
             ├── MCPPage.js
             ├── SkillsPage.js
             └── SettingsPage.js
                   └── components/
                         ├── SidebarLayout.js
                         ├── ScrollableList.js
                         ├── DetailPanel.js
                         ├── StatusBadge.js
                         ├── SectionHeader.js
                         ├── ActionHint.js
                         └── VerticalDivider.js
                               └── hooks/
                                     └── useScrollableList.js
```

### 复杂度热力图

```
高复杂度:  App.js (键盘路由 + 删除确认模态)
          ConfigManager.js (MCP/Skills, 备份)
          CCRPage.js (三栏 + 编辑模式 + 虚拟滚动)

中复杂度:  MCPPage.js (MCPDetailContent 子组件)
          CcrConfigManager.js

低复杂度:  SkillsPage.js, SettingsPage.js
          所有 components/ (纯展示)
          theme.js, cli.js
```

---

## 6. 扩展指南

**添加新页面:**
1. 创建 `src/pages/NewPage.js`
2. `theme.js` — 在 `PAGES` / `PAGE_META` 加元信息（分配按键编号）
3. `App.js` — 加 `useState`，加键盘处理，加渲染分支

**添加新组件:**
1. 创建 `src/components/NewComp.js`
2. 在需要的 Page 中 import 并使用
3. 如果组件有状态逻辑，可提取到 `src/hooks/`

**给 CCR 增加新的路由规则类型:**
1. `CcrConfigManager.js` — 在 `ROUTER_RULES` 数组加条目（key 对应 config.json Router 字段名）

---

## 7. 设计原则

1. **页面组件无状态** — 所有状态提升到 App.js，页面组件是纯渲染函数（接收 props，返回 JSX）
2. **Manager 无 UI 依赖** — 两个 Manager 可以脱离 React 独立使用，只依赖 Node.js fs/path
3. **写前备份** — 任何修改操作前自动备份，防止误操作不可逆
4. **删除必须确认** — 永久删除操作一律经过 y/n 模态确认
5. **常量驱动** — 页面编号、颜色方案、窗口索引都用命名常量，不用魔术数字
