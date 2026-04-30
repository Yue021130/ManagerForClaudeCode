# MCP Skills Manager — 架构文档

## 1. 项目概述

**MCP Skills Manager** 是一个基于 **React + Ink** 的终端 CLI 工具，用于统一管理多个 AI 编程助手（Claude Code、Gemini Code Assist）的 MCP 服务器配置、Skills 插件以及 Claude Code Router 路由规则。

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
│  │  20+ useState │  │  useInput    │  │  page → Page  │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
└──┬───────────┬──────────┬───────────┬───────────┬───────┘
   │           │          │           │           │
   ▼           ▼          ▼           ▼           ▼
┌──────┐ ┌──────┐  ┌──────┐  ┌──────┐  ┌──────────┐
│MCP   │ │Skills│  │Trash │  │CCR   │  │Settings  │
│Page  │ │Page  │  │Page  │  │Page  │  │Page      │
└──┬───┘ └──┬───┘  └──┬───┘  └──┬───┘  └──────────┘
   │        │         │         │
   └────────┼─────────┼─────────┘
            │         │
   ┌────────▼─────────▼─────────┐
   │    共享组件 (components/)    │
   │  SidebarLayout  ScrollableList │
   │  DetailPanel    StatusBadge   │
   │  SectionHeader  ActionHint    │
   │  VerticalDivider              │
   └──────────────────────────────┘
            │
   ┌────────▼────────────────────┐
   │   服务层 (Service Layer)     │
   │  ┌──────────────────────┐   │
   │  │ ConfigManager        │   │  ← 读写 ~/.claude.json
   │  │ (MCP + Skills)       │   │       ~/.gemini/settings.json
   │  ├──────────────────────┤   │
   │  │ ManagerConfig        │   │  ← 读写 ~/.gwyy_ms_Manager.json
   │  │ (回收站 + 本工具配置) │   │
   │  ├──────────────────────┤   │
   │  │ CcrConfigManager     │   │  ← 读写 ~/.claude-code-router/config.json
   │  │ (路由规则)            │   │
   │  └──────────────────────┘   │
   └────────────────────────────┘
            │
   ┌────────▼────────────────────┐
   │       文件系统               │
   │  ~/.claude.json              │
   │  ~/.claude/plugins/...       │
   │  ~/.gemini/settings.json     │
   │  ~/.claude-code-router/...   │
   │  ~/.gwyy_ms_Manager.json     │
   │  ~/.claude-backups/          │
   └─────────────────────────────┘
```

---

## 3. 分层设计

### 3.1 入口层 — `cli.js`

```
cli.js (6 行)
├── #!/usr/bin/env node       ← 可直接执行
├── import App               ← 根组件
└── render(<App />)           ← Ink 接管终端
```

唯一职责：**挂载 React 应用到终端**。Ink 自动处理全屏刷新、键盘输入捕获、退出清理。

### 3.2 应用层 — `App.js`

App.js 是整个应用的神经中枢，承担三个核心职责：

| 职责 | 实现 |
|------|------|
| **全局状态** | 20+ `useState`，覆盖导航、选择、数据、服务实例、UI 反馈 |
| **键盘路由** | 一个 300 行的 `useInput` 回调，按 `page → activeWindow → key` 三级分发 |
| **页面调度** | 5 个 Page 组件按 `page` 值条件渲染 |

**状态分类：**

```
导航层:  page, activeWindow
选择层:  selectedIndex, cliSelectedIndex, detailMenuIndex
数据层:  mcpServers, skills, trash, ccrData
服务层:  configManager, managerConfig, ccrManager  (Manager 实例)
反馈层:  error, message
CCR专属: ccrActiveWindow, ccrSelectedProvider, ccrSelectedRouterRule, ccrShowKeys, ccrEditMode, ccrEditSelected
```

**键盘输入处理流程：**

```
按键 → useInput
  ├── q → exit()
  ├── Tab/←→ → 切换 activeWindow (MCP) 或 ccrActiveWindow (CCR)
  ├── 1-5 → 切换 page
  ├── ↑↓ → 根据 page + activeWindow 移动选中索引
  ├── Enter → 根据 page + activeWindow 执行操作
  ├── d → MCP 快速删除
  ├── s → CCR 切换 API Key 显示
  └── r → 刷新所有数据
```

### 3.3 服务层 — 三个 Manager

```
ConfigManager          ManagerConfig          CcrConfigManager
────────────────────   ────────────────────   ──────────────────────
管理 CLI 的配置文件     管理本工具自身配置       管理 CCR 路由配置

读取:                  读取:                   读取:
 ~/.claude.json        ~/.gwyy_ms_Manager     ~/.claude-code-router
 ~/.gemini/settings    .json                  /config.json
 .json
 ~/.claude/plugins/
 installed_plugins
 .json

职责:                  职责:                   职责:
- MCP CRUD             - 回收站 (trash)        - Provider 列表
- Skills CRUD          - 本工具设置            - Router 规则 CRUD
- 跨 CLI 同步          - 恢复/清除              - 路由值解析
- 自动备份(10份)       - 序列化                - 自动备份(10份)
```

**安全设计 — 备份策略：**
每次写操作前自动备份到 `~/.claude-backups/`，保留最近 10 份。文件名格式：`{cli}-{configName}-{ISO时间戳}.json`。这是防止误操作的最后防线。

**数据聚合 — getMcpServers()：**
底层 Claude 和 Gemini 各自维护独立的 `mcpServers` 对象，`getMcpServers()` 跨 CLI 合并同名 MCP，返回聚合视图：

```
输入:  claude: { mcpServers: { github: {..., disabled: false} } }
       gemini: { mcpServers: { github: {..., disabled: true } } }

