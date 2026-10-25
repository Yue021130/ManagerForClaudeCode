# ccr-tray

CCR(Claude Code Router)服务的桌面托盘程序,基于 Electron + TypeScript。常驻系统托盘,监控 CCR 服务状态,提供启停、打开管理界面、端口设置、开机自启等操作;服务意外停止/恢复时弹应用内通知。

## 功能

- **状态监控**:托盘图标三色显示(绿=运行中 / 黄=启动中,带呼吸灯 / 红=已停止),每 3 秒探测一次
- **服务控制**:左键托盘打开管理界面(自动带 RPC token),右键弹出自绘菜单启动/停止服务
- **端口设置**:设置窗口可视化管理端口、服务端口,改动测试可用后保存并自动重启生效
- **开机自启**:注册表(Windows)/ XDG autostart(Linux),可随系统启动自动拉起服务
- **托盘资源占用**:设置窗口实时显示托盘进程的平均 CPU 与内存
- **应用内通知**:服务崩溃、恢复、启动缓慢时右下角滑入提示,可一键重启服务

## 环境要求

- **必须**:目标机器全局安装 [claude-code-router](https://github.com/musistudio/claude-code-router),命令行可执行 `ccr`(托盘通过 `ccr start/stop` 控制服务)
- Node.js 22+、npm(仅开发/打包需要)

## 开发

```bash
npm install        # 安装依赖
npm start          # 构建并启动(electron .)
npm run dev        # 同上,多传 --dev(预留参数,暂未消费)
npm run typecheck  # tsc --noEmit 类型检查
npm run build      # esbuild 打包到 dist/
```

## 打包分发

使用 electron-builder,输出 NSIS 向导式安装包:

```bash
npm run dist       # 生成 dist/CCR Tray Setup <版本>.exe(约 194MB)
npm run pack       # 只生成免安装目录 dist/win-unpacked/
npm run icon       # 由 assets/tray-green-48.png 重新生成 build/icon.ico
```

将 `CCR Tray Setup <版本>.exe` 拷到目标 Windows 机器运行即可。安装后开机自启自动指向安装目录的 exe。目标机器同样需要预装 `ccr` CLI。

## 配置与数据

| 内容 | 位置 |
|---|---|
| 托盘自身配置(两个端口) | `%APPDATA%\ccr-tray\settings.json` |
| 开机自启(Windows) | 注册表 `HKCU\...\Run\CCRTray` |
| 开机自启(Linux) | `~/.config/autostart/ccr-tray.desktop` |

默认端口:管理口 `3458`,服务口 `40229`。

## 项目结构

```
src/main.ts        编排器:状态机、事件分发、通知决策
src/core/          纯 Node 逻辑(零 Electron 依赖,壳可替换)
src/shell/         Electron 壳:托盘、自绘菜单/设置/通知三个弹窗、preload
assets/            三个弹窗的 HTML/CSS/JS 与托盘图标
docs/ARCHITECTURE.md  架构文档:分层、IPC 协议、数据流、设计决策
build/             应用图标(ico)与生成脚本
```

## 说明

- `startService()` 通过 `CCR_GATEWAY_PORT` 环境变量指定网关口,这是**本地 fork 的补丁**,上游 CCR 不具备,详见仓库根 `docs/PATCHES.md`
- Windows 优先,Linux 按 XDG 约定支持
