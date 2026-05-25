param(
  [switch]$DryRun,
  [switch]$IncludeDocker
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-DirSizeBytes {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return 0 }
  $sum = (Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
  if ($null -eq $sum) { return 0 }
  return [int64]$sum
}

function Format-GB {
  param([int64]$Bytes)
  return ("{0:N2} GB" -f ($Bytes / 1GB))
}

function Remove-PathSafe {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host "[skip] Not found: $Path" -ForegroundColor DarkGray
    return 0
  }
  $sizeBefore = Get-DirSizeBytes -Path $Path
  if ($DryRun) {
    Write-Host "[dry-run] Would remove: $Path ($((Format-GB $sizeBefore)))" -ForegroundColor Yellow
    return $sizeBefore
  }

  try {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    Write-Host "[ok] Removed: $Path ($((Format-GB $sizeBefore)))" -ForegroundColor Green
    return $sizeBefore
  } catch {
    Write-Host "[warn] Cannot remove: $Path -> $($_.Exception.Message)" -ForegroundColor Red
    return 0
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$targets = @(
  (Join-Path $repoRoot "myApp\.next"),
  (Join-Path $repoRoot "myApp\node_modules\.cache"),
  (Join-Path $repoRoot "myApp\.turbo"),
  (Join-Path $repoRoot ".pytest_cache"),
  (Join-Path $repoRoot ".mypy_cache"),
  (Join-Path $repoRoot "backend\.pytest_cache"),
  (Join-Path $repoRoot "backend\__pycache__"),
  (Join-Path $repoRoot "myApp\__pycache__")
)

Write-Host "=== Safe Cleanup For A20-App-152 ===" -ForegroundColor Cyan
if ($DryRun) {
  Write-Host "Mode: DRY RUN (no files removed)" -ForegroundColor Yellow
}

$reclaimed = 0
foreach ($target in $targets) {
  $reclaimed += (Remove-PathSafe -Path $target)
}

if ($DryRun) {
  Write-Host "[dry-run] Would reclaim (project cache only): $((Format-GB $reclaimed))" -ForegroundColor Yellow
} else {
  Write-Host "[done] Reclaimed (project cache only): $((Format-GB $reclaimed))" -ForegroundColor Green
}

if (-not $DryRun) {
  try {
    npm cache clean --force | Out-Null
    Write-Host "[ok] npm cache cleaned" -ForegroundColor Green
  } catch {
    Write-Host "[warn] npm cache clean failed: $($_.Exception.Message)" -ForegroundColor Red
  }

  try {
    pip cache purge | Out-Null
    Write-Host "[ok] pip cache cleaned" -ForegroundColor Green
  } catch {
    Write-Host "[warn] pip cache purge failed (pip may be missing): $($_.Exception.Message)" -ForegroundColor Red
  }
}

if ($IncludeDocker) {
  Write-Host "=== Docker Cleanup ===" -ForegroundColor Cyan
  if ($DryRun) {
    Write-Host "[dry-run] Would run: docker system prune -a --volumes -f" -ForegroundColor Yellow
  } else {
    try {
      docker system prune -a --volumes -f | Out-Null
      Write-Host "[ok] Docker unused data cleaned" -ForegroundColor Green
    } catch {
      Write-Host "[warn] Docker cleanup failed: $($_.Exception.Message)" -ForegroundColor Red
    }
  }
}

Write-Host "=== Completed ===" -ForegroundColor Cyan
