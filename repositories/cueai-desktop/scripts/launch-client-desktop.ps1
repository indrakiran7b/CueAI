# Launch CueAI desktop against a remote CueAI web server.
#
# Usage:
#   .\scripts\launch-client-desktop.ps1 `
#     -WebUrl "https://your-subdomain.ngrok-free.app" `
#     -ExePath "..\windows\release\win-unpacked\CueAI.exe"
#
param(
  [Parameter(Mandatory = $true)]
  [string]$WebUrl,

  [string]$ExePath = "..\windows\release\win-unpacked\CueAI.exe"
)

$env:CUEAI_WEB_URL = $WebUrl.TrimEnd("/")

if (-not (Test-Path $ExePath)) {
  Write-Error "CueAI executable not found at $ExePath. Build with: npm run dist:desktop"
  exit 1
}

Write-Host "Starting CueAI → $env:CUEAI_WEB_URL"
Start-Process -FilePath $ExePath
