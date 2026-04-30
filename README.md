# MCP Skills Manager

> 统一管理 Claude Code、Gemini 等 CLI 的 MCP 服务器、Skills 和 CCR 路由规则

一个基于 React + Ink 的终端 CLI 工具。在多 CLI 环境下，一份 MCP 配置往往需要手动同步到多个配置文件 — 这个工具解决了这个问题。

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D16-green)
![License](https://img.shields.io/badge/license-ISC-orange)

## 功能特性

**五大功能页面：**

| 页面 | 功能 |
|------|------|
| MCP | 查看/启用/禁用/删除 MCP 服务器，跨 CLI 同步配置 |
| Skills | 查看/启用/禁用 Claude Code 插件（Skills） |
| Trash | 回收站 — 已删除 MCP 可恢复 |
| CCR | 管理 Claude Code Router 的 Provider 和路由规则 |
| Settings | 查看检测到的 CLI、配置文件路径、版本信息 |

**核心能力：**
- 自动检测已安装的 CLI（Claude Code / Gemini Code Assist）
- 跨 CLI 同步 MCP 配置 — 一份配置自动复制到所有 CLI
- 回收站机制 — 删除的 MCP 配置可恢复
- 自动备份 — 每次修改操作前备份到 `~/.claude-backups/`（保留最近 10 份）
- API Key 脱敏显示

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
| `↑` / `↓` | 导航列表 |
| `Tab` / `←` / `→` | 切换面板焦点（MCP / CCR 页面） |
| `Enter` / `Space` | 执行操作 |
| `1` `2` `3` `4` `5` | 切换页面 |
| `d` | 删除选中项（MCP 页面） |
| `s` | 显示/隐藏 API Key（CCR 页面） |
| `r` | 刷新配置 |
| `q` | 退出 |

## 项目结构

```
src/
├── cli.js                      # CLI 入口 — 挂载 React 应用到终端
├── App.js                      # 根组件 — 全局状态 + 键盘路由 + 页面调度
├── ConfigManager.js            # 核心服务 — MCP/Skills CRUD + 跨 CLI 聚合 + 备份
├── ManagerConfig.js            # 本工具配置 — 回收站管理
├── CcrConfigManager.js         # CCR 路由 — Provider 和 Router 规则管理
├── theme.js                    # 色彩方案 + 页面元信息 + 数据脱敏
├── constants/
│   └── cliNames.js             # CLI ID → 显示名称映射
├── hooks/
│   └── useScrollableList.js    # 虚拟滚动 Hook
├── pages/
│   ├── MCPPage.js              # MCP 服务器管理页
│   ├── SkillsPage.js           # Skills 管理页
│   ├── TrashPage.js            # 回收站页
│   ├── CCRPage.js              # CCR 路由管理页
│   └── SettingsPage.js         # 系统信息页
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
| `~/.claude/plugins/installed_plugins.json` | Claude Code 的 Skills 插件记录 |
| `~/.gemini/settings.json` | Gemini Code Assist 配置 |
| `~/.claude-code-router/config.json` | CCR 路由配置 |
| `~/.gwyy_ms_Manager.json` | 本工具自身配置（回收站等） |
| `~/.claude-backups/` | 自动备份目录（保留最近 10 份） |

## 技术栈

- **React 19** — UI 框架
- **Ink 6.8** — React for CLIs（终端渲染引擎）
- **Chalk 5.6** — 终端颜色
- **Babel 7** — JSX 编译
- **Node.js ES Modules** — 模块系统

## 开发计划

- [x] MCP 服务器管理（查看/启用/禁用/删除/跨CLI同步）
- [x] Skills 管理（查看/启用/禁用）
- [x] 回收站（删除恢复）
- [x] CCR 路由管理
- [x] 配置备份机制
- [ ] 添加新 MCP 服务器（交互式表单）
- [ ] 编辑 MCP 服务器配置
- [ ] 搜索/过滤
- [ ] 批量操作
- [ ] MCP 服务器连接测试
- [ ] 导入/导出配置
- [ ] 支持更多 CLI（Cursor、Continue 等）

## 注意事项

此工具会修改 `~/.claude.json` 等配置文件。工具内置自动备份功能，备份保存在 `~/.claude-backups/` 目录。手动修改前建议也做好备份。

## License

ISC
