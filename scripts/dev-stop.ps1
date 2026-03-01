$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$stoppedAny = $false

$backendProcs = Get-Process -Name ReviewWise.Api -ErrorAction SilentlyContinue
if ($backendProcs) {
    $backendProcs | Stop-Process -Force
    Write-Host 'Stopped ReviewWise.Api process(es).'
    $stoppedAny = $true
}

$port4200Listeners = Get-NetTCPConnection -LocalPort 4200 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

if ($port4200Listeners) {
    foreach ($procId in $port4200Listeners) {
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Host "Stopped process on port 4200 (PID $procId)."
            $stoppedAny = $true
        }
        catch {
            Write-Warning "Could not stop PID $procId on port 4200: $($_.Exception.Message)"
        }
    }
}

$npmNodeProcs = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object {
    ($_.CommandLine -like '*ng serve*' -or $_.CommandLine -like '*vite*' -or $_.CommandLine -like '*@angular*') -and $_.CommandLine -like "*$repoRoot*"
}

if ($npmNodeProcs) {
    foreach ($proc in $npmNodeProcs) {
        try {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
            Write-Host "Stopped frontend node process (PID $($proc.ProcessId))."
            $stoppedAny = $true
        }
        catch {
            Write-Warning "Could not stop frontend node PID $($proc.ProcessId): $($_.Exception.Message)"
        }
    }
}

if (-not $stoppedAny) {
    Write-Host 'No matching dev processes were running.'
} else {
    Write-Host 'Dev processes stopped.'
}
