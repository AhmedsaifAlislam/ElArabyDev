# ElArabyDev - Sync Shared Libraries Script
# Copies shared libraries from master-portal into each active extension

$source = "E:\My First Lap\MY WORKE\Apps\ElArabyDev\master-portal\shared"
$targets = @(
    "E:\My First Lap\MY WORKE\Apps\ElArabyDev\مساعد التقفيلات\shared",
    "E:\My First Lap\MY WORKE\Apps\ElArabyDev\المساعد الذكي\shared"
)

$files = @(
    "storage-proxy.js",
    "smart-log.js",
    "arabic-utils.js",
    "data-mapper.js",
    "portal-selectors.js"
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
    Write-Host "Done. Re-run this script after any change in master-portal\shared" -ForegroundColor Green
}
