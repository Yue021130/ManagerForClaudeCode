# Claude Code Manager

> 统一管理 Claude Code 的 CCR 路由、MCP 服务器与 Skill 插件

一个基于 React + Ink 的终端 CLI 工具，**专用于 Claude Code**。以 CCR（Claude Code Router）路由管理为核心，同时管理 MCP 服务器和 Skill 插件。

## 仓库结构：三个子项目

本仓库同时维护三个子项目：

| 目录 | 子项目 | 说明 |
|------|--------|------|
| `src/`（本目录各文件） | **ManagerForClaudeCode 本体** | 就是下面文档描述的这个 React + Ink 终端 CLI |
| `claude-code-router/` | **CCR 魔改 fork**（git submodule） | [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) 的 fork，带 5 处本地补丁（隐藏启动窗口、禁用桌面应用探测、子进程超时等）。`main` 分支跟踪上游，`custom` 分支维护补丁，清单与更新流程见 [docs/PATCHES.md](./docs/PATCHES.md) |
| `ccr-tray/` | **CCRTray 托盘（C# 版）** | Windows 任务栏托盘程序（C# 单文件），显示 ccr 服务运行状态，双击打开管理界面。改完用 `build.bat` 重新编译 |
| `ccr-tray-ts/` | **CCRTray 托盘（TS 重写，进行中）** | 跨平台（Windows + Linux）托盘重写：TypeScript 纯逻辑核心（状态轮询 / 启停 / 自启）+ 平台无关托盘壳接口，第一阶段用 Electron 壳实现。C# 版保留为行为基准 |

## 功能特性

**四个功能页面（按键 `0`-`3` 切换）：**

| 按键 | 页面      | 功能                                                  |
|------|---------|-----------------------------------------------------|
| `0` | CCR     | **核心页** — 管理 Claude Code Router 的 Provider 和 Router |
| `1` | MCP     | 查看/暂时移除/恢复 MCP 服务器                                 |
| `2` | SKILL   | 查看/暂时移除/恢复 Skill 插件                                   |
| `3` | SETTING | 查看检测状态、配置文件路径、储存路径等                                 |

**核心能力：**
- CCR 路由管理 — 为不同任务类型（默认/思考/长上下文/搜索等）指定 Provider+Router+Model
- MCP 服务器管理 — 暂时移除/恢复（移除的配置存入 `~/.claude-removed-mcp.json` 移除池，无永久删除）
- API Key 脱敏显示
- 自动备份 — 每次修改操作前备份到 `~/.claude-backups/`（保留最近 10 份）

## 安装

```bash
# 安装依赖
npm install

# 编译项目
npm run build
```

## 使用

```bash
# 启动应用
npm start

# 或直接运行
node dist/cli.js

# 开发模式（自动监听文件变化）
npm run dev
```

全局安装（可选）：
```bash
npm link
mcp-manager
```

## 快捷键

| 按键 | 功能 |
|------|------|
| `0` `1` `2` `3` | 切换页面（CCR / MCP / Skills / Settings） |
| `↑` / `↓` | 导航列表 |
| `Tab` / `←` / `→` | 切换面板焦点（MCP / CCR 页面） |
| `Enter` / `Space` | 执行操作 |
| `d` | 暂时移除选中 MCP（进入确认态） |
| `y` / `n` | 确认 / 取消暂时移除 |
| `s` | 显示/隐藏 API Key（CCR 页面） |
| `r` | 刷新配置 |
| `q` | 退出 |

## 项目结构（ManagerForClaudeCode 本体）

```
src/
├── cli.js                      # CLI 入口 — 挂载 React 应用到终端
├── App.js                      # 根组件 — 全局状态 + 键盘路由 + 页面调度
├── ConfigManager.js            # 核心服务 — MCP/Skills CRUD + 备份
├── CcrConfigManager.js         # CCR 路由 — Provider 和 Router 规则管理
├── theme.js                    # 色彩方案 + 页面元信息 + 数据脱敏
├── hooks/
│   ├── useScrollableList.js    # 虚拟滚动 Hook
│   └── useTerminalSize.js      # 终端尺寸自适应 Hook（resize 订阅）
├── pages/
│   ├── CCRPage.js              # CCR 路由管理页（核心）
│   ├── MCPPage.js              # MCP 服务器管理页
│   ├── SKILLPage.js            # SKILL 管理页
│   └── SETTINGPage.js          # 系统设置信息页
└── components/
    ├── SidebarLayout.js        # 左右分栏布局
    ├── ScrollableList.js       # 带虚拟滚动的列表
    ├── DetailPanel.js          # 详情面板容器
    ├── StatusBadge.js          # 启用/禁用状态标签
    ├── SectionHeader.js        # 区块分割线
    ├── ActionHint.js           # 操作提示
    └── VerticalDivider.js      # 竖线分隔符
```

> 详细架构说明见 [ARCHITECTURE.md](./ARCHITECTURE.md)

## 配置文件

| 路径 | 说明 |
|------|------|
| `~/.claude.json` | Claude Code 的 MCP 服务器配置 |
| `~/.claude/plugins/installed_plugins.json` | Claude Code 的 Skill 插件记录 |
| `%APPDATA%\claude-code-router\config.sqlite` | CCR 路由配置（v3.1.3+ 起由 sqlite 存储；`request-logs.sqlite` 等为日志，见 [docs/PATCHES.md](./docs/PATCHES.md)） |
| `~/.claude-backups/` | 自动备份目录（保留最近 10 份） |

## 子项目：CCRTray 托盘

`ccr-tray/` 是一个独立的 Windows 托盘程序，与 CLI 互不依赖：

```powershell
cd ccr-tray
.\build.bat        # 需要 .NET Framework 的 csc 编译器，产出 CCRTray.exe
```

托盘图标颜色指示 ccr 服务状态（绿=运行 / 红=停止 / 黄=启动中），右键菜单可启动、停止、打开管理界面（自动探测 3458 端口）。

跨平台重写版在 `ccr-tray-ts/`（TypeScript，Electron 壳第一阶段），开发体验证：

```bash
cd ccr-tray-ts
npm install
npm run dev        # esbuild 打包 + electron 启动，看任务栏托盘图标与右键菜单
```

后续计划：Electron 壳验证通过后，可换成 koffi（Windows）/ D-Bus（Linux）原生托盘后端以缩减体积（接口已隔离在 `src/shell/`）。

## 技术栈

- **React 19** — UI 框架
- **Ink 6.8** — React for CLIs（终端渲染引擎）
- **Chalk 5.6** — 终端颜色
- **Babel 7** — JSX 编译
- **Node.js ES Modules** — 模块系统

## 开发计划

- [x] CCR 路由管理（Provider 查看、路由规则设置/清除）
- [x] MCP 服务器管理（查看/暂时移除/恢复）
- [x] Skills 管理（查看/暂时移除/恢复）
- [x] 暂时移除确认（y/n）
- [x] 配置备份机制
- [ ] 添加新 MCP 服务器（交互式表单）
- [ ] 编辑 MCP 服务器配置
- [ ] CCR Provider 增删改
- [ ] 搜索/过滤
- [ ] MCP 服务器连接测试

## 注意事项

此工具会修改 `~/.claude.json` 等配置文件。所有移除操作都是**暂时移除**而非永久删除：MCP 配置会完整移入 `~/.claude-removed-mcp.json` 移除池，Skills 只置 `disabled` 标志，两者都可在界面中一键恢复。每次写操作前仍会自动备份到 `~/.claude-backups/`（保留最近 10 份）作为最后防线。手动修改前建议也做好备份。
