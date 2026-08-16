# ============================================================
# auto-backup.ps1 - Auto backup ElArabyDev to GitHub
# Runs via Windows Task Scheduler (every 4 hours)
# Smart: skips empty commits, pushes only when changes exist
# ============================================================
$ErrorActionPreference = 'Continue'

$repoPath = "E:\My First Lap\MY WORKE\Apps\ElArabyDev"
$logFile  = "C:\Users\Zain\AppData\Local\Temp\opencode\auto-backup.log"

function Write-Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    try { Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8 } catch {}
}

try {
    Set-Location $repoPath

    if (-not (Test-Path ".git")) {
        Write-Log "ERROR: .git not found in $repoPath"
        exit 1
    }

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"

    git add -A 2>&1 | Out-Null

    if (git diff --cached --quiet) {
        Write-Log "No changes - skipped"
        exit 0
    }

    git commit -m "auto-backup $timestamp" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERROR: commit failed"
        exit 1
    }

    git push origin main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERROR: push failed (network/auth) - changes saved locally"
        exit 1
    }

    Write-Log "Backup OK ($timestamp)"
    exit 0
}
catch {
    Write-Log "ERROR: unexpected - $_"
    exit 1
}