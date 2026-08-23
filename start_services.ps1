
$ErrorActionPreference = 'Stop'
$PROJECT_ROOT = $PSScriptRoot
Set-Location -Path $PROJECT_ROOT

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  ControlPlane.ai - Starting All Services" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

if (!(Test-Path -Path "data")) { New-Item -ItemType Directory -Path "data" | Out-Null }

if (!(Test-Path -Path ".env")) {
    Write-Host "No .env file found. Copying from .env.example" -ForegroundColor Yellow
    Copy-Item -Path ".env.example" -Destination ".env"
    Write-Host "   Please edit .env with your API keys before running." -ForegroundColor Yellow
}

$pidFile = Join-Path -Path ([IO.Path]::GetTempPath()) -ChildPath 'controlplane_pids.txt'

if (Test-Path $pidFile) {
    Write-Host "Stopping previous services..." -ForegroundColor Yellow
    Get-Content $pidFile | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Remove-Item $pidFile
}

$env:PYTHONPATH = $PROJECT_ROOT

$pythonPath = "python"
if (Test-Path -Path "$PROJECT_ROOT\venv\Scripts\python.exe") {
    $pythonPath = "$PROJECT_ROOT\venv\Scripts\python.exe"
}

function Start-ControlService {
    param([string]$name, [string]$module, [int]$port)
    Write-Host "> Starting $name on port $port..." -ForegroundColor Green
    
    $proc = Start-Process -FilePath $pythonPath -ArgumentList "-m uvicorn services.${module}.app:app --host 0.0.0.0 --port $port --reload --reload-dir services --reload-dir shared --log-level warning" -PassThru -NoNewWindow
    
    Add-Content -Path $pidFile -Value $proc.Id
}

try {
    Write-Host "`nPhase 1: Core Infrastructure" -ForegroundColor Blue
    Start-ControlService "Audit Store" "audit_store" 8007
    Start-ControlService "PII Service" "pii_service" 8003
    Start-ControlService "Policy Engine" "policy_engine" 8004
    Start-Sleep -Seconds 1

    Write-Host "`nPhase 2: Guards" -ForegroundColor Blue
    Start-ControlService "Input Guard" "input_guard" 8001
    Start-ControlService "Output Guard" "output_guard" 8002
    Start-ControlService "Action Guard" "action_guard" 8010
    Start-Sleep -Seconds 1

    Write-Host "`nPhase 3: Pipeline" -ForegroundColor Blue
    Start-ControlService "Router / LB" "router" 8005
    Start-ControlService "Model Adapter" "adapter" 8006
    Start-Sleep -Seconds 1

    Write-Host "`nPhase 4: Monitoring and Review" -ForegroundColor Blue
    Start-ControlService "Review Console" "review_console" 8008
    Start-ControlService "Immune System" "immune_system" 8009
    Start-Sleep -Seconds 1

    Write-Host "`nPhase 5: Gateway (main entry point)" -ForegroundColor Blue
    Start-ControlService "API Gateway" "gateway" 8000

    Write-Host "`n====================================================" -ForegroundColor Cyan
    Write-Host "All services started!`n" -ForegroundColor Green

    Write-Host "  API Gateway:      http://localhost:8000" -ForegroundColor Cyan
    Write-Host "  Input Guard:      http://localhost:8001" -ForegroundColor Cyan
    Write-Host "  Output Guard:     http://localhost:8002" -ForegroundColor Cyan
    Write-Host "  PII Service:      http://localhost:8003" -ForegroundColor Cyan
    Write-Host "  Policy Engine:    http://localhost:8004" -ForegroundColor Cyan
    Write-Host "  Router/LB:        http://localhost:8005" -ForegroundColor Cyan
    Write-Host "  Model Adapter:    http://localhost:8006" -ForegroundColor Cyan
    Write-Host "  Audit Store:      http://localhost:8007" -ForegroundColor Cyan
    Write-Host "  Review Console:   http://localhost:8008" -ForegroundColor Cyan
    Write-Host "  Immune System:    http://localhost:8009" -ForegroundColor Cyan
    Write-Host "  Action Guard:     http://localhost:8010`n" -ForegroundColor Cyan
    
    Write-Host "  Frontend (dev):   cd frontend && npm run dev" -ForegroundColor Cyan
    Write-Host "====================================================`n" -ForegroundColor Cyan
    
    Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Yellow

    # Keep script alive so the finally block catches Ctrl+C
    while ($true) { Start-Sleep -Seconds 1 }
}
finally {
    Write-Host "`nStopping all services..." -ForegroundColor Red
    if (Test-Path $pidFile) {
        Get-Content $pidFile | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
        Remove-Item $pidFile
    }
}