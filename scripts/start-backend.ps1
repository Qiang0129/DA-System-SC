param(
  [string]$HostAddress = "127.0.0.1",
  [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
$AnacondaPython = "D:\ProgramData\anaconda3\python.exe"

if (Test-Path -LiteralPath $VenvPython) {
  $PythonCommand = $VenvPython
  $PythonSource = "backend/.venv"
} elseif (Test-Path -LiteralPath $AnacondaPython) {
  $PythonCommand = $AnacondaPython
  $PythonSource = "Anaconda"
} else {
  $PythonCommandInfo = Get-Command python -ErrorAction Stop
  $PythonCommand = $PythonCommandInfo.Source
  $PythonSource = "系统 PATH"
}

Write-Host "后端目录: $BackendDir"
Write-Host "Python 来源: $PythonSource"
Write-Host "访问地址: http://${HostAddress}:$Port"

Set-Location -LiteralPath $BackendDir
& $PythonCommand -m uvicorn main:app --reload --host $HostAddress --port $Port
