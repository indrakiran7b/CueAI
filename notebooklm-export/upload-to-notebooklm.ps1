# CueAI NotebookLM Upload Script
# Creates notebook "CueAI MVP v1.0" and adds the 4 markdown exports as sources.

$ErrorActionPreference = "Stop"

$nlm = "$env:APPDATA\Python\Python314\Scripts\nlm.exe"
$exportDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path $nlm)) {
    Write-Error "nlm.exe not found at: $nlm`nRun: nlm login  (or install notebooklm CLI first)"
}

$sources = @(
    (Join-Path $exportDir "01-CueAI-MVP-Product-and-Technical-Scope.md"),
    (Join-Path $exportDir "02-CueAI-Tech-Stack.md"),
    (Join-Path $exportDir "03-CueAI-Architecture.md"),
    (Join-Path $exportDir "04-CueAI-Week1-Status-Aug-3-8.md")
)

foreach ($f in $sources) {
    if (-not (Test-Path $f)) {
        Write-Error "Missing source file: $f"
    }
}

Write-Host "Creating NotebookLM notebook: CueAI MVP v1.0"
$createOut = & $nlm notebook create "CueAI MVP v1.0" --json 2>&1
if ($LASTEXITCODE -ne 0) {
    # Fallback without --json if unsupported
    $createOut = & $nlm notebook create "CueAI MVP v1.0" 2>&1
}
Write-Host $createOut

# Extract notebook ID from JSON or plain text output
$notebookId = $null
$createText = ($createOut | Out-String)

if ($createText -match '"id"\s*:\s*"([^"]+)"') {
    $notebookId = $Matches[1]
}
elseif ($createText -match '(?i)notebook[_\s-]?id[:\s]+([A-Za-z0-9_-]+)') {
    $notebookId = $Matches[1]
}
elseif ($createText -match '(?i)\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b') {
    $notebookId = $Matches[1]
}
elseif ($createText -match '(?i)\b([A-Za-z0-9_-]{10,})\b') {
    # Last-resort: take a long token that looks like an ID from create output
    $lines = $createText -split "`n"
    foreach ($line in $lines) {
        if ($line -match '(?i)(id|notebook).*?([A-Za-z0-9_-]{12,})') {
            $notebookId = $Matches[2]
            break
        }
    }
}

if (-not $notebookId) {
    Write-Host ""
    Write-Host "Could not parse notebook ID from create output."
    Write-Host "Listing notebooks to find 'CueAI MVP v1.0'..."
    $listOut = & $nlm notebook list --json 2>&1
    Write-Host $listOut
    $listText = ($listOut | Out-String)
    if ($listText -match '(?s)"title"\s*:\s*"CueAI MVP v1\.0".*?"id"\s*:\s*"([^"]+)"') {
        $notebookId = $Matches[1]
    }
    elseif ($listText -match '(?s)"id"\s*:\s*"([^"]+)".*?"title"\s*:\s*"CueAI MVP v1\.0"') {
        $notebookId = $Matches[1]
    }
}

if (-not $notebookId) {
    Write-Error "Failed to resolve notebook ID. Create output was:`n$createText"
}

Write-Host ""
Write-Host "Notebook ID: $notebookId"
Write-Host "Adding markdown sources..."

foreach ($f in $sources) {
    $name = Split-Path $f -Leaf
    Write-Host "  + $name"
    & $nlm source add $notebookId --file $f --title $name --wait
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to add source: $f"
    }
}

Write-Host ""
Write-Host "Fetching notebook details..."
$getOut = & $nlm notebook get $notebookId --json 2>&1
if ($LASTEXITCODE -ne 0) {
    $getOut = & $nlm notebook get $notebookId 2>&1
}
Write-Host $getOut

$url = $null
$getText = ($getOut | Out-String)
if ($getText -match '"url"\s*:\s*"([^"]+)"') {
    $url = $Matches[1]
}
elseif ($getText -match 'https://notebooklm\.google\.com/[^\s"]+') {
    $url = $Matches[0]
}
else {
    $url = "https://notebooklm.google.com/notebook/$notebookId"
}

Write-Host ""
Write-Host "Done."
Write-Host "Notebook ID:  $notebookId"
Write-Host "Notebook URL: $url"
