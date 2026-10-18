# publish-local-ccr.ps1
# 用本地 claude-code-router（custom 分支）构建并发布到全局 npm 安装目录。
# 用法: powershell -File scripts\publish-local-ccr.ps1
$ErrorActionPreference = 'Stop'

$MFC        = Split-Path $PSScriptRoot -Parent
$CCR        = Join-Path $MFC 'claude-code-router'
$GLOBAL_PKG = 'Z:\Nodejs_Global\node_global\node_modules\@musistudio\claude-code-router'

# 0. 守卫：当前 node 绝不能是 Electron（否则 better-sqlite3 会编错 ABI）
$isElectron = node -p "!!process.versions.electron"
if ($isElectron -eq 'true') {
    Write-Error "当前 PATH 里的 node 是 Electron 运行时，请换用 Z:\Nvm_Nodejs\nodejs 的真 node 后再跑。"
    exit 1
}

# 1. 装依赖（仅首次；workspace 会装好 cli/core/ui/electron 全部依赖）
Push-Location $CCR
if (-not (Test-Path 'node_modules')) {
    Write-Host "==> npm install（首次，较慢，better-sqlite3 需要编译）"
    npm install
    if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "npm install 失败"; exit 1 }
}

# 2. 构建产物（esbuild → packages/cli/dist 与 packages/core/dist）
Write-Host "==> npm run build:assets"
npm run build:assets
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "构建失败"; exit 1 }
Pop-Location

# 3. 停掉正在跑的 ccr 服务（文件被占用会拷不进去）
Write-Host "==> ccr stop"
ccr stop 2>$null

# 4. 覆盖全局 dist（全局 dist = cli/dist 与 core/dist 的合并）
Write-Host "==> 同步 dist -> $GLOBAL_PKG\dist"
Remove-Item -Recurse -Force "$GLOBAL_PKG\dist" -ErrorAction SilentlyContinue
robocopy "$CCR\packages\cli\dist"  "$GLOBAL_PKG\dist" /E /NFL /NDL /NJH | Out-Null
robocopy "$CCR\packages\core\dist" "$GLOBAL_PKG\dist" /E /NFL /NDL /NJH | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Error "robocopy 失败 (code $LASTEXITCODE)"; exit 1 }

# 5. 重启服务
Write-Host "==> ccr start"
ccr start

Write-Host "`n完成。验证: 打开 http://127.0.0.1:3458/ 看供应商列表是否正常。"
Write-Host "注意: 全局目录里的 node_modules\better-sqlite3 未动（补丁未改依赖，原生模块复用）。"
