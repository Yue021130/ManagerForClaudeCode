# ccr-tray 架构文档

> 适用范围：本目录(`ccr-tray/`)。仓库根的 `docs/ARCHITECTURE.md` 讲的是根 CLI(React + Ink),本文档专讲 **Electron 托盘**。

## 1. 定位与目标

`ccr-tray` 是 **Claude Code Router (CCR) 的桌面托盘程序**,用 Electron + TypeScript 重写。

- **跨平台**:Windows 优先,同时支持 Linux(XDG 约定)。
- **职责**:常驻系统托盘,监控 CCR 服务状态、提供启停/打开管理界面/设置端口/开机自启。
- **远期意图**:`src/shell/tray-shell.ts` 的注释写明 —— Electron 只是第一个实现,以后可以换 koffi / D-Bus 原生壳,届时 `main.ts` 与 `core/` 都不用动。这是整个分层的核心动机。

## 2. 分层架构

```
┌─────────────────────────────────────────────┐
│ src/main.ts            编排器(状态机+事件分发) │
├─────────────────────────────────────────────┤
│ src/core/              纯 Node 逻辑,零 Electron │
│   status.ts            HTTP 探测               │
│   ccr.ts               调 ccr CLI 启停/重启     │
│   settings.ts          托盘自身配置(端口)      │
│   service-state.ts     读 CCR 的 service.json  │
│   autostart.ts         注册表 / .desktop       │
│   types.ts             类型(无运行时代码)       │
├─────────────────────────────────────────────┤
│ src/shell/             平台壳                   │
│   tray-shell.ts        TrayShell 接口(契约)    │
│   electron-tray.ts     Electron 实现           │
│   menu-preload.ts      菜单弹窗 preload        │
│   settings-preload.ts  设置窗 preload          │
└─────────────────────────────────────────────┘
```

依赖方向**只许往下**:`main.ts` → `shell/` 与 `core/`;`shell/electron-tray.ts` → `core/types`;`core/*` 之间平级互引。**`core/` 不允许 import electron**,这是可替换壳的前提。

## 3. 核心模块

### 3.1 `src/main.ts` —— 编排器

持有应用全部可变状态(模块级 `let`):

| 状态 | 含义 |
|---|---|
| `status: StatusInfo` | 最近一次轮询结果 |
| `busy` | 启动/停止进行中(置灰 UI) |
| `runningSince` | 进入 `running` 的时刻,用于"本次启动时长" |
| `prevRunning` | 上一轮是否 running(检测状态跳变) |
| `autostartEnabled` | 开机自启开关 |
| `lastPortTest` / `lastNotice` | 推给设置窗的测试结果 / 提示条 |

**启动序列**(`app.whenReady()` 内):

```
isAutostartEnabled(currentExePath())   // 读一次自启状态
shell.onEvent(handleEvent)             // 挂事件总线
await shell.init()                     // 点亮托盘
await refresh()                        // 立即探测一次
setInterval(refresh, 3000)             // 之后每 3s 轮询
```

**`refresh()`**:`checkStatus()` → 维护 `runningSince/prevRunning` → `shell.setStatus()`(图标/tooltip)→ `shell.refreshMenu()` → `pushSettings()`。

**`handleEvent(event: MenuEvent)`** 是中央分发,处理 9 种事件:`open-management / open-settings / settings-tick / start-service / stop-service / toggle-autostart / test-ports / save-ports / quit`。

要点:

- **`open-management`**:不直接用端口号拼 URL,而是 `readManagementUrl(...)` 读 CCR 的 `service.json`,因为管理 URL 里带**每次启动都变的 RPC token**。
- **`save-ports`**:校验两端口都是 `1..65535` 整数且**不能相同**;服务在跑则自动 `restartService()` 让新端口生效,没在跑则提示"下次启动生效"。
- **`start/stop-service`**:`busy=true` → 刷新 UI → 调 ccr → `busy=false` → `refresh()`。
- **单实例**:`app.requestSingleInstanceLock()`,第二个实例直接退出。
- **常驻**:`app.on("window-all-closed", () => {})` 注册空处理器,覆盖 Electron "窗口全关就退出" 的默认行为。

### 3.2 `src/core/status.ts` —— 状态探测

