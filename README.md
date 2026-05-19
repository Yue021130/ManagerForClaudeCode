# Claude Code Manager

> 统一管理 Claude Code 的 CCR 路由、MCP 服务器与 Skill 插件

一个基于 React + Ink 的终端 CLI 工具，**专用于 Claude Code**。以 CCR（Claude Code Router）路由管理为核心，同时管理 MCP 服务器和 Skill 插件。


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

## 项目结构

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
| `~/.claude-code-router/config.json` | CCR 路由配置 |
| `~/.claude-backups/` | 自动备份目录（保留最近 10 份） |

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
