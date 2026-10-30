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

# 2. Clean deploy folder
if (Test-Path -LiteralPath $deploy) {
    Remove-Item -LiteralPath $deploy -Recurse -Force
}
New-Item -ItemType Directory -Path $deploy -Force | Out-Null

# 3. Copy fresh source (exclude dev-only dirs)
$exclude = @("node_modules", ".git", "dist", "*.map")
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

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Next steps:"
Write-Host "  1. Open edge://extensions"
Write-Host "  2. Enable Developer mode"
Write-Host "  3. 'Load unpacked' -> choose: $deploy"
Write-Host "  4. For updates: re-run this script + click Refresh on the extension"
Write-Host ""