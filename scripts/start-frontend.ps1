param(
  [string]$HostAddress = "127.0.0.1",
  [int]$Port = 5173
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "front"
$NodeModulesDir = Join-Path $FrontendDir "node_modules"
$ViteCommand = Join-Path $FrontendDir "node_modules\.bin\vite.cmd"
$FrontendEnvFile = Join-Path $FrontendDir ".env"
$TurnstilePlaceholders = @(
  "your_site_key_here",
  "replace-with-cloudflare-turnstile-site-key"
)

function Get-EnvFileValue {
  param(
    [string]$Path,
    [string]$Name
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }

  foreach ($Line in Get-Content -LiteralPath $Path) {
    $TrimmedLine = $Line.Trim()
    if (-not $TrimmedLine -or $TrimmedLine.StartsWith("#")) {
      continue
    }

    $SeparatorIndex = $TrimmedLine.IndexOf("=")
    if ($SeparatorIndex -lt 0) {
      continue
    }

    $Key = $TrimmedLine.Substring(0, $SeparatorIndex).Trim()
    if ($Key -ne $Name) {
      continue
    }

    $Value = $TrimmedLine.Substring($SeparatorIndex + 1).Trim()
    $Value = $Value.Trim('"')
    $Value = $Value.Trim("'")
    return $Value
  }

  return ""
}

if (-not (Test-Path -LiteralPath $NodeModulesDir)) {
  Write-Host "front/node_modules is missing. Run npm ci in front first."
  exit 1
}

if (-not (Test-Path -LiteralPath $ViteCommand)) {
  Write-Host "Vite command is missing. Run npm ci in front first."
  exit 1
}

$ProjectTurnstileSiteKey = Get-EnvFileValue -Path $FrontendEnvFile -Name "VITE_TURNSTILE_SITE_KEY"
$CurrentTurnstileSiteKey = ""
if ($null -ne $env:VITE_TURNSTILE_SITE_KEY) {
  $CurrentTurnstileSiteKey = $env:VITE_TURNSTILE_SITE_KEY.Trim()
}

if (
  $ProjectTurnstileSiteKey -and
  -not $TurnstilePlaceholders.Contains($ProjectTurnstileSiteKey) -and
  (-not $CurrentTurnstileSiteKey -or $TurnstilePlaceholders.Contains($CurrentTurnstileSiteKey))
) {
  $env:VITE_TURNSTILE_SITE_KEY = $ProjectTurnstileSiteKey
}

Write-Host "Frontend directory: $FrontendDir"
Write-Host "URL: http://${HostAddress}:$Port"

Set-Location -LiteralPath $FrontendDir
& $ViteCommand --host $HostAddress --port $Port --strictPort
