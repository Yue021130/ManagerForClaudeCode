# ManagerForClaudeCode

> Claude Code 的终端管理工具（React + Ink + TypeScript）

当前处于**骨架状态**：页面导航框架已完成（顶栏 Tab / 数字键切页 / 底栏键帽 / 启动页 / 退出画面），三个页面是占位页，功能逐个填充中。

## 仓库结构：三个子项目

| 目录 | 子项目 | 说明 |
|------|--------|------|
| `src/`（本目录） | **ManagerForClaudeCode 本体** | React + Ink + TypeScript 终端 TUI，本文档描述对象 |
| `claude-code-router/` | **CCR 魔改 fork**（git submodule） | [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) 的 fork，带本地补丁。`main` 跟踪上游，`custom` 维护补丁，见 [docs/PATCHES.md](./docs/PATCHES.md) |
| `ccr-tray/` | **CCRTray 托盘（Electron + TS）** | 常驻系统托盘监控 ccr 服务，见 [ccr-tray/README.md](./ccr-tray/README.md) |

## 页面规划（占位中，功能未实现）

| 按键 | 页面 | 规划功能 |
|------|------|---------|
| `1` | HISTORY | Claude Code 历史对话管理：项目 × 会话列表 / 搜索 / 预览 / 删除 / 归档 / 导出 |
| `2` | PLUGINS | MCP / Skills / 插件统一分类管理（编程类/逆向类…），一键拔插：不用的移入备份池、要用的载入，减少无用上下文 |
| `3` | SETTING | 设置 |

全局键：`Esc` 退出，数字键切页；页面自己的按键由页面组件自治。

## 启动 / 退出画面

- **启动页**：全屏居中 MFCC 字符画渐显 → 呼吸动画（提示行常亮）→ 回车进入 / Esc 直接退出；终端 resize 实时重排
- **退出画面**：完全清屏 → 左上角紧凑字符画渐显 → 定格，附本次使用时长与自定义文案

两者都是纯 ANSI 直写 stdout（不经过 Ink），字符画与文案常量在 `src/shell/goodbye.ts` / `src/shell/splash.ts` 顶部，随改随用。

## 使用

```bash
npm install
npm run build  
npm start        
npm run dev       
```

全局安装（可选）：

```bash
npm link
mcp-manager
```

## 项目结构

```
src/
├── cli.tsx                      # 入口：启动页 → Ink 应用 → 退出画面
├── App.tsx                      # 纯外壳：顶栏 Tab / content / 底栏，全局键（Esc、数字切页）
├── types.ts                     # 框架契约类型：PageMeta / PageProps / PageEntry / ShellValue
├── shell/
│   ├── context.ts               # useShell()：外壳 → 页面的反馈/尺寸通道
│   ├── splash.ts                # 启动页（纯 ANSI，呼吸动画 + 回车等待）
│   └── goodbye.ts               # 退出画面（纯 ANSI，紧凑字符画 + 时长）
├── pages/
│   ├── registry.ts              # 页面注册表（加页面只改这里）
│   ├── HISTORYPage.tsx          # 1 · 占位
│   ├── PLUGINSPage.tsx          # 2 · 占位
│   └── SETTINGPage.tsx          # 3 · 占位
├── hooks/
│   ├── useScrollableList.ts     # 虚拟滚动 Hook
│   └── useTerminalSize.ts       # 终端尺寸自适应 Hook（resize 订阅）
└── components/                  # 7 个通用 UI 积木（ScrollableList / DetailPanel / 等）
```

架构原则：**外壳通用，页面自治**。加一个页面 = 建一个导出 `meta + 组件` 的文件 + 注册表加一行。详细契约见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

## 技术栈

- **React 19** — UI 框架
- **Ink 6** — React for CLIs
- **TypeScript 7** — 类型与编译
- **Chalk 5** — 终端颜色



---

## 子项目：CCRTray 托盘

`ccr-tray/` 是独立的桌面托盘程序（Electron + TypeScript），与本 CLI 互不依赖：

```bash
cd ccr-tray
npm install
npm run dev        # esbuild 打包 + electron 启动
npm run dist       # electron-builder 打 NSIS 安装包
```

详细说明见 [ccr-tray/README.md](./ccr-tray/README.md)。
