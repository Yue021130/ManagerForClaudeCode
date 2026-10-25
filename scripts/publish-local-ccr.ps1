# publish-local-ccr.ps1
# 用本地 claude-code-router（custom 分支）构建并发布到全局 npm 安装目录。
# 用法: powershell -File scripts\publish-local-ccr.ps1
$ErrorActionPreference = 'Stop'

$MFC        = Split-Path $PSScriptRoot -Parent
$CCR        = Join-Path $MFC 'claude-code-router'
# 全局安装根目录由 npm 自己报告
$GLOBAL_PKG = Join-Path (npm prefix -g) 'node_modules\@musistudio\claude-code-router'

# 0. 装依赖（仅首次；workspace 会装好 cli/core/ui/electron 全部依赖）
Push-Location $CCR
if (-not (Test-Path 'node_modules')) {
    Write-Host "==> npm install（首次，较慢，better-sqlite3 需要编译）"
    npm install
    if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "npm install 失败"; exit 1 }
}

# 1. 构建产物（esbuild → packages/cli/dist 与 packages/core/dist）
Write-Host "==> npm run build:assets"
npm run build:assets
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "构建失败"; exit 1 }
Pop-Location

# 2. 停掉正在跑的 ccr 服务（文件被占用会拷不进去）
Write-Host "==> ccr stop"
ccr stop 2>$null

# 3. 覆盖全局 dist（全局 dist = cli/dist 与 core/dist 的合并）
Write-Host "==> 同步 dist -> $GLOBAL_PKG\dist"
Remove-Item -Recurse -Force "$GLOBAL_PKG\dist" -ErrorAction SilentlyContinue
robocopy "$CCR\packages\cli\dist"  "$GLOBAL_PKG\dist" /E /NFL /NDL /NJH | Out-Null
robocopy "$CCR\packages\core\dist" "$GLOBAL_PKG\dist" /E /NFL /NDL /NJH | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Error "robocopy 失败 (code $LASTEXITCODE)"; exit 1 }

# 4. 重启服务
Write-Host "==> ccr start"
ccr start

Write-Host ""
Write-Host "💫 发布完成。" -ForegroundColor Green
Write-Host "  - ccr 服务已重启，补丁版本开始生效 🚀🚀🚀"
Write-Host "  -🕸 浏览器打开 http://127.0.0.1:3458/ ，确认信息列表正常即可"
