# ElArabyDev - Verification Gate
# Single entry point that proves the repository is healthy before a commit/push.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File tools\verify.ps1
#   powershell -ExecutionPolicy Bypass -File tools\verify.ps1 -CheckDeploy
#
# Steps: JS syntax -> JSON validity -> manifest references -> test suites -> (optional) deploy parity
# Exit code 0 = all green, 1 = at least one failure.

param(
    [switch]$CheckDeploy
)

$ErrorActionPreference = "Continue"

$root    = Split-Path -Parent $PSScriptRoot
$src     = Join-Path $root "src\unified-extension"
$deploy  = Join-Path $root "deploy"

$script:failures = @()
$script:checks   = 0

function Fail([string]$msg) {
    $script:failures += $msg
    Write-Host ("  [FAIL] " + $msg) -ForegroundColor Red
}

function Pass([string]$msg) {
    Write-Host ("  [OK]   " + $msg) -ForegroundColor DarkGreen
}

function Step([string]$title) {
    Write-Host ""
    Write-Host ("== " + $title) -ForegroundColor Cyan
}

Write-Host "=== El Araby Unified - Verification ===" -ForegroundColor Cyan

# ---------------------------------------------------------------- 1) JS syntax
Step "1/5 JS syntax (src)"
$jsFiles = Get-ChildItem -LiteralPath $src -Recurse -Filter *.js -File |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' }
$badJs = @()
foreach ($f in $jsFiles) {
    $script:checks++
    & node --check $f.FullName 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { $badJs += $f.FullName; Fail ("syntax: " + $f.FullName.Replace($root + '\', '')) }
}
if ($badJs.Count -eq 0) { Pass ("$($jsFiles.Count) JS files parse cleanly") }

# ---------------------------------------------------------------- 2) JSON files
Step "2/5 JSON validity (src)"
$jsonFiles = Get-ChildItem -LiteralPath $src -Recurse -Filter *.json -File
$badJson = 0
foreach ($f in $jsonFiles) {
    $script:checks++
    try {
        Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
    } catch {
        $badJson++
        Fail ("json: " + $f.FullName.Replace($root + '\', ''))
    }
}
if ($badJson -eq 0) { Pass ("$($jsonFiles.Count) JSON files valid") }

# ---------------------------------------------------------- 3) manifest refs
Step "3/5 manifest references exist"
$manifestPath = Join-Path $src "manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
    Fail "manifest.json missing"
} else {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $refs = New-Object System.Collections.Generic.List[string]

    if ($manifest.background -and $manifest.background.service_worker) { $refs.Add($manifest.background.service_worker) }
    if ($manifest.background -and $manifest.background.scripts) { $manifest.background.scripts | ForEach-Object { $refs.Add($_) } }
    if ($manifest.action -and $manifest.action.default_popup) { $refs.Add($manifest.action.default_popup) }
    if ($manifest.icons) { $manifest.icons.PSObject.Properties | ForEach-Object { $refs.Add($_.Value) } }
    foreach ($cs in @($manifest.content_scripts)) {
        if ($cs.js)  { $cs.js  | ForEach-Object { $refs.Add($_) } }
        if ($cs.css) { $cs.css | ForEach-Object { $refs.Add($_) } }
    }
    foreach ($war in @($manifest.web_accessible_resources)) {
        if ($war.resources) { $war.resources | ForEach-Object { $refs.Add($_) } }
    }

    $missing = 0
    foreach ($r in ($refs | Select-Object -Unique)) {
        if ([string]::IsNullOrWhiteSpace($r)) { continue }
        if ($r -match '\*') { continue }  # wildcard entries are resolved at runtime
        $script:checks++
        $p = Join-Path $src ($r -replace '/', '\')
        if (-not (Test-Path -LiteralPath $p)) { $missing++; Fail ("manifest -> missing file: " + $r) }
    }
    if ($missing -eq 0) { Pass ("$($refs.Count) manifest references resolved") }
}

# ---------------------------------------------------------------- 4) tests
Step "4/5 test suites"
$suites = @(
    @{ name = "unit (AI/n8n/problem-codes/arabic)"; file = "tools\tests\run-tests.js"; last = 2 },
    @{ name = "unification smoke";                  file = "tools\tests\unification-smoke.js"; last = 3 },
    @{ name = "portal write safety";                file = "tools\tests\portal-write-check.js"; last = 3 }
)
foreach ($s in $suites) {
    $script:checks++
    $full = Join-Path $root $s.file
    if (-not (Test-Path -LiteralPath $full)) { Fail ("missing test: " + $s.file); continue }
    $out = & node $full 2>&1
    $code = $LASTEXITCODE
    if ($code -eq 0) {
        $tail = ($out | Select-Object -Last $s.last) -join " | "
        Pass ($s.name + " -> " + $tail)
    } else {
        $out | Select-Object -Last 12 | ForEach-Object { Write-Host ("         " + $_) -ForegroundColor DarkYellow }
        Fail ($s.name + " (exit " + $code + ")")
    }
}

# -------------------------------------------------------- 5) deploy parity
Step "5/5 deploy parity"
if (-not $CheckDeploy) {
    Write-Host "  [--]   skipped (run with -CheckDeploy after tools\deploy.ps1)" -ForegroundColor Yellow
} elseif (-not (Test-Path -LiteralPath $deploy)) {
    Fail "deploy/ folder not found - run tools\deploy.ps1"
} else {
    $srcFiles = Get-ChildItem -LiteralPath $src -Recurse -File |
        Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.Extension -ne '.bak' -and $_.Extension -ne '.map' }
    $drift = 0
    foreach ($f in $srcFiles) {
        $rel = $f.FullName.Substring($src.Length + 1)
        $target = Join-Path $deploy $rel
        if (-not (Test-Path -LiteralPath $target)) {
            $drift++; Fail ("deploy missing: " + $rel)
            continue
        }
        $a = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash
        $b = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
        if ($a -ne $b) { $drift++; Fail ("deploy differs: " + $rel) }
    }
    if ($drift -eq 0) { Pass ("$($srcFiles.Count) files identical between src and deploy") }
}

# ---------------------------------------------------------------- summary
Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
if ($script:failures.Count -eq 0) {
    Write-Host ("RESULT: ALL GREEN (" + $script:checks + " checks)") -ForegroundColor Green
    exit 0
} else {
    Write-Host ("RESULT: " + $script:failures.Count + " FAILURE(S) of " + $script:checks + " checks") -ForegroundColor Red
    $script:failures | ForEach-Object { Write-Host ("  - " + $_) -ForegroundColor Red }
    exit 1
}
