param(
  [string]$HostAddress = "127.0.0.1",
  [int]$Port = 5173
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "front"
$NodeModulesDir = Join-Path $FrontendDir "node_modules"

if (-not (Test-Path -LiteralPath $NodeModulesDir)) {
  Write-Host "未检测到 front/node_modules，请先在 front 目录执行 npm install。"
  exit 1
}

Write-Host "前端目录: $FrontendDir"
Write-Host "访问地址: http://${HostAddress}:$Port"

Set-Location -LiteralPath $FrontendDir
npm run dev -- --host $HostAddress --port $Port