```ts
export async function checkStatus(): Promise<StatusInfo>
```

- fetch `http://127.0.0.1:<port>/`,超时 **1200ms**(`AbortSignal.timeout`)。
- **HTTP 404 也算"活"**:`res.ok || res.status === 404` —— 只关心端口有没有进程在应答,不关心路径。
- 先探 `gatewayPort`,通了就短路;不通再探 `managementPort`。
- 状态推导:gateway 通 → `running`;仅 management 通 → `partial`(启动中/异常);都不通 → `stopped`。
- **端口每次 `readSettings()` 现读**,所以设置窗保存端口后,下一轮轮询就用新端口,托盘不用重启。

### 3.3 `src/core/ccr.ts` —— 进程控制

调全局安装的 `ccr` CLI(npm shim):

```ts
export async function startService(): Promise<void>
export async function stopService(): Promise<void>
export async function restartService(): Promise<void>   // stop 然后 start
export function testPort(port): Promise<"free"|"in-use"|"invalid">
```

- Windows 上命令是 `ccr.cmd`,必须 `shell: true`;`windowsHide: true`、`stdio: "ignore"`。
- `startService()` 注入两个环境变量:`CCR_WEB_PORT=<管理口>`(上游原生支持)与 `CCR_GATEWAY_PORT=<网关口>`(**本地 fork 补丁**,见根目录 `docs/PATCHES.md`)。
- `testPort` 不连服务,而是在本地 `net.createServer()` 试绑 `127.0.0.1:port`:`EADDRINUSE` → `in-use`,绑得上 → `free`,其它错误 → `invalid`。
- `openManagement()` 目前是**死代码**(空实现,真正打开浏览器在 shell 层做)。

### 3.4 `src/core/settings.ts` —— 托盘自身配置

只存两个端口。路径:

- Windows:`%APPDATA%\ccr-tray\settings.json`
- Linux:`$XDG_CONFIG_HOME/ccr-tray/settings.json`(无 `XDG_CONFIG_HOME` 则 `~/.config/...`)

默认 `managementPort: 3458`,`gatewayPort: 40229`。

- **`readSettings()` 每次都重新读文件**(注释明确:端口保存后托盘无需重启即生效)。文件缺失/损坏时回落到默认值。
- `sanitize()` 只把合法的 `1..65535` 整数覆盖到默认值上。
- `writeSettings(update)` 把合法字段合并进当前文件再写回。**注意:"两端口不能相同"这条校验只在 `main.ts` 的 `save-ports` 里有,`settings.ts` 自己不强制**。

### 3.5 `src/core/service-state.ts` —— 读 CCR 的状态文件

```ts
export function readManagementUrl(fallbackPort: number): string
```

- 读 `%APPDATA%\claude-code-router\service.json`(CCR `start` 时写),取其中合法的 `http(s)` `url` —— 这个 URL 带**每次启动都变的 RPC token**。
- 取不到就回落到 `http://127.0.0.1:<fallbackPort>/`。

### 3.6 `src/core/autostart.ts` —— 开机自启

- **Windows**:注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`,值名 `CCRTray`,用 `reg.exe` + `spawnSync`。**所有 stdio 都吞掉** —— 注释说明:中文 Windows 上 `reg.exe` 的输出是 GBK,接到 UTF-8 终端会乱码,所以只看退出码、不读输出。
- **Linux**:写/删 `~/.config/autostart/ccr-tray.desktop`。
- `currentExePath()`:Windows 用 `process.execPath`,Linux 优先 `$APPIMAGE`。
- `desktopFileRaw()` 目前是**死代码**。

### 3.7 `src/core/types.ts` —— 类型

纯类型,无运行时代码。关键:`ServiceState = "running"|"partial"|"stopped"`、`StatusInfo`、`MenuEvent`(9 种事件的判别联合)、`PortTestResult`、`SettingsState`。

## 4. Electron 壳实现细节(`src/shell/electron-tray.ts`)

### 4.1 托盘本体

- `ASSETS = __dirname/../assets` —— 运行时 `__dirname` 是 `dist/`,所以指向**项目根的 `assets/`**(不在 `dist` 里)。
- `init()` 先试 `assets/icon.png`(**仓库里当前不存在这个文件**),`nativeImage.isEmpty()` 时退回红色 stopped 图标。所以**首次点亮总是红色**,直到第一轮轮询刷新。
- tooltip 初始 `"Yue"`,之后随状态变 `"Yue — 运行中/启动中…/已停止"`。
- **左击 → `open-management`,右击 → 自绘弹窗**。

### 4.2 自绘菜单弹窗(替代原生 `Menu`)

无边框、透明、置顶、`skipTaskbar` 的 `BrowserWindow`,加载 `assets/menu.html`。

- **`closable: false`** 是关键(见 4.4 退出问题)。
- **失焦即关**:`popup.on("blur", hide)` —— 等价于原生菜单"点外部关闭"。
- **尺寸实测**:显示前用 `executeJavaScript` 在页面里 `setTimeout(60ms)` 后读 `#menu.scrollWidth/scrollHeight`,再 `+2px` 余量防止取整裁剪。注释明确:**不能用 `requestAnimationFrame`,因为隐藏窗口不产帧,rAF 不会触发**。
- **定位**:按托盘图标在屏幕上下半决定菜单向下/向上弹,再夹取到所在显示器的 `workArea` 内(留 4px 边距)。

