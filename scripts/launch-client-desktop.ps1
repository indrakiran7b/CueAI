# Launch CueAI desktop against a remote licensing server (Option B).
#
# Usage:
#   .\scripts\launch-client-desktop.ps1 `
#     -WebUrl "https://your-subdomain.ngrok-free.app" `
#     -PublicKey "-----BEGIN PUBLIC KEY-----`nMCow...`n-----END PUBLIC KEY-----" `
#     -ExePath ".\apps\desktop\windows\release\win-unpacked\CueAI.exe"
#
param(
  [Parameter(Mandatory = $true)]
  [string]$WebUrl,

  [Parameter(Mandatory = $true)]
  [string]$PublicKey,

  [string]$ExePath = ".\apps\desktop\windows\release\win-unpacked\CueAI.exe"
)

$env:CUEAI_WEB_URL = $WebUrl.TrimEnd("/")
$env:LICENSE_SIGNING_PUBLIC_KEY = $PublicKey
$env:LICENSE_ENFORCEMENT = "true"

if (-not (Test-Path $ExePath)) {
  Write-Error "CueAI executable not found at $ExePath. Build with: npm run dist:desktop"
  exit 1
}

Write-Host "Starting CueAI → $env:CUEAI_WEB_URL"
Start-Process -FilePath $ExePath
