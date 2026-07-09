# ============================================
# InsightAI - Run Local Development Servers
# ============================================
# Usage: Right-click > Run with PowerShell
#   hoặc mở PowerShell và chạy: .\run_local.ps1
# ============================================

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  InsightAI - Local Development" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Backend (FastAPI - port 8000) ---
Write-Host "[1/2] Starting Backend (http://localhost:8000) ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
    Set-Location '$ROOT\backend';
    Write-Host '=== BACKEND ===' -ForegroundColor Green;
    .\venv\Scripts\activate;
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
" -WindowStyle Normal

Start-Sleep -Seconds 2

# --- Frontend (Next.js - port 3000) ---
Write-Host "[2/3] Starting Frontend (http://localhost:3000) ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
    Set-Location '$ROOT\myApp';
    Write-Host '=== FRONTEND ===' -ForegroundColor Green;
    pnpm dev
" -WindowStyle Normal

Start-Sleep -Seconds 2

# --- Celery Worker ---
Write-Host "[3/3] Starting Celery Worker (Background tasks) ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
    Set-Location '$ROOT\backend';
    Write-Host '=== CELERY WORKER ===' -ForegroundColor Green;
    .\venv\Scripts\activate;
    python -m celery -A app.worker.celery_app worker --pool=solo --loglevel=info
" -WindowStyle Normal

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  All servers started!" -ForegroundColor Green
Write-Host "  Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "  Swagger:  http://localhost:8000/docs" -ForegroundColor White
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  Celery:   Running in background" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
