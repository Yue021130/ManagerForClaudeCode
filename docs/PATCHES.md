# CCR 魔改补丁清单（PATCHES.md）

本文件记录 ManagerForClaudeCode 对 claude-code-router（ccr）源码的全部本地补丁。
**每次 `npm update -g @musistudio/claude-code-router` 之后，dist 里的补丁会被冲掉，
必须按本清单在源码里重新确认/重打，再重新构建或同步 dist。**

当前基准版本：上游 v3.1.3（commit `057abaa1`）。
补丁共 5 个文件，大部分以 `// CCR patch:` 注释标记，可用
`git diff` 或搜索该注释快速定位。

> **已放弃的补丁**：Electron 运行时重定向（原 cli.ts 补丁，2026-10-18 撤销，
> 于 2026-10-18 撤销，不再维护）。本机 `node` 被 Kimi Electron 假扮导致的 better-sqlite3 ABI
> 问题，改从启动方式上规避：**始终用真 node（`Z:\Nvm_Nodejs\nodejs\node.exe`）
> 启动 ccr**，不在代码里硬编码路径。

## 补丁 1：网关子进程隐藏窗口

- 文件：`packages/core/src/gateway/core-runtime/supervisor.ts`
- 内容：`spawnGatewayProcess` 的 fork 选项加 `windowsHide: true`。
- 原因：`ccr start` 不再弹出 node 控制台窗口。

## 补丁 2：禁用桌面应用探测（信息类 RPC）

- 文件：`packages/core/src/agents/app-info-paths.ts`
- 内容：`getAppInfoPaths` 的三个字段（chatgptAppPath / opencodeAppPath /
  workbuddyAppPath）直接返回空字符串，并删除两个 import。
- 原因：该探测会同步 spawn 多个 PowerShell 子进程，把管理服务器（3458 端口）
  的事件循环卡住几十秒，导致 `http://127.0.0.1:3458/` 刷新很慢。
  这些路径仅用于信息展示；真正的启动器（launchers）在需要时仍会实时探测。

## 补丁 3：Windows 应用发现的同步子进程加超时

- 文件：`packages/core/src/platform/windows-app-discovery.ts`
- 内容：3 处 `spawnSync` 各加 `timeout: 3_000`；其中 2 处同时加
  `maxBuffer: 4 * 1024 * 1024`。
- 原因：防止 PowerShell / where.exe 探测无限期挂起。

## 补丁 4：Profile 启动服务的同步子进程加超时

- 文件：`packages/core/src/profiles/launch-service.ts`
- 内容：2 处 `spawnSync` 加超时（一处 3 秒、`ensureWindowsUserPath` 一处 5 秒）。
- 原因：同补丁 3。

## 补丁 5：OpenCode 进程查找加超时

- 文件：`packages/core/src/agents/opencode/app-launch.ts`
- 内容：`findWindowsExecutablePid` 的 `spawnSync` 加 `timeout: 3_000`。
- 原因：同补丁 3。

## 上游更新流程（fork 分支模型）

`claude-code-router/` 是 git submodule（remote：`git@github.com:Yue021130/claude-code-router.git`，
上游 musistudio 的 fork），内部分支约定：

- **`main`** — 只跟踪上游，保持与 `upstream/main` 一致；
- **`custom`** — 全部本地补丁维护在此分支，**工作区平时停留在这里**。

上游有新版本时（在 `claude-code-router/` 目录内）：

```powershell
git fetch upstream
git checkout main
git merge upstream/main     # 快进合并上游更新
git push origin main        # 同步到你的 fork
git checkout custom
git merge main              # 合进补丁分支；上游改了补丁同文件会冲突，解决时保留补丁
git push origin custom
```

然后回到 MFC 更新 submodule 指针：

```powershell
cd ..
git add claude-code-router
git commit -m "chore: bump ccr"
git push
```

核对补丁：在 `claude-code-router/` 里 `git diff main...custom --stat`
应始终等于本清单的 5 个文件；`git log --oneline main..custom` 是补丁提交列表。

> 历史教训：曾用 subtree + squash 管理补丁，上游无新提交时 pull 会算出反向合并、
> 把补丁精准回滚（2026-10-18 踩过）。fork 分支模型下 `git merge` 是真三方合并，
> 不存在此问题。

## 已知关联路径

- ccr 运行数据：`%APPDATA%\claude-code-router\`（网关口 40229，管理口 3458）
- 全局安装副本（npm update 会覆盖）：
  `Z:\Nodejs_Global\node_global\node_modules\@musistudio\claude-code-router\dist\main\cli.js`
