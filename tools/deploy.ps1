# ElArabyDev - Deploy Script
# Copies the unified extension source into deploy/ (the folder you load in Edge)
# Usage:  powershell -ExecutionPolicy Bypass -File tools\deploy.ps1
# After running: edge://extensions -> click Refresh on El Araby Unified System

$ErrorActionPreference = "Stop"

$root      = Split-Path -Parent $PSScriptRoot
$source    = Join-Path $root "src\unified-extension"
$deploy    = Join-Path $root "deploy"
$backupDir = Join-Path $root ("backups\deploy_backup_" + (Get-Date -Format "yyyyMMdd_HHmmss"))

Write-Host "=== El Araby Deploy Script ===" -ForegroundColor Cyan
Write-Host "Source: $source"
Write-Host "Deploy: $deploy"
Write-Host ""

if (-not (Test-Path -LiteralPath $source)) {
    Write-Host "[!!] Source not found: $source" -ForegroundColor Red
    exit 1
}

# 1. Backup current deploy if it exists
if (Test-Path -LiteralPath $deploy) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Copy-Item -Path (Join-Path $deploy "*") -Destination $backupDir -Recurse -Force
    Write-Host "  [OK] Backup created: backups\deploy_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')" -ForegroundColor DarkGreen
}

# 2. Syntax gate — refuse to deploy broken JavaScript.
#    IMPORTANT: this runs BEFORE the deploy folder is wiped, so an abort
#    always leaves the previously working deploy/ intact.
function Test-JsSyntax {
    param([string]$Root)
    $bad = @()
    # native stderr would otherwise surface as a terminating error because the
    # script sets $ErrorActionPreference = "Stop"; relax it just for the probe.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        Get-ChildItem -LiteralPath $Root -Recurse -Filter *.js -File -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch '\\node_modules\\|\\\.git\\|\\dist\\' } |
            ForEach-Object {
                & node --check $_.FullName 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) { $bad += $_.FullName }
            }
    } finally {
        $ErrorActionPreference = $prevEap
    }
    return $bad
}

# Node must exist for the gate to mean anything
$nodeOk = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
if (-not $nodeOk) {
    Write-Host "[!!] node not found — syntax gate skipped (install Node.js to enable)" -ForegroundColor Red
} else {
    Write-Host "  [..] Validating source syntax..." -ForegroundColor Cyan
    $srcBad = Test-JsSyntax -Root $source
    if ($srcBad.Count -gt 0) {
        Write-Host "[!!] DEPLOY ABORTED — syntax errors in source (deploy/ left untouched):" -ForegroundColor Red
        $srcBad | ForEach-Object { Write-Host "     - $_" -ForegroundColor Red }
        exit 1
    }
    Write-Host "  [OK] Source syntax OK" -ForegroundColor DarkGreen
}

# 2.5 Clean deploy folder
if (Test-Path -LiteralPath $deploy) {
    Remove-Item -LiteralPath $deploy -Recurse -Force
}
New-Item -ItemType Directory -Path $deploy -Force | Out-Null

# 3. Copy fresh source (exclude dev-only dirs)
$exclude = @("node_modules", ".git", "dist", "*.map", "*.bak")
Get-ChildItem -LiteralPath $source -Force | ForEach-Object {
    $skip = $false
    foreach ($pat in $exclude) {
        if ($_.Name -like $pat) { $skip = $true; break }
    }
    if (-not $skip) {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $deploy $_.Name) -Recurse -Force
        Write-Host "  [OK] $($_.Name)" -ForegroundColor DarkGreen
    } else {
        Write-Host "  [--] skipped (excluded): $($_.Name)" -ForegroundColor Yellow
    }
}

# 3.5 Post-copy verification — the deploy folder must parse too
if ($nodeOk) {
    Write-Host "  [..] Verifying deployed syntax..." -ForegroundColor Cyan
    $depBad = Test-JsSyntax -Root $deploy
    if ($depBad.Count -gt 0) {
        Write-Host "[!!] Deployment contains syntax errors:" -ForegroundColor Red
        $depBad | ForEach-Object { Write-Host "     - $_" -ForegroundColor Red }
        exit 1
    }
    Write-Host "  [OK] Deployed syntax verified" -ForegroundColor DarkGreen
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Next steps:"
Write-Host "  1. Open edge://extensions"
Write-Host "  2. Enable Developer mode"
Write-Host "  3. 'Load unpacked' -> choose: $deploy"
Write-Host "  4. For updates: re-run this script + click Refresh on the extension"
Write-Host ""