### 4.3 设置窗

340×424 无边框深色窗,加载 `assets/settings.html`。

- 已打开时再调 `openSettings()` 只是 `show()+focus()`,不重开。
- **`dismiss` 是"隐藏"不是"销毁"** —— 渲染进程和它的 1s interval 都保留,下次快开;首次 `ready-to-show` 时居中于**托盘图标所在显示器**的 workArea。

### 4.4 为什么 `quit()` 不能走 `app.quit()`

```ts
quit(): void {
  this.popup?.destroy();
  this.settingsWindow?.destroy();
  this.tray?.destroy();
  app.exit(0);
}
```

注释写明:弹窗 `closable: false` 会让 `app.quit()` 卡在售窗阶段退不掉,所以托盘**手动销毁三个资源再 `app.exit(0)` 强制退**。

## 5. IPC 协议

全部 **fire-and-forget**(`ipcRenderer.send` / `ipcMain.on` / `webContents.send`),**没有 `invoke`/`handle`,也没有请求 ID**。

| 通道 | 方向 | 载荷 | 生产者 → 消费者 |
|---|---|---|---|
| `menu:state` | main → 菜单渲染器 | `MenuOptions { status, autostartEnabled, busy }` | `ElectronTrayShell.pushState` → `menu-preload.onState` |
| `menu:event` | 菜单渲染器 → main | `MenuEvent` 或 `{kind:"dismiss"}` | `menu-preload.send` → `ipcMain.on("menu:event")` |
| `settings:state` | main → 设置渲染器 | `SettingsState { uptimeMs, autostartEnabled, managementPort, gatewayPort, serviceState, busy, portTest?, notice? }` | `ElectronTrayShell.pushSettingsState` → `settings-preload.onState` |
| `settings:event` | 设置渲染器 → main | `MenuEvent` 或 `{kind:"dismiss"}`(含 `settings-tick`) | `settings-preload.send` → `ipcMain.on("settings:event")` |

- `dismiss` **只在 shell 层消化**(隐藏弹窗/设置窗),不进 `main.ts`;其余事件透传给 `main.handleEvent`。
- 渲染器全局:`window.ccrMenu = { onState, send }` / `window.ccrSettings = { onState, send }`。
- 两个 `ipcMain.on` 都注册在 `createPopup()` 里。

## 6. 数据流

**状态推送链(每 3s,由轮询驱动)**:

```
main.refresh()
  └─ core/status.checkStatus()  (HTTP 探测,端口现读)
       ├─ shell.setStatus()        → 换图标 + tooltip
       ├─ shell.refreshMenu()      → 若菜单弹窗可见,推 "menu:state"
       └─ pushSettings()           → 若设置窗可见,推 "settings:state"
```

**命令链(UI 事件触发)**:

```
renderer 点击/按键
  └─ preload.send(event)
       └─ ipcMain "menu:event" / "settings:event"
            └─ ElectronTrayShell.emit → main.handleEvent
                 ├─ ccr.start/stop/restart   → ccr CLI
                 ├─ settings.writeSettings   → settings.json
                 ├─ autostart.setAutostartEnabled → 注册表 / .desktop
                 ├─ testPort                 → 本地 bind 试占用
                 └─ 结尾 refresh()           → 回到状态推送链
```

## 7. 构建与运行

`ccr-tray/package.json`:

- `main: dist/main.cjs`
- `build`:`esbuild src/main.ts src/shell/menu-preload.ts src/shell/settings-preload.ts --bundle --platform=node --format=cjs --external:electron --outdir=dist --out-extension:.js=.cjs`
- `start` / `dev`:build 之后 `electron .`(`dev` 多传一个 `--dev`,但**源码里没人读这个参数**)
- `typecheck`:`tsc --noEmit`

要点:

- esbuild 三入口 → `dist/main.cjs`、`dist/shell/menu-preload.cjs`、`dist/shell/settings-preload.cjs`;electron 是 external。
- `out-extension:.js=.cjs` 必须写,因为项目没有 `"type":"module"`,esbuild 默认会输出 `.js`。
- **没有 electron-builder / forge**,开发期就是 `electron .` 跑源码。
- **`assets/` 不拷进 `dist/`**;运行时靠 `__dirname/../assets` 指回项目根。将来若打包,要么保持这个目录结构,要么改 `ASSETS`。

## 8. 设计决策与权衡

| 决策 | 原因 |
|---|---|
| `core/` 零 Electron | 让壳可替换(koffi/D-Bus),`main.ts` 与 `core/` 不动 |
| 每次 `readSettings()` 现读文件 | 端口保存后下一轮轮询即生效,托盘不用重启 |
| HTTP 404 算"活" | 探测只关心端口有没有进程应答,不关心路径 |
| 设置窗隐藏而非销毁 | 下次打开秒开,保留渲染进程状态;代价是后台一直占一个 renderer |
| `reg.exe` 输出全吞 | 中文 Windows 的 GBK 输出接到 UTF-8 终端会乱码,只看退出码 |
| 弹窗尺寸实测而非写死 | 绕开系统缩放对原生菜单的放大,宽度正好包住内容 |
| 自绘菜单而非原生 `Menu` | 原生菜单在 Windows 缩放下样式不可控 |

## 9. 与 CCR fork 补丁的关系

- **依赖 fork 补丁**:`startService()` 注入的 `CCR_GATEWAY_PORT` 环境变量是**本地 fork 的补丁**,上游没有。详见仓库根 `docs/PATCHES.md`(那里把它列为 patch 6;`core/ccr.ts` 的注释写"补丁 7",两处口径不一致)。
- 管理页 URL 带每次启动都变的 token,所以 `open-management` 必须走 `service.json`,不能只拼端口。

## 10. 已知问题与改进方向

| 问题 | 现状 | 建议方向 |
|---|---|---|
| `assets/icon.png` 缺失 | 首次点亮总是红色 stopped 图标 | 补一张应用图标 |
| `openManagement()` / `desktopFileRaw()` 死代码 | 空实现/未被引用 | 删除或接上 |
| 端口相等校验未下沉 | 只在 `main.ts`,`settings.ts` 不强制 | 把"两端口不能相同"加进 `sanitize/writeSettings` |
| "补丁 6 / 补丁 7" 口径不一致 | `PATCHES.md` vs `core/ccr.ts` 注释 | 统一 |
| `StatusInfo.managementUrl` 不带 token | 真正带 token 的 URL 只在 `readManagementUrl` | 要么去掉这个字段,要么统一走 service-state |
| `uptimeMs` 是托盘观测口径 | 托盘或 CCR 重启就归零,不是真实进程时长 | 如需真实时长,改从 CCR 侧读 |
| 3s 轮询无界面也在跑 | 每轮最多两次本地 HTTP | 可在无任何 UI 打开时降频/暂停 |
| 设置窗隐藏后 1s interval 仍在 | `settings.html` 里 `serviceState==="running"` 才发 tick,但 interval 本身一直在 | 可在隐藏时清 interval |
| `MenuOptions.autostartEnabled` 菜单端没用 | 菜单 HTML 没渲染它(自启开关在设置窗) | 精简载荷或在菜单里也展示 |
| `--dev` 参数没人读 | `npm run dev` 传了但源码不消费 | 接上(如开 DevTools)或从脚本里去掉 |
