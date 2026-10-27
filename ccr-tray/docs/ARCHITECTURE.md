# ccr-tray 架构文档

> 适用范围：本目录(`ccr-tray/`)。仓库根的 `docs/ARCHITECTURE.md` 讲的是根 CLI(React + Ink),本文档专讲 **Electron 托盘**。

## 1. 定位与目标

`ccr-tray` 是 **Claude Code Router (CCR) 的桌面托盘程序**,用 Electron + TypeScript 实现。

- **跨平台**:Windows 优先,同时支持 Linux(XDG 约定)。
- **职责**:常驻系统托盘,监控 CCR 服务状态、提供启停/打开管理界面/设置端口/开机自启;服务意外停止/恢复时弹应用内通知。
- **远期意图**:`src/shell/tray-shell.ts` 的注释写明 —— Electron 只是第一个实现,以后可以换 koffi / D-Bus 原生壳,届时 `main.ts` 与 `core/` 都不用动。这是整个分层的核心动机。

## 2. 分层架构

```
┌─────────────────────────────────────────────┐
│ src/main.ts            编排器(状态机+事件分发) │
├─────────────────────────────────────────────┤
│ src/core/              纯 Node 逻辑,零 Electron │
│   status.ts            HTTP 探测               │
│   ccr.ts               调 ccr CLI 启停         │
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
│   notify-preload.ts    通知弹窗 preload        │
└─────────────────────────────────────────────┘
```

依赖方向**只许往下**:`main.ts` → `shell/` 与 `core/`;`shell/electron-tray.ts` → `core/types`;`core/*` 之间平级互引。**`core/` 不允许 import electron**,这是可替换壳的前提。

## 3. 核心模块

### 3.1 `src/main.ts` —— 编排器

持有应用全部可变状态(模块级 `let`):

| 状态 | 含义 |
|---|---|
| `status: StatusInfo` | 最近一次轮询结果(初始为 `partial` 黄灯,首次轮询后覆盖为真实状态) |
| `busy` | 启动/停止/保存重启进行中(置灰 UI、蒙版) |
| `runningSince` | 进入 `running` 的时刻,用于"本次启动时长";停止归零 |
| `prevRunning` | 上一轮是否 running(检测状态跳变) |
| `autostartEnabled` | 开机自启开关 |
| `lastPortTest` / `lastSave` / `portError` / `saveStage` | 推给设置窗的端口测试结果 / 保存反馈 / 校验错误 / 保存重启阶段 |

通知状态机(避免"自己点的操作"也弹通知):

| 状态 | 含义 |
|---|---|
| `prevState` | 上一轮服务状态(首次轮询只建基线不通知) |
| `expectStop` / `expectStart` | 手动点了停/启时置位;回到对应状态后清除 |
| `partialSince` / `partialNotified` | 黄灯持续计时,超 10s 弹一次"启动缓慢" |
| `startPendingAt` | 点启动后的黄灯窗口(15s),超时放弃黄灯回落真实状态 |

**启动序列**(`app.whenReady()` 内):

```
isAutostartEnabled(currentExePath())   // 读一次自启状态
shell.onEvent(handleEvent)             // 挂事件总线
await shell.init()                     // 点亮托盘
await refresh()                        // 立即探测一次
setInterval(refresh, 3000)             // 之后每 3s 轮询
// 开机自启合并开关:托盘随系统启动且服务没在跑,就一并拉起
if (autostartEnabled && status.state === "stopped") start-service
```

**`refresh()`**:`checkStatus()` → 维护 `runningSince/prevRunning` → 启动窗口黄灯逻辑 → `trackStatusChange()`(跳变/卡住通知)→ `shell.setStatus()`(图标/tooltip/呼吸灯)→ `shell.refreshMenu()` → `pushSettings()`。

**`handleEvent(event: MenuEvent)`** 是中央分发,处理 10 种事件:`open-management / open-settings / settings-tick / start-service / stop-service / notify-action / toggle-autostart / test-port / save-ports / quit`。

要点:

- **`open-management`**:不直接用端口号拼 URL,而是 `readManagementUrl(...)` 读 CCR 的 `service.json`,因为管理 URL 里带**每次启动都变的 RPC token**。
- **`save-ports`**:校验两端口都是 `1..65535` 整数且**不能相同**;服务在跑则自动重启让新端口生效(`stopService()` → `startService()`,期间用 `saveStage` 推送"正在停止旧进程…/正在启动服务…"阶段),没在跑则提示"下次启动生效"。`lastSave`/`portError` 3 秒后由主进程 `flashFeedback()` 自动清除。
- **`start/stop-service`**:`busy=true` → 刷新 UI → 调 ccr → `busy=false` → `refresh()`。
- **`notify-action`**:通知弹窗的动作按钮等价于对应菜单操作(`restart-service` / `open-management`)。
- **单实例**:`app.requestSingleInstanceLock()`,第二个实例直接退出。
- **常驻**:`app.on("window-all-closed", () => {})` 注册空处理器,覆盖 Electron "窗口全关就退出" 的默认行为。

**托盘资源统计**(`buildSettingsState()` 内计算,随每次状态推送):

- `avgCpuPercent` = `process.cpuUsage()`(进程启动至今的累计 user+system 微秒)÷ `process.uptime()` —— **自进程启动的累计平均**,按单核 100% 计,多线程合计可超 100%。
- `memRssMb` = `process.memoryUsage().rss` —— 常驻物理内存。

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
export function testPort(port): Promise<"free"|"in-use"|"invalid">
```

- Windows 上命令是 `ccr.cmd`,必须 `shell: true`;`windowsHide: true`、`stdio: "ignore"`;非零退出码 reject。
- `startService()` 注入两个环境变量:`CCR_WEB_PORT=<管理口>`(上游原生支持)与 `CCR_GATEWAY_PORT=<网关口>`(**本地 fork 补丁**,见根目录 `docs/PATCHES.md`)。**没有单独的 `restartService()`**,保存重启由 `main.ts` 串 `stop + start` 实现,以便在中间推阶段文字。
- `testPort` 不连服务,而是在本地 `net.createServer()` 试绑 `127.0.0.1:port`:绑得上 → `free`,`EADDRINUSE` → `in-use`,其它错误 → `invalid`,入参非法 → `invalid`。

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
- 自启目标命令由 `main.ts` 的 `autostartTarget()` 给出:打包后就是 exe 本体;**开发期是裸 electron 二进制,必须把应用目录作为参数一起写进注册表**(`"electron.exe" "项目目录"`),否则开机启动的是 Electron 默认欢迎窗口。Linux 同理(`autostart.ts` 的 `currentExePath()` 优先 `$APPIMAGE`)。

### 3.7 `src/core/types.ts` —— 类型

纯类型,无运行时代码。关键:`ServiceState = "running"|"partial"|"stopped"`、`StatusInfo`(只有 `state` 一个字段,探测细节不进载荷)、`MenuEvent`(11 种事件的判别联合)、`PortTestResult`、`NotifyKind/NotifyInfo`、`SettingsState`。

## 4. Electron 壳实现细节(`src/shell/electron-tray.ts`)

### 4.1 托盘本体

- `ASSETS = __dirname/../assets` —— 运行时 `__dirname` 是 `dist/`,所以指向**项目根的 `assets/`**(不在 `dist` 里)。
- `init()` 先试 `assets/icon.png`(**仓库里当前不存在这个文件**),`nativeImage.isEmpty()` 时退回黄色 partial 图标。首次轮询(≤2.4s)后覆盖为真实状态。
- tooltip 初始 `"Yue"`,之后随状态变 `"Yue — 运行中/启动中…/已停止"`。
- **左击 → `open-management`,右击 → 自绘弹窗**。
- **黄灯呼吸效果**:`partial` 状态下用 `tray-yellow-32.png` 与 `tray-yellow-dim-32.png` 两帧每 500ms 交替。

### 4.2 自绘菜单弹窗(替代原生 `Menu`)

无边框、透明、置顶(`pop-up-menu` 层)、`skipTaskbar`、`closable: false` 的 `BrowserWindow`,加载 `assets/menu.html`。**用时才建、失焦即毁**——隐藏窗口也占渲染进程,收起就释放(`blur` 里 `destroy()`)。

- **`closable: false`** 是关键(见 4.5 退出问题)。
- **尺寸实测**:等 `did-finish-load` 后(推送与测量走同一 IPC 通道按序到达,先渲染完再量)读 `#menu.scrollWidth/scrollHeight`,再 `+2px` 余量防止取整裁剪。注释明确:**不能用 `requestAnimationFrame`,因为隐藏窗口不产帧,rAF 不会触发**。
- **定位**:以**鼠标点击位置**锚定(弹窗出现在点击点右上侧);点击点在屏幕上半 → 往下弹,下半 → 往上弹;再夹取到所在显示器的 `workArea` 内(留 4px 边距)。
- **开着时内容变化要重排**:`partial`(启动中)状态会隐藏"打开管理界面"一项,状态翻成 running 后内容多一行;`refreshMenu()` 推状态时若弹窗可见,`layoutPopup()` 重测内容并调整边界(顶边固定、底边夹工作区内),否则窗口尺寸停留在打开那一刻,末项(退出)被挤出可视区点不到。

### 4.3 自绘通知弹窗(绕开专注助手)

不走 Windows toast——**专注助手会压系统通知**;改为右下角自绘弹窗,无边框透明、不抢焦点(`focusable: false`)、置顶(`screen-saver` 层)。**窗口用时才建、队列清空即毁**。

- 尺寸两种:带动作按钮 340×118,纯展示 340×86;主显示器 `workArea` 右下角留 12px 边距。
- `showInactive()` 显示但不夺焦点;**6 秒后自动消失**。
- **队列最多 3 条**,溢出丢最旧;一条消失后自动播下一条,播完销毁窗口。
- 动作按钮(`重启服务`/`打开管理界面`)点击 → 关弹窗 → 透传 `notify-action` 给业务层。

### 4.4 设置窗

368×408 无边框**透明底**深色窗(圆角由 `#panel` 的 CSS `border-radius: 12px` 画出——无边框窗口的直角是 body 背景画出来的,要圆角必须透明),加载 `assets/settings.html`。

- 已打开时再调 `openSettings()` 只是 `show()+focus()`,不重开。
- **`dismiss` 是"隐藏"不是"销毁"** —— 渲染进程和它的 1s tick interval 都保留,下次快开;首次 `ready-to-show` 时居中于**托盘图标所在显示器**的 workArea。
- **窗口高度逐帧跟随内容**:渲染层 `ResizeObserver` 量 `#panel` 逐帧上报 `content-height`,主进程 `applySettingsHeight()` 只动高度(顶边固定向下长),底边夹在工作区内(留 8px),最小 300。CSS 过渡是唯一动画时钟,不起定时器动画。
- 设置窗只要存在(含隐藏)渲染层**每秒发一次 `settings-tick`**,主进程重推全量状态——运行时长走动、保存重启阶段推进、托盘资源数值实时刷新。
- 界面分四块:本次启动时长(hero)、托盘资源占用(平均 CPU/内存 RSS)、常规(开机自启)、网络端口(管理口/服务口,含重置/测试/保存重启)。

### 4.5 为什么 `quit()` 不能走 `app.quit()`

```ts
quit(): void {
  this.stopBreathing();
  // 清通知定时器
  this.popup?.destroy();
  this.settingsWindow?.destroy();
  this.notifyWindow?.destroy();
  this.tray?.destroy();
  app.exit(0);
}
```

注释写明:弹窗 `closable: false` 会让 `app.quit()` 卡在售窗阶段退不掉,所以托盘**手动销毁全部资源再 `app.exit(0)` 强制退**。

## 5. IPC 协议

全部 **fire-and-forget**(`ipcRenderer.send` / `ipcMain.on` / `webContents.send`),**没有 `invoke`/`handle`,也没有请求 ID**。

| 通道 | 方向 | 载荷 | 生产者 → 消费者 |
|---|---|---|---|
| `menu:state` | main → 菜单渲染器 | `MenuOptions { status, busy }` | `ElectronTrayShell.pushState` → `menu-preload.onState` |
| `menu:event` | 菜单渲染器 → main | `MenuEvent` 或 `{kind:"dismiss"}` | `menu-preload.send` → `ipcMain.on("menu:event")` |
| `settings:state` | main → 设置渲染器 | `SettingsState { uptimeMs, avgCpuPercent, memRssMb, autostartEnabled, managementPort, gatewayPort, serviceState, busy, portTest?, lastSave?, saveStage?, portError? }` | `ElectronTrayShell.pushSettingsState` → `settings-preload.onState` |
| `settings:event` | 设置渲染器 → main | `MenuEvent` 或 `{kind:"dismiss"/"content-height"}`(含每秒 `settings-tick`) | `settings-preload.send` → `ipcMain.on("settings:event")` |
| `notify:state` | main → 通知渲染器 | `NotifyInfo { kind, title, body, action? }` | `ElectronTrayShell.showNextNotify` → `notify-preload.onState` |
| `notify:event` | 通知渲染器 → main | `{kind:"notify-action", action}` | `notify-preload.send` → `ipcMain.on("notify:event")` |

- 三个 `ipcMain.on` 在 `init()` 里**随托盘生命周期只注册一次**(窗口本体可反复重建);shell 层先消化 `dismiss`(菜单:关窗;设置:隐藏;通知:关弹窗)与 `content-height`(直接调窗口高度),其余事件透传给 `main.handleEvent`。
- 推送是"缓存 + 可见才发":`updateSettings()`/`refreshMenu()` 先存 `lastSettings`/`lastOptions`,窗口可见时才真正 `send`。
- 渲染器全局:`window.ccrMenu` / `window.ccrSettings` / `window.ccrNotify`,各自 `{ onState, send }`。

## 6. 数据流

**状态推送链(每 3s,由轮询驱动)**:

```
main.refresh()
  └─ core/status.checkStatus()  (HTTP 探测,端口现读)
       ├─ trackStatusChange()      → 跳变/卡住时 notify()
       ├─ shell.setStatus()        → 换图标 + tooltip + 呼吸灯
       ├─ shell.refreshMenu()      → 缓存;菜单弹窗可见时推 "menu:state"
       └─ pushSettings()           → 缓存;设置窗可见时推 "settings:state"
```

**设置窗 tick 链(每秒,仅设置窗开着)**:

```
settings.html setInterval(1s) → settings-tick
  → main.pushSettings() → shell.updateSettings() → "settings:state"
     (运行时长走动 / 保存重启阶段推进 / 托盘资源数值刷新)
```

**命令链(UI 事件触发)**:

```
renderer 点击/按键
  └─ preload.send(event)
       └─ ipcMain "menu:event" / "settings:event" / "notify:event"(shell 层先消化 dismiss 等)
            └─ ElectronTrayShell.emit → main.handleEvent
                 ├─ ccr.start/stop             → ccr CLI
                 ├─ settings.writeSettings     → settings.json
                 ├─ autostart.setAutostartEnabled → 注册表 / .desktop
                 ├─ testPort                   → 本地 bind 试占用
                 └─ 结尾 refresh()             → 回到状态推送链
```

## 7. 构建与运行

`ccr-tray/package.json`:

- `main: dist/main.cjs`
- `build`:`esbuild src/main.ts src/shell/menu-preload.ts src/shell/settings-preload.ts src/shell/notify-preload.ts --bundle --platform=node --format=cjs --external:electron --outdir=dist --out-extension:.js=.cjs`
- `start` / `dev`:build 之后 `electron .`(`dev` 多传一个 `--dev`,但**源码里没人读这个参数**)
- `typecheck`:`tsc --noEmit`
- `pack`:build 之后 `electron-builder --dir` —— 免安装 unpacked 目录(调试打包问题用)
- `dist`:build 之后 `electron-builder` —— Windows NSIS 安装包,产物在 `release/`

要点:

- esbuild 四入口 → `dist/main.cjs` + `dist/shell/` 下三个 preload;electron 是 external。
- `out-extension:.js=.cjs` 必须写,因为项目没有 `"type":"module"`,esbuild 默认会输出 `.js`。
- **打包用 electron-builder**:`files` 显式包含 `dist/`、`assets/`、`package.json`,打进 `app.asar`;`assets/` 在 asar 内,`__dirname/../assets` 解析到 `app.asar/assets`,Electron 可直接读写,**无需改 `ASSETS` 代码**。应用图标用 `build/icon.ico`(由 `assets/tray-green-48.png` 经 `png-to-ico` 生成)。
- NSIS 配置:`oneClick: false`(向导式、可选安装目录)、不创建桌面快捷方式(托盘应用);安装后开机自启写注册表,目标 exe 路径来自 `app.isPackaged` 分支,天然正确。
- **`assets/` 不拷进 `dist/`**;dev 靠 `__dirname/../assets` 指回项目根,打包靠 asar 内的同相对路径,两种模式共用一份代码。

## 8. 设计决策与权衡

| 决策 | 原因 |
|---|---|
| `core/` 零 Electron | 让壳可替换(koffi/D-Bus),`main.ts` 与 `core/` 不动 |
| 每次 `readSettings()` 现读文件 | 端口保存后下一轮轮询即生效,托盘不用重启 |
| HTTP 404 算"活" | 探测只关心端口有没有进程应答,不关心路径 |
| 设置窗隐藏而非销毁 | 下次打开秒开,保留渲染进程状态;代价是后台一直占一个 renderer |
| 菜单/通知窗口用时才建、用完即毁 | 隐藏窗口也占渲染进程,托盘要的是轻常驻 |
| 自绘通知而非系统 toast | Windows 专注助手会压系统通知,自绘弹窗绕不开的问题不存在 |
| 通知不抢焦点、队列丢最旧 | 托盘通知不该打断用户打字;刷屏时保最新 |
| `reg.exe` 输出全吞 | 中文 Windows 的 GBK 输出接到 UTF-8 终端会乱码,只看退出码 |
| 弹窗尺寸实测而非写死 | 绕开系统缩放对原生菜单的放大,宽度正好包住内容 |
| 自绘菜单而非原生 `Menu` | 原生菜单在 Windows 缩放下样式不可控 |
| 设置窗透明底 + CSS 圆角 | 无边框窗口直角由 body 背景画出;代价是丢 DWM 投影(与菜单/通知一致) |
| IPC 全 fire-and-forget | 状态推送本来就单向;命令事件不需要回执,简单够用 |

## 9. 与 CCR fork 补丁的关系

- **依赖 fork 补丁**:`startService()` 注入的 `CCR_GATEWAY_PORT` 环境变量是**本地 fork 的补丁**,上游没有。详见仓库根 `docs/PATCHES.md`(那里把它列为 patch 6;`core/ccr.ts` 的注释写"补丁 7",两处口径不一致)。
- 管理页 URL 带每次启动都变的 token,所以 `open-management` 必须走 `service.json`,不能只拼端口。

## 10. 已知问题与改进方向

| 问题 | 现状 | 建议方向 |
|---|---|---|
| `assets/icon.png` 缺失 | 首次点亮总是黄色 partial 图标 | 补一张应用图标 |
| 端口相等校验未下沉 | 只在 `main.ts`,`settings.ts` 不强制 | 把"两端口不能相同"加进 `sanitize/writeSettings` |
| "补丁 6 / 补丁 7" 口径不一致 | `PATCHES.md` vs `core/ccr.ts` 注释 | 统一 |
| `uptimeMs` 是托盘观测口径 | 托盘或 CCR 重启就归零,不是真实进程时长 | 如需真实时长,改从 CCR 侧读 |
| `avgCpuPercent` 是自启动累计平均 | 随运行时间趋于平稳,多线程下可超 100%(单核口径) | 如需瞬时占用,改滑动窗口采样 `app.getAppMetrics()` |
| 3s 轮询无界面也在跑 | 每轮最多两次本地 HTTP | 可在无任何 UI 打开时降频/暂停 |
| 设置窗隐藏后 1s interval 仍在 | tick 只要设置窗存在就发(运行时长 + 托盘资源实时刷新) | 可在隐藏时清 interval |
| `--dev` 参数没人读 | `npm run dev` 传了但源码不消费 | 接上(如开 DevTools)或从脚本里去掉 |
| 透明窗口无系统投影 | 设置/菜单/通知三窗都无 DWM shadow,边缘较"平" | 需要时用 `roundedCorners`(Win11)或自绘阴影 |
