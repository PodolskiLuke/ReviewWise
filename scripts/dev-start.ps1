$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendDir = Join-Path $repoRoot 'backend\ReviewWise.Api'
$backendProject = Join-Path $backendDir 'ReviewWise.Api.csproj'

if (-not (Test-Path $backendProject)) {
    throw "Backend project not found at: $backendProject"
}

$backendProcs = Get-Process -Name ReviewWise.Api -ErrorAction SilentlyContinue
if ($backendProcs) {
    $backendProcs | Stop-Process -Force
    Write-Host 'Stopped existing ReviewWise.Api process(es).'
}

$port4200 = Get-NetTCPConnection -LocalPort 4200 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

if ($port4200) {
    foreach ($procId in $port4200) {
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Host "Stopped process on port 4200 (PID $procId)."
        }
        catch {
            Write-Warning "Could not stop PID $procId on port 4200: $($_.Exception.Message)"
        }
    }
}

$backendCommand = "Set-Location '$backendDir'; dotnet run"
$frontendCommand = "Set-Location '$repoRoot'; npm start"

Start-Process powershell -ArgumentList '-NoExit', '-Command', $backendCommand | Out-Null
Start-Process powershell -ArgumentList '-NoExit', '-Command', $frontendCommand | Out-Null

Write-Host 'Started backend and frontend in separate terminals.'
Write-Host 'Frontend: http://localhost:4200'
Write-Host 'Backend:  http://localhost:5010'
