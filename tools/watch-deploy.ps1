# ElArabyDev - Live Watcher & Auto-Deploy
# Watches src/unified-extension/ and automatically deploys changes to deploy/ in real-time.
# Usage: powershell -ExecutionPolicy Bypass -File tools\watch-deploy.ps1

$root   = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "src\unified-extension"
$deploy = Join-Path $root "deploy"

if (-not (Test-Path -LiteralPath $source)) {
    Write-Host "[!!] Source folder not found: $source" -ForegroundColor Red
    exit 1
}

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  El Araby Dev - Live Auto-Deploy Watcher" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Watching: $source" -ForegroundColor Yellow
Write-Host "Target:   $deploy" -ForegroundColor Green
Write-Host "Ready! Every saved change will instantly sync." -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

$fsw = New-Object System.IO.FileSystemWatcher
$fsw.Path = $source
$fsw.IncludeSubdirectories = $true
$fsw.EnableRaisingEvents = $true
$fsw.NotifyFilter = [System.IO.NotifyFilters]::FileName -bor [System.IO.NotifyFilters]::LastWrite

$action = {
    $path = $Event.SourceEventArgs.FullPath
    $changeType = $Event.SourceEventArgs.ChangeType
    $relPath = $path.Substring($source.Length).TrimStart('\', '/')
    
    # Exclude unwanted files
    if ($relPath -match 'node_modules|\.git|\.bak|\.map') { return }

    $targetPath = Join-Path $deploy $relPath
    $targetDir = Split-Path -Parent $targetPath

    try {
        Start-Sleep -Milliseconds 100
        if ($changeType -eq 'Deleted') {
            if (Test-Path -LiteralPath $targetPath) {
                Remove-Item -LiteralPath $targetPath -Recurse -Force
                Write-Host "[-] Deleted: $relPath" -ForegroundColor DarkYellow
            }
        } else {
            if (-not (Test-Path -LiteralPath $targetDir)) {
                New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            }
            Copy-Item -LiteralPath $path -Destination $targetPath -Force
            $ts = Get-Date -Format "HH:mm:ss"
            Write-Host "[$ts] [OK] Auto-Synced: $relPath" -ForegroundColor Green
        }
    } catch {
        Write-Host "[!] Sync error for $relPath : $($_.Exception.Message)" -ForegroundColor Red
    }
}

Register-ObjectEvent $fsw 'Changed' -Action $action | Out-Null
Register-ObjectEvent $fsw 'Created' -Action $action | Out-Null
Register-ObjectEvent $fsw 'Deleted' -Action $action | Out-Null
Register-ObjectEvent $fsw 'Renamed' -Action $action | Out-Null

try {
    while ($true) { Start-Sleep -Seconds 1 }
} finally {
    Get-EventSubscriber | Unregister-Event -Force
    $fsw.Dispose()
    Write-Host "`nWatcher stopped." -ForegroundColor Yellow
}
