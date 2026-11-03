# ManagerForClaudeCode

> 面向 Claude Code 的本地终端管理工具，基于 React、Ink 与 TypeScript 构建。

ManagerForClaudeCode（简称 MFCC）当前的核心能力是 **Claude Code 历史会话管理**：直接读取本机 `~/.claude/projects/` 中的 JSONL 会话记录，在终端内完成项目浏览、会话搜索、对话预览、标题重命名、Markdown 导出、删除、归档与会话恢复。

本仓库同时包含 CCR 的定制 fork 和 CCRTray 桌面托盘程序。三者位于同一代码仓库，但**主程序、CCR fork、CCRTray 分别安装和运行，互不依赖**。

## 目录

- [当前状态](#当前状态)
- [主要功能](#主要功能)
- [仓库组成](#仓库组成)
- [环境要求](#环境要求)
- [安装与启动](#安装与启动)
- [HISTORY 使用指南](#history-使用指南)
- [完整快捷键](#完整快捷键)
- [数据路径与文件变更](#数据路径与文件变更)
- [会话恢复机制](#会话恢复机制)
- [启动与退出画面](#启动与退出画面)
- [项目结构](#项目结构)
- [架构与开发](#架构与开发)
- [CCR 与 CCRTray 子项目](#ccr-与-ccrtray-子项目)
- [故障排查](#故障排查)
- [实现边界与注意事项](#实现边界与注意事项)

## 当前状态

| 页面 | 数字键 | 状态 | 当前能力 |
|---|---:|---|---|
| HISTORY | `1` | 已实现 | 项目与会话浏览、跨项目标题搜索、对话与工具调用预览、完整详情、删除、归档、导出、重命名、恢复会话、实时刷新 |
| PLUGINS | `2` | 占位 | 规划用于 MCP、Skills 与插件的分类管理和一键拔插；当前不会读取或修改插件配置 |
| SETTING | `3` | 占位 | 设置页尚未实现 |

**需要特别说明：** 当前主程序并未提供 CCR 路由、MCP 服务器或 Skills 的实际管理功能。仓库名、历史脚本或早期文档中出现的相关描述，不代表这些功能已经接入当前 TUI。

## 主要功能

### 1. 项目与会话总览

- 自动扫描 `~/.claude/projects/<编码项目目录>/<sessionId>.jsonl`。
- 左栏展示项目目录及会话数量，项目按最新会话时间倒序排列。
- 中栏以卡片展示会话标题、用户提问数、助手回复数、文件大小和最后活跃时间。
- 会话按最后一条事件的时间倒序排列。
- 项目真实路径优先读取会话记录中的 `cwd` 字段，不尝试从编码目录名反向猜测。
- 会话标题优先采用 Claude Code 的 `ai-title`；没有标题时使用第一条真实用户消息，最长保留 40 个字符；用户重命名结果具有最高优先级。

### 2. 三栏对话浏览

HISTORY 页面采用固定三栏布局：

```text
┌─ PROJECTS ───────┬─ SESSIONS ──────────────┬─ 对话预览 ──────────────────┐
│ 项目名    会话数 │ 会话标题、统计、时间     │ 用户消息、AI 回复、工具调用 │
│ 项目名    会话数 │ 会话标题、统计、时间     │ 工具结果、Edit/Update diff  │
└──────────────────┴─────────────────────────┴────────────────────────────┘
```

- 选中会话后延迟 120 ms 自动加载预览，快速移动时只读取最终停留的会话。
- 初次打开预览时定位到最后一块对话，便于查看最近进展。
- 对话按用户消息、AI 文本、工具调用分块展示，并保留时间线顺序。
- AI 块展示记录中的模型名；工具块展示工具名称、主要参数和返回结果。
- `Edit` / `Update` 工具在数据允许时生成行级红绿 diff。
- 预览视口根据每块实际高度计算可见窗口；空间充足时会展开部分长内容，并预窥相邻块。
- 按 `Enter` 可进入整页详情，查看完整消息、工具结果和 diff。

### 3. 粘贴内容与长输出处理

- `<pasted_content>` 段默认折叠为一行摘要，避免大段粘贴文本占满屏幕。
- 在预览或详情中按 `Space` 展开或收起当前块内的粘贴段。
- 工具调用优先提取命令、脚本、文件路径、描述、提示词、匹配模式或 URL，摘要上限为 1000 字符。
- 工具结果最多保留 200 个非空行，每行最多 200 字符；超出时标注剩余行数。
- 普通正文按终端显示宽度折行，处理中文全角字符、Tab 和 ANSI 颜色转义。

### 4. 搜索、导出与重命名

- 按 `/` 搜索会话标题，支持跨项目、不区分大小写的包含匹配。
- 搜索范围是**标题**，不是完整对话正文。
- 按 `e` 将当前会话导出为 Markdown，包含用户消息、AI 回复、工具调用与工具结果。
- 按 `r` 重命名当前会话，标题不能为空，最长 40 个字符。
- 重命名会同时写入 MFCC 的标题覆盖表和会话 JSONL 中的 `ai-title` 记录，使 MFCC 与 Claude Code 的标题列表保持一致。

### 5. 删除、归档与运行保护

- “删除”不是直接永久删除，而是将会话文件移动到 `~/.claude/backups/mfcc-trash/`。
- “归档”将会话文件移动到 `~/.claude/backups/mfcc-archive/`。
- 删除需要输入 `YUE` 二次确认；归档按 `x` 后立即执行。
- 删除、归档、重命名和恢复前都会检查文件最后写入时间。
- 最近 3 分钟内有写入的会话被视为“可能正在运行”，显示绿色状态点，并禁止上述高风险操作。
- 该机制是基于 `mtime` 的保守判断，不等同于精确的进程检测；刚结束不久的会话也可能暂时处于锁定状态。

### 6. 实时刷新

HISTORY 页面每 3 秒检查一次会话文件：

- 文件最近有写入时更新运行状态。
- 文件修改时间变化时重新读取标题、统计、时间和大小。
- 项目目录中的 JSONL 文件数量变化时执行全量重扫。
- 当前预览文件有新内容时自动重载；如果用户原本位于末尾，则继续跟随最新内容，阅读中途不会强制跳转。

## 仓库组成

| 路径 | 子项目 | 技术栈 | 作用 | 与主程序的关系 |
|---|---|---|---|---|
| `src/` | ManagerForClaudeCode 主程序 | React 19、Ink 6、TypeScript | 终端 TUI，目前主要管理 Claude Code 历史会话 | 本文档的主要描述对象 |
| `claude-code-router/` | CCR 定制 fork | Node.js / TypeScript | 基于 `musistudio/claude-code-router` 的本地补丁版本 | 独立 git submodule，不是主程序运行依赖 |
| `ccr-tray/` | CCRTray | Electron、TypeScript | 系统托盘监控、启停 CCR 服务、端口设置、开机自启和通知 | 独立桌面程序，不是主程序运行依赖 |

主程序只依赖本机 Claude Code 会话文件；只有“恢复会话”功能需要调用 `claude` 命令。仅浏览、搜索、导出或整理历史记录时，不需要启动 CCR 或 CCRTray。

## 环境要求

### 主程序

- **Node.js 20 或更高版本**：Ink 6 要求 Node.js `>=20`。
- npm。
- 支持 ANSI 转义序列和交互式输入的终端。
- 建议使用 Windows Terminal、现代 macOS 终端或 Linux 终端，并启用 True Color。
- 建议终端尺寸至少为 120 列 × 30 行；较窄窗口仍可使用，但三栏内容会更紧凑。
- 浏览历史需要本机存在 `~/.claude/projects/`。
- 恢复会话需要 `claude` 已安装并加入 `PATH`。

### 平台说明

- 历史扫描、预览、搜索、导出、删除、归档和重命名使用 Node.js 标准文件 API。
- “在当前终端恢复”通过子进程调用 `claude --resume`。
- “新开终端窗口恢复”目前面向 Windows：优先使用 Windows Terminal 的 `wt`，不可用时回退到 `cmd /c start`。

## 安装与启动

### 1. 获取代码

如果只需要主程序，正常克隆即可。如果还需要 CCR 子模块，使用：

```bash
git clone --recurse-submodules <仓库地址>
cd ManagerForClaudeCode
```

已经克隆但未初始化子模块时：

```bash
git submodule update --init --recursive
```

### 2. 安装依赖并启动

在仓库根目录执行：

```bash
npm ci
npm start
```

`npm start` 会先执行 TypeScript 构建，再运行 `node dist/cli.js`。

依赖安装后也可以分步执行：

```bash
npm run build
node dist/cli.js
```

启动后先显示 MFCC 启动画面：

- `Enter`：进入主界面。
- `Esc` 或 `Ctrl+C`：在启动画面直接退出。
- 主界面普通状态下按 `Esc`：退出并显示结束画面。

### 3. 全局命令（可选）

```bash
npm link
mcp-manager
```

`mcp-manager` 是当前 `package.json` 中注册的命令名。全局链接后，Markdown 仍会导出到**执行命令时所在目录**的 `exports/`，不一定是仓库目录。

### 4. 开发模式

终端一：持续监听 TypeScript 变化并重新编译。

```bash
npm run dev
```

终端二：在至少完成一次编译后启动程序。

```bash
node dist/cli.js
```

`npm run dev` 仅执行 `tsc --watch`，**不会自动启动或重启 TUI**。修改代码后需要重新运行 `node dist/cli.js`。

仓库根目录的 `install.sh` 是早期安装脚本，仍包含旧命令名等历史内容；当前安装流程以本文档中的 npm 命令为准。

## HISTORY 使用指南

### 基本浏览流程

1. 启动后默认进入 HISTORY，左栏焦点位于项目列表。
2. 使用 `↑` / `↓` 选择项目。
3. 按 `Enter` 或 `→` 进入会话列表。
4. 使用 `↑` / `↓` 选择会话，右侧自动加载预览。
5. 按 `Enter` 将焦点移入预览。
6. 在预览中按 `↑` / `↓` 选择对话块。
7. 对选中的块按 `Enter`，进入完整详情；按 `Esc` 返回三栏界面。
8. 使用 `←` / `→`、`Tab` / `Shift+Tab` 在三栏之间切换焦点。

### 搜索会话

1. 按 `/` 进入标题搜索。
2. 输入关键字，结果跨所有项目过滤，并在行首标注所属项目。
3. 按 `Enter` 或 `Esc` 保留当前关键字并退出输入模式。
4. 再次按 `/` 可开始新的搜索。
5. 在搜索输入为空时按退格，可退出搜索并清空条件。

搜索或弹窗输入期间，数字键用于当前输入，不触发全局切页；`Esc` 优先关闭当前输入或弹窗。

### 导出 Markdown

选中会话后按 `e`，输出目录为：

```text
<启动 MFCC 时的工作目录>/exports/
```

文件名格式：

```text
<sessionId 前 8 位>-<清理后的会话标题>.md
```

标题中的 `\/:*?"<>|` 会替换为下划线，标题部分最多保留 30 个字符。导出内容可能包含代码、命令、文件路径和工具输出，分享文件前应检查敏感信息。

### 删除或归档

- 按 `d` 打开删除确认框，输入完整大写 `YUE` 后按 `Enter`。
- 按 `x` 直接归档当前会话，不弹出二次确认。
- 两种操作都只是移动 JSONL 文件，不会在当前版本界面中永久删除文件。
- 当前版本没有“备份管理”或“一键恢复备份”页面；如需还原，可手动将对应 `<sessionId>.jsonl` 移回原来的 `~/.claude/projects/<编码项目目录>/`。
- 还原前应确认目标目录不存在同名会话文件，并避免操作仍在写入的会话。

### 重命名

1. 选中未处于运行保护状态的会话，按 `r`。
2. 编辑标题，按 `Enter` 提交，或按 `Esc` 取消。
3. 标题去除首尾空白后不能为空，最多输入 40 个字符。
4. 写回 JSONL 时会保留原文件修改时间，避免仅因重命名而触发“运行中”状态或改变 Claude Code 的活跃排序。

## 完整快捷键

### 全局与启动画面

| 场景 | 按键 | 行为 |
|---|---|---|
| 启动画面 | `Enter` | 进入主界面 |
| 启动画面 | `Esc` / `Ctrl+C` | 直接退出 |
| 主界面普通状态 | `1` / `2` / `3` | 切换 HISTORY / PLUGINS / SETTING |
| 主界面普通状态 | `Esc` | 退出程序 |
| 搜索、详情或弹窗 | `Esc` | 优先返回或取消，不直接退出程序 |

### HISTORY 三栏与详情

| 按键 | 行为 |
|---|---|
| `↑` / `↓` | 移动项目、会话或对话块选择；详情中逐行滚动 |
| `←` / `→` | 在项目、会话、预览三栏间切换焦点 |
| `Tab` / `Shift+Tab` | 正向 / 反向切换三栏焦点 |
| `Enter` | 项目 → 会话；会话 → 预览；预览块 → 完整详情 |
| `/` | 进入跨项目标题搜索 |
| `Space` | 展开或收起当前对话块中的粘贴段 |
| `gg` | 500 ms 内连续按两次 `g`，跳到预览顶部或详情顶部 |
| `G` | 跳到预览底部或详情底部 |
| `d` | 删除到 MFCC 回收目录，需输入 `YUE` 确认 |
| `x` | 立即归档到 MFCC 归档目录 |
| `e` | 导出当前会话为 Markdown |
| `r` | 重命名当前会话 |
| `ss` | 500 ms 内连续按两次 `s`，打开恢复会话选项 |
| `Esc` | 关闭详情、搜索或弹窗；普通状态下退出程序 |

恢复会话弹窗中使用 `↑` / `↓` 或 `1` / `2` 选择恢复方式，`Enter` 确认，`Esc` 取消。

## 数据路径与文件变更

主程序不需要单独的配置文件或环境变量。当前涉及的路径如下：

| 路径 | 读取 / 写入 | 用途 |
|---|---|---|
| `~/.claude/projects/<项目目录>/<sessionId>.jsonl` | 读取；重命名时写入 | Claude Code 原始会话记录 |
| `~/.claude/backups/mfcc-trash/<sessionId>.jsonl` | 写入 | 执行“删除”后的可恢复文件 |
| `~/.claude/backups/mfcc-archive/<sessionId>.jsonl` | 写入 | 归档文件 |
| `~/.claude/backups/mfcc-titles.json` | 读取、写入 | MFCC 用户标题覆盖表 |
| `<当前工作目录>/exports/<会话文件>.md` | 写入 | Markdown 导出结果 |
| `dist/` | 构建时写入 | TypeScript 编译输出 |

数据安全边界：

- 浏览和搜索不修改原始会话。
- 删除与归档通过文件移动完成，目标目录会自动创建。
- 重命名会实际改写原 JSONL 中的 `ai-title` 行，并更新标题覆盖表。
- 当前没有自动清理回收目录或归档目录的机制。
- 当前没有备份恢复 UI，也没有操作日志查看页面。
- 主程序本身不发起网络请求；恢复会话时启动的 Claude Code 进程遵循其自身网络与配置行为。

## 会话恢复机制

对选中会话连续按两次 `s`，可选择两种方式。

### 方式一：在当前终端恢复

执行逻辑：

1. 暂时退出 Ink 界面，但保持 MFCC 的 Node.js 进程存活。
2. 在会话记录的项目 `cwd` 中运行：

   ```bash
   claude --resume <sessionId>
   ```

3. 将当前终端的 stdin、stdout、stderr 完整交给 Claude Code。
4. Claude Code 退出后清屏并自动重新挂载 MFCC，不重播启动动画。

该方式适合希望继续当前工作流、结束后返回管理器的场景。

### 方式二：新开终端窗口恢复

- Windows Terminal 可用时，通过 `wt -d <cwd> ... claude --resume <sessionId>` 启动。
- 否则回退到 `cmd /c start`。
- 新窗口使用 `cmd /k`，Claude Code 退出后保留命令提示符。
- 新窗口启动后，原 MFCC 界面继续运行，不会退出。

如果会话缺少 `cwd`、最近 3 分钟内有写入，或 `claude` 不在 `PATH`，恢复会被拒绝或失败。

## 启动与退出画面

- 启动画面使用纯 ANSI 输出，不经过 Ink：清屏、字符画渐显、呼吸动画、等待 `Enter`、淡出。
- 启动画面会响应终端尺寸变化并重新居中。
- 非 TTY 环境会跳过启动与退出动画，但主程序仍应在交互式终端中使用。
- 退出画面清屏后在左上角显示紧凑字符画、本次使用时长和自定义文案。
- 字符画和告别文案位于 `src/shell/goodbye.ts`。
- 启动副标题、提示语、颜色和动画节奏位于 `src/shell/splash.ts`。

## 项目结构

```text
ManagerForClaudeCode/
├── src/
│   ├── cli.tsx                         # 入口：启动页 → Ink 主循环 → 会话恢复接力 → 退出页
│   ├── App.tsx                         # 通用外壳：Tab、内容区、底栏、全局快捷键与反馈
│   ├── types.ts                        # PageMeta / PageProps / PageEntry / ShellValue
│   ├── components/
│   │   ├── ScrollableList.tsx          # 单行项目的虚拟滚动列表
│   │   ├── DetailPanel.tsx             # 详情面板容器
│   │   └── VerticalDivider.tsx         # 面板竖向分隔线
│   ├── hooks/
│   │   ├── useScrollableList.ts        # 单行列表的可见窗口计算
│   │   └── useTerminalSize.ts          # 终端尺寸与 resize 订阅
│   ├── pages/
│   │   ├── registry.ts                 # 页面注册表
│   │   ├── HISTORYPage.tsx             # HISTORY 的导出入口
│   │   ├── PLUGINSPage.tsx             # 占位页
│   │   ├── SETTINGPage.tsx             # 占位页
│   │   └── history/
│   │       ├── HISTORYPage.tsx         # 三栏 UI、预览、详情、弹窗与键盘交互
│   │       ├── scan.ts                 # JSONL 扫描、缓存、导出、移动与标题写回
│   │       ├── resume.ts               # 当前终端 / 新窗口恢复会话
│   │       └── types.ts                # 项目、会话和对话条目的数据契约
│   └── shell/
│       ├── context.ts                  # 页面与外壳之间的反馈、输入模式通道
│       ├── splash.ts                   # 启动动画
│       └── goodbye.ts                  # 退出动画与字符画
├── claude-code-router/                 # CCR 定制 fork，git submodule
├── ccr-tray/                           # 独立 Electron 托盘程序
├── docs/
│   ├── ARCHITECTURE.md                 # 外壳与页面契约说明
│   ├── PATCHES.md                      # CCR 本地补丁说明
│   └── Yue021130_Notes.md              # 学习笔记
├── dist/                               # 主程序编译输出
├── package.json                        # 主程序依赖、脚本与 mcp-manager 命令
├── tsconfig.json                       # strict、ES2022、NodeNext、ESM
└── install.sh                          # 早期安装脚本
```

## 架构与开发

### 技术栈

| 依赖 | 当前主版本 | 用途 |
|---|---:|---|
| React | 19 | 组件、状态与 Hooks |
| Ink | 6 | 将 React 组件渲染到终端，处理布局与键盘输入 |
| TypeScript | 7 | 严格类型检查与构建 |
| Chalk | 5 | 启动和退出画面的 ANSI 颜色 |

构建目标为 ES2022，模块与解析策略均为 NodeNext，源码位于 `src/`，编译输出位于 `dist/`。在 TypeScript 源码中导入本地模块时使用 `.js` 后缀，以符合 ESM 输出形式。

### 核心原则：外壳通用，页面自治

`App.tsx` 不直接导入具体页面实现，而是遍历 `src/pages/registry.ts`：

- 外壳负责顶栏 Tab、底栏提示、数字切页、退出和反馈消息。
- 页面通过 `PageProps` 获取内容区宽高。
- 页面通过 `useShell()` 调用 `setMessage`、`setError` 和 `setKeysEnabled`。
- 只有当前页面被挂载，切页后旧页面状态不保留。
- 搜索、详情或弹窗可暂时关闭外壳数字切页，避免输入冲突。

新增页面的基本步骤：

1. 在 `src/pages/` 创建页面文件。
2. 导出符合 `PageMeta` 的 `meta`，并默认导出接收 `PageProps` 的组件。
3. 在 `src/pages/registry.ts` 注册唯一的 `key`、数字键、元信息和组件。
4. 页面自己的按键在组件内通过 `useInput` 处理。

更完整的契约示例见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)；具体行为以当前源码为准。

### HISTORY 数据与 UI 分层

- `scan.ts` 是无 React 依赖的数据层，负责文件读取、JSONL 解析、缓存和文件操作。
- `types.ts` 定义 `ProjectInfo`、`SessionMeta` 与 `ChatEntry`。
- `HISTORYPage.tsx` 负责展示、焦点、弹窗和键盘状态。
- 元信息缓存和对话缓存均以文件 `mtime` 为失效依据，外部修改后可重新读取。
- 单行项目列表复用 `ScrollableList`；会话卡片和不定高对话块使用各自的窗口计算，避免固定行高假设破坏布局。

### 常用开发命令

```bash
npm run build    # 全量类型检查并编译 src/ 到 dist/
npm run dev      # tsc --watch，只编译，不启动界面
npm start        # 构建并启动
node dist/cli.js # 直接运行已有构建
```

当前主程序没有自动化测试套件，`npm test` 是占位脚本并会返回失败。修改后至少应执行 `npm run build`，并在真实交互终端中检查导航、搜索、弹窗、窗口缩放和会话恢复流程。

## CCR 与 CCRTray 子项目

### CCR 定制 fork

`claude-code-router/` 是 [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) 的 submodule：

- `main` 用于跟踪上游。
- `custom` 用于维护本地补丁。
- 本地修改和补丁边界见 [docs/PATCHES.md](./docs/PATCHES.md)。

根目录执行 `npm ci` 不会替你安装或构建该子模块的依赖；需要进入其目录后按子项目说明单独操作。

### CCRTray

`ccr-tray/` 是独立 Electron 应用，提供：

- 每 3 秒探测 CCR 服务状态。
- 绿、黄、红三色托盘状态。
- 启动、停止和打开管理界面。
- 管理端口与服务端口设置。
- Windows / Linux 开机自启。
- 服务异常、恢复与启动缓慢通知。

运行 CCRTray 需要 Node.js 22+，并且目标机器可执行 `ccr`：

```bash
cd ccr-tray
npm install
npm run dev        # 构建并启动
npm run typecheck  # 类型检查
npm run dist       # 构建 Windows NSIS 安装包
```

完整说明见 [ccr-tray/README.md](./ccr-tray/README.md)。

## 故障排查

### 启动后提示没有对话历史

检查：

1. 当前用户目录下是否存在 `~/.claude/projects/`。
2. 项目子目录中是否直接包含 `<sessionId>.jsonl` 文件。
3. 是否使用了与 Claude Code 不同的操作系统用户或不同的 `HOME`。
4. 文件是否具有读取权限。

扫描只识别项目目录下一级的 `.jsonl` 文件，不会递归搜索任意深度的目录。

### 按 `ss` 后无法恢复

- 确认连续两次按键间隔不超过 500 ms。
- 确认会话包含有效的 `cwd`。
- 确认会话最近 3 分钟没有写入。
- 在终端执行 `claude --version`，确认命令可用。
- 当前终端恢复失败后会返回 MFCC；新窗口恢复失败时查看底栏错误信息。

### 会话被判定为运行中

这是基于文件修改时间的保护机制。等待最后写入超过 3 分钟后再执行删除、归档、重命名或恢复；不要在 Claude Code 仍在写入时手动移动对应 JSONL。

### 删除或归档后想找回

在以下目录按 `<sessionId>.jsonl` 查找：

```text
~/.claude/backups/mfcc-trash/
~/.claude/backups/mfcc-archive/
```

关闭相关 Claude Code 会话后，将文件移回原来的项目目录。当前版本没有界面内恢复入口。

### 找不到导出的 Markdown

导出位置取决于启动命令时的工作目录。检查该目录下的 `exports/`；如果使用全局 `mcp-manager`，它不会固定导出到 MFCC 仓库。

### 界面错位、字符挤压或颜色异常

- 优先使用 Windows Terminal 或其他现代终端。
- 将窗口调整到至少 120 × 30。
- 确认终端支持 Unicode、常用符号和 ANSI True Color。
- 避免通过管道、重定向或不支持原始键盘输入的环境运行交互界面。

### Node.js 或依赖报错

执行：

```bash
node --version
npm --version
npm ci
npm run build
```

主程序要求 Node.js 20+。如果全局链接失败，可改用 `npm start` 或 `node dist/cli.js`，不必依赖全局命令。

## 实现边界与注意事项

- HISTORY 的搜索仅匹配标题，不支持正文全文检索、正则或按日期过滤。
- 会话统计基于 JSONL 中可识别的事件类型；无法解析的行会被跳过。
- 单个会话文件读取失败不会拖垮整个项目扫描，但该文件可能不会出现在列表中。
- 工具结果和 diff 存在长度上限，极端大的输出会被截断或回退为普通展示。
- 删除与归档使用文件移动；跨设备、权限不足或目标同名文件等情况可能导致操作失败，错误会显示在底栏。
- 运行状态不是进程级锁，而是最近 3 分钟文件写入的启发式判断。
- PLUGINS 与 SETTING 仍是占位页，当前不会修改 `~/.claude.json`、MCP 配置、Skills 或 CCR 配置。
- 主程序、CCR fork 和 CCRTray 需要分别构建、验证和发布。
