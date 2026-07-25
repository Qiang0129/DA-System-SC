param(
  [string]$HostAddress = "127.0.0.1",
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendScript = Join-Path $PSScriptRoot "start-backend.ps1"
$FrontendScript = Join-Path $PSScriptRoot "start-frontend.ps1"
$PowerShellCommand = (Get-Command powershell -ErrorAction Stop).Source

$BackendArgs = "-NoExit -ExecutionPolicy Bypass -File '$BackendScript' -HostAddress $HostAddress -Port $BackendPort"
$FrontendArgs = "-NoExit -ExecutionPolicy Bypass -File '$FrontendScript' -HostAddress $HostAddress -Port $FrontendPort"

Write-Host "正在打开后端服务窗口..."
Start-Process -FilePath $PowerShellCommand -ArgumentList $BackendArgs -WorkingDirectory $RepoRoot

Write-Host "正在打开前端服务窗口..."
Start-Process -FilePath $PowerShellCommand -ArgumentList $FrontendArgs -WorkingDirectory $RepoRoot

Write-Host "前端地址: http://${HostAddress}:$FrontendPort"
Write-Host "后端健康检查: http://${HostAddress}:$BackendPort/api/health"
