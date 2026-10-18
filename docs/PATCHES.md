# CCR 魔改补丁清单（PATCHES.md）

本文件记录 ManagerForClaudeCode 对 claude-code-router（ccr）源码的全部本地补丁。
**每次 `npm update -g @musistudio/claude-code-router` 之后，dist 里的补丁会被冲掉，
必须按本清单在源码里重新确认/重打，再重新构建或同步 dist。**

当前基准版本：上游 v3.1.3（commit `057abaa1`）。
补丁共 6 个文件、45 行新增，全部以 `// CCR patch:` 注释标记，可用
`git diff` 或搜索该注释快速定位。

## 补丁 1：Electron 运行时重定向到真实 Node

- 文件：`packages/cli/src/cli.ts`
- 内容：启动时若检测到 `process.versions.electron`（即在 Electron 运行时里被当
  node 启动，例如某些桌面应用内嵌），则用 `spawnSync` 以
  `Z:\Nvm_Nodejs\nodejs\node.exe` 重新执行自己（`stdio: "inherit"`、
  `windowsHide: true`、环境变量 `CCR_NO_REEXEC=1` 防循环），然后 `process.exit`。
- 原因：Electron 的 ABI 与 better-sqlite3 不兼容，不重定向会导致配置静默降级为空。

## 补丁 2：网关子进程隐藏窗口

- 文件：`packages/core/src/gateway/core-runtime/supervisor.ts`
- 内容：`spawnGatewayProcess` 的 fork 选项加 `windowsHide: true`。
- 原因：`ccr start` 不再弹出 node 控制台窗口。

## 补丁 3：禁用桌面应用探测（信息类 RPC）

- 文件：`packages/core/src/agents/app-info-paths.ts`
- 内容：`getAppInfoPaths` 的三个字段（chatgptAppPath / opencodeAppPath /
  workbuddyAppPath）直接返回空字符串，并删除两个 import。
- 原因：该探测会同步 spawn 多个 PowerShell 子进程，把管理服务器（3458 端口）
  的事件循环卡住几十秒，导致 `http://127.0.0.1:3458/` 刷新很慢。
  这些路径仅用于信息展示；真正的启动器（launchers）在需要时仍会实时探测。

## 补丁 4：Windows 应用发现的同步子进程加超时

- 文件：`packages/core/src/platform/windows-app-discovery.ts`
- 内容：3 处 `spawnSync` 各加 `timeout: 3_000`；其中 2 处同时加
  `maxBuffer: 4 * 1024 * 1024`。
- 原因：防止 PowerShell / where.exe 探测无限期挂起。

## 补丁 5：Profile 启动服务的同步子进程加超时

- 文件：`packages/core/src/profiles/launch-service.ts`
- 内容：2 处 `spawnSync` 加超时（一处 3 秒、`ensureWindowsUserPath` 一处 5 秒）。
- 原因：同补丁 4。

## 补丁 6：OpenCode 进程查找加超时

- 文件：`packages/core/src/agents/opencode/app-launch.ts`
- 内容：`findWindowsExecutablePid` 的 `spawnSync` 加 `timeout: 3_000`。
- 原因：同补丁 4。

## 上游更新流程（重要）

补丁在本仓库中以普通提交维护（`92d23a29`、`82135111` 及其后续），更新上游时：

```powershell
git fetch upstream main
git log --oneline HEAD..upstream/main          # 先看上游有没有新提交
```

- **没有新提交就不要 pull**。上游 main 停在本地板本基点时跑 `git subtree pull --squash`，
  会计算出反向合并范围，把补丁精准回滚（2026-10-18 踩过此坑）。
- 有新提交时：

```powershell
git subtree pull --prefix=claude-code-router upstream main --squash
```

  然后核对补丁是否还在（上游改了同文件会冲突，解决时保留我方补丁）。

## 已知关联路径

- ccr 运行数据：`%APPDATA%\claude-code-router\`（网关口 40229，管理口 3458）
- 全局安装副本（npm update 会覆盖）：
  `Z:\Nodejs_Global\node_global\node_modules\@musistudio\claude-code-router\dist\main\cli.js`