输出:  { github: {
         name: "github",
         clis: {
           claude: { enabled: true,  config: {...} },
           gemini: { enabled: false, config: {...} }
         }
       }}
```

### 3.4 UI 层 — Pages + Components

**页面组件（5 个）：**

| 页面 | 布局 | 核心功能 |
|------|------|---------|
| MCPPage | SidebarLayout (三栏) | MCP 列表 + 详情 + 关联 CLI |
| SkillsPage | SidebarLayout (两栏) | Skills 列表 + 详情 |
| TrashPage | SidebarLayout (两栏) | 回收站列表 + 恢复 |
| CCRPage | 自定义三栏 | Providers + 详情 + Router 规则 |
| SettingsPage | 单栏 | 系统信息展示 |

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

**MCP 页面的三栏布局：**

```
┌──────────────────┬───┬──────────────────────────────┐
│  MCP Servers     │ │ │  Details                     │
│  ▸ github      ● │ │ │  github                      │
│    filesystem  ○ │ │ │  Status Disabled              │
│                  │ │ │  ── Configuration ──          │
│                  │ │ │  type: http                   │
│                  │ │ │  url: https://...             │
│                  │ │ │  ── Associated CLIs ──        │
│                  │ │ │  ● Claude Code       [↵]     │
│                  │ │ │  ○ Gemini Code Assist         │
│                  │ │ │  ── Actions ──                │
│                  │ │ │  ▸ Sync to all CLIs           │
│                  │ │ │    Delete (move to trash)     │
│                  │ │ │    Enable                     │
└──────────────────┴───┴──────────────────────────────┘
  activeWindow=0          activeWindow=1  (Detail)
                          activeWindow=2  (Params)
```

### 3.5 工具层 — Hooks + Theme + Constants

| 模块 | 内容 |
|------|------|
| `hooks/useScrollableList` | 虚拟滚动计算：根据终端高度、选中索引计算可视窗口切片 |
| `theme.js` | 色彩方案、页面元信息、敏感数据脱敏函数 |
| `constants/cliNames.js` | CLI ID → 显示名称映射 |

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
        │     ├── createBackup()  ← 写前备份
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

**想了解"MCP 启用/禁用是怎么实现的"？**
1. `App.js:useInput` → 找到 `toggle` action 分支（line ~238）
2. `ConfigManager.toggleMcpServer()` → 翻转 `disabled` 字段 + 保存
3. `ConfigManager.saveConfig()` → 备份 + 写文件
4. `App.js:refreshData()` → 重新加载，UI 更新

**想了解"键盘导航如何工作"？**
1. `App.js:useInput` — 300 行的全局键盘处理
2. 三级分发：先判断 `page`，再判断 `activeWindow`，再判断按键
3. MCP 页面的 `activeWindow` 在 `MCP_WINDOWS.LIST/DETAILS/PARAMS` 间切换

**想了解"虚拟滚动怎么实现"？**
1. `hooks/useScrollableList.js` — 纯计算逻辑（useMemo）
2. `ScrollableList.js` — 渲染可见窗口 + 溢出指示器
3. 策略：选中项居中，上下各 `floor(listVisible/2)` 项

### 按文件依赖阅读

```
cli.js
 └── App.js
       ├── ConfigManager.js  ← 核心，最复杂
       │     └── constants/cliNames.js
       ├── ManagerConfig.js  ← 简单，回收站
       ├── CcrConfigManager.js ← 中等，路由
       ├── theme.js          ← 纯配置
       └── pages/
             ├── MCPPage.js       ← 最复杂的页面
             ├── SkillsPage.js
             ├── TrashPage.js
             ├── CCRPage.js       ← 内置虚拟滚动
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
高复杂度:  App.js (键盘路由, 20+ state)
          ConfigManager.js (多 CLI, 备份, 聚合)
          CCRPage.js (三栏 + 编辑模式 + 虚拟滚动)

中复杂度:  MCPPage.js (MCPDetailContent 子组件)
          CcrConfigManager.js

低复杂度:  SkillsPage.js, TrashPage.js, SettingsPage.js
          所有 components/ (纯展示)
          ManagerConfig.js, theme.js, cli.js
```

---

## 6. 扩展指南

**添加新 CLI 支持（如 Cursor）:**
1. `ConfigManager.js` — `SUPPORTED_CLIS` 加 key，`detectAndLoadCLIs` 加检测逻辑
2. `constants/cliNames.js` — 加显示名
3. `theme.js` 可选 — 如果有特殊配置路径

**添加新页面:**
1. 创建 `src/pages/NewPage.js`
2. `App.js` — 在 `PAGES` 加常量，加 `useState`，加键盘处理，加渲染分支
3. `theme.js` — 在 `PAGE_META` 加元信息

**添加新组件:**
1. 创建 `src/components/NewComp.js`
2. 在需要的 Page 中 import 并使用
3. 如果组件有状态逻辑，可提取到 `src/hooks/`

---

## 7. 设计原则

1. **页面组件无状态** — 所有状态提升到 App.js，页面组件是纯渲染函数（接收 props，返回 JSX）
2. **Manager 无 UI 依赖** — 三个 Manager 可以脱离 React 独立使用，只依赖 Node.js fs/path
3. **写前备份** — 任何修改操作前自动备份，防止误操作不可逆
4. **深拷贝同步** — 跨 CLI 复制配置时用 `JSON.parse(JSON.stringify())` 避免共享引用
5. **常量驱动** — 页面编号、颜色方案、窗口索引都用命名常量，不用魔术数字
