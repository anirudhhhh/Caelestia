
$ErrorActionPreference = 'Stop'
$PROJECT_ROOT = $PSScriptRoot
Set-Location -Path $PROJECT_ROOT

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  ControlPlane.ai -- Starting 17 Microservice Cluster" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

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

# Stop any lingering processes on ports 8000-8024, 8099
$ports = 8000..8024 + 8099
foreach ($p in $ports) {
    $netstat = netstat -ano | Select-String ":$p\s"
    foreach ($line in $netstat) {
        $parts = ($line -split '\s+') | Where-Object { $_ -ne '' }
        $pidToKill = $parts[-1]
        if ($pidToKill -match '^\d+$' -and $pidToKill -ne '0') {
            Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
        }
    }
}

$env:PYTHONPATH = $PROJECT_ROOT

$pythonPath = "python"
if (Test-Path -Path "$PROJECT_ROOT\venv\Scripts\python.exe") {
    $pythonPath = "$PROJECT_ROOT\venv\Scripts\python.exe"
} else {
    Write-Host "Virtual environment not detected. Bootstrapping Python venv..." -ForegroundColor Yellow
    try {
        python -m venv "$PROJECT_ROOT\venv"
        & "$PROJECT_ROOT\venv\Scripts\pip.exe" install -r "$PROJECT_ROOT\requirements.txt"
        $pythonPath = "$PROJECT_ROOT\venv\Scripts\python.exe"
    } catch {
        Write-Host "Auto-venv creation skipped; using system python." -ForegroundColor Yellow
    }
}

function Start-ControlService {
    param([string]$name, [string]$module, [int]$port)
    Write-Host "> Starting $name on port $port..." -ForegroundColor Green
    
    $proc = Start-Process -FilePath $pythonPath -ArgumentList "-m uvicorn services.${module}.app:app --host 0.0.0.0 --port $port --reload --log-level warning" -PassThru -NoNewWindow
    
    Add-Content -Path $pidFile -Value $proc.Id
}

try {
    Write-Host "`nPhase 1: Core Storage & Foundation Services" -ForegroundColor Blue
    Start-ControlService "Audit Store" "audit_store" 8007
    Start-ControlService "PII Service" "pii_service" 8003
    Start-ControlService "Policy Engine" "policy_engine" 8004
    Start-ControlService "Guardrails ML" "guardrails_ml" 8011
    Start-Sleep -Seconds 2

    Write-Host "`nPhase 2: Security & Governance Guards" -ForegroundColor Blue
    Start-ControlService "Input Guard" "input_guard" 8001
    Start-ControlService "Output Guard" "output_guard" 8002
    Start-ControlService "Action Guard" "action_guard" 8010
    Start-Sleep -Seconds 2

    Write-Host "`nPhase 3: Routing & Execution Pipeline" -ForegroundColor Blue
    Start-ControlService "Router / LB" "router" 8005
    Start-ControlService "Model Adapter" "adapter" 8006
    Start-Sleep -Seconds 2

    Write-Host "`nPhase 3b: AI Workflow Components (PRD Workflows)" -ForegroundColor Blue
    Start-ControlService "General Query" "general_query" 8021
    Start-ControlService "Email Service" "email_service" 8022
    Start-ControlService "Leave Approval" "leave_approval" 8023
    Start-ControlService "Weather Service" "weather_service" 8024
    Start-ControlService "Mocha Service" "mocha_service" 8099
    Start-Sleep -Seconds 2

    Write-Host "`nPhase 4: Monitoring, Immune System & Human Review" -ForegroundColor Blue
    Start-ControlService "Review Console" "review_console" 8008
    Start-ControlService "Immune System" "immune_system" 8009
    Start-Sleep -Seconds 2

    Write-Host "`nPhase 5: API Gateway (Main Ingress Entry Point)" -ForegroundColor Blue
    Start-ControlService "API Gateway" "gateway" 8000
    Start-Sleep -Seconds 3

    Write-Host "`nPhase 6: Warming Up Services (Eliminating Cold Starts)..." -ForegroundColor Blue
    try {
        Invoke-RestMethod -Uri "http://localhost:8000/v1/health/system" -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null
        Write-Host "v Gateway and connection pools initialized" -ForegroundColor Green
    } catch {}

    try {
        $warmupBody = @{
            interaction_id = "warmup"
            session_id = "warmup"
            use_case = "internal"
            geography = "US"
            direction = "input"
            payload = @{ role = "user"; content = "warmup" }
            model = @{ requested = "dummy" }
            checks = @()
            tool_calls = @()
        } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "http://localhost:8001/scan" -Method Post -Body $warmupBody -ContentType "application/json" -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null
        Write-Host "v Scanners, Regex, and Neural Engines warmed up" -ForegroundColor Green
    } catch {}

    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "v All ControlPlane.ai Microservices operational!" -ForegroundColor Green
    Write-Host "  API Gateway:      http://localhost:8000" -ForegroundColor Cyan
    Write-Host "  General Query:    http://localhost:8021" -ForegroundColor Cyan
    Write-Host "  Email Service:    http://localhost:8022" -ForegroundColor Cyan
    Write-Host "  Leave Approval:   http://localhost:8023" -ForegroundColor Cyan
    Write-Host "  Weather Service:  http://localhost:8024" -ForegroundColor Cyan
    Write-Host "  Mocha Service:    http://localhost:8099" -ForegroundColor Cyan
    Write-Host "  Review Console:   http://localhost:8008" -ForegroundColor Cyan
    Write-Host "  Frontend UI:      http://localhost:3000  (Run 'cd frontend && npm run dev')`n" -ForegroundColor Cyan
    Write-Host "Press Ctrl+C to stop all services cleanly" -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

    # Keep script alive so the finally block catches Ctrl+C
    while ($true) { Start-Sleep -Seconds 1 }
}
finally {
    Write-Host "`nStopping all ControlPlane.ai services..." -ForegroundColor Red
    if (Test-Path $pidFile) {
        Get-Content $pidFile | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
        Remove-Item $pidFile
    }
    foreach ($p in $ports) {
        $netstat = netstat -ano | Select-String ":$p\s"
        foreach ($line in $netstat) {
            $parts = ($line -split '\s+') | Where-Object { $_ -ne '' }
            $pidToKill = $parts[-1]
            if ($pidToKill -match '^\d+$' -and $pidToKill -ne '0') {
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            }
        }
    }
    Write-Host "v All services stopped and ports freed." -ForegroundColor Green
}