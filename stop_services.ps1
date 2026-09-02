# ControlPlane.ai - Stop All Services (PowerShell)
$ErrorActionPreference = 'SilentlyContinue'

Write-Host "Stopping all ControlPlane.ai services..." -ForegroundColor Red

$pidFile = Join-Path -Path ([IO.Path]::GetTempPath()) -ChildPath 'controlplane_pids.txt'
if (Test-Path $pidFile) {
    Get-Content $pidFile | ForEach-Object {
        $pidToKill = $_
        if ($pidToKill -match '^\d+$') {
            Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            Write-Host "  Stopped PID $pidToKill"
        }
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Sweeping for orphaned Uvicorn worker processes on ports 8000-8024, 8099..." -ForegroundColor Yellow
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

Write-Host "v All services stopped and ports freed." -ForegroundColor Green
