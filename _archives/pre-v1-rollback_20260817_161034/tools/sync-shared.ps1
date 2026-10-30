# ElArabyDev - Sync Shared Libraries Script
# Copies shared libraries from src\unified-extension\shared into each target

$source = "E:\My First Lap\MY WORKE\Apps\ElArabyDev\src\unified-extension\shared"
$targets = @(
    "E:\My First Lap\MY WORKE\Apps\ElArabyDev\legacy\مساعد التقفيلات (نشر قديم)\shared",
    "E:\My First Lap\MY WORKE\Apps\ElArabyDev\legacy\المساعد الذكي\shared"
)

$files = @(
    "ai-client.js",
    "arabic-utils.js",
    "data-mapper.js",
    "db.js",
    "excel-exporter.js",
    "frame-walker.js",
    "message-bus.js",
    "n8n-client.js",
    "portal-config.js",
    "portal-selectors.js",
    "smart-log.js",
    "storage-proxy.js",
    "table-scraper.js"
)

Write-Host "=== Sync Shared Libraries ===" -ForegroundColor Cyan
Write-Host "Source: $source"
Write-Host ""

# Create target folders if missing
foreach ($target in $targets) {
    if (-not (Test-Path $target)) {
        New-Item -ItemType Directory -Path $target -Force | Out-Null
        Write-Host "  Created folder: $target" -ForegroundColor Yellow
    }
}

$copied = 0
$skipped = 0

foreach ($target in $targets) {
    Write-Host "  -> $target" -ForegroundColor Green
    foreach ($file in $files) {
        $srcFile = Join-Path $source $file
        $dstFile = Join-Path $target $file

        if (Test-Path $srcFile) {
            Copy-Item -Path $srcFile -Destination $dstFile -Force
            Write-Host "     [OK] $file" -ForegroundColor DarkGreen
            $copied++
        } else {
            Write-Host "     [!!] $file missing in source" -ForegroundColor Yellow
            $skipped++
        }
    }
    Write-Host ""
}

Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Copied: $copied files"
Write-Host "Skipped: $skipped files"
Write-Host ""

if ($copied -gt 0) {
    Write-Host "Done. Re-run this script after any change in src\unified-extension\shared" -ForegroundColor Green
}