param(
    [string]$Username,
    [string]$Token,
    [int]$MonitorMs = 120000,
    [string]$Device = 'emulator'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

function Write-Info($Message) {
    Write-Host "[INFO] $Message"
}

function Write-Ok($Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-WarnLine($Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Get-ToolPath($Name) {
    $cmdShim = Join-Path (Join-Path $env:APPDATA 'npm') ("$Name.cmd")
    if (Test-Path $cmdShim) {
        return $cmdShim
    }

    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "Required command not found: $Name"
    }
    return $cmd.Source
}

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter()][string[]]$Arguments = @()
    )

    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $FilePath @Arguments 2>&1
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) {
            $exitCode = 0
        }

        $text = ($output | ForEach-Object { $_.ToString() } | Out-String).Trim()
        return [PSCustomObject]@{
            ExitCode = $exitCode
            Output   = $text
        }
    }
    catch {
        return [PSCustomObject]@{
            ExitCode = 1
            Output   = ($_ | Out-String).Trim()
        }
    }
    finally {
        $ErrorActionPreference = $oldEap
    }
}

function Is-PortOpen($Port) {
    try {
        $res = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue
        return [bool]$res.TcpTestSucceeded
    }
    catch {
        return $false
    }
}

function Wait-Port($Port, $MaxAttempts, $SleepSeconds) {
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        $ok = Is-PortOpen $Port
        Write-Host ("[WAIT] port {0} attempt {1}/{2} -> {3}" -f $Port, $i, $MaxAttempts, $ok)
        if ($ok) {
            return $true
        }
        Start-Sleep -Seconds $SleepSeconds
    }
    return $false
}

if ([string]::IsNullOrWhiteSpace($Username) -or [string]::IsNullOrWhiteSpace($Token)) {
    throw 'Username and Token are required. Example: .\\tools\\webos\\run_from_scratch_auto.ps1 -Username "bd-husmerk" -Token "EHVI-..."'
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$runScript = Join-Path $PSScriptRoot 'run.ps1'
$nodeScript = Join-Path $PSScriptRoot 'auto_inspector_login.js'

if (-not (Test-Path $runScript)) {
    throw "run.ps1 not found at $runScript"
}
if (-not (Test-Path $nodeScript)) {
    throw "auto_inspector_login.js not found at $nodeScript"
}

$aresInstall = Get-ToolPath 'ares-install'
$aresLaunch = Get-ToolPath 'ares-launch'
$aresSetupDevice = Get-ToolPath 'ares-setup-device'

Write-Info 'Checking emulator connectivity (SSH port 6622)'
if (-not (Is-PortOpen 6622)) {
    $emuBat = 'C:\LG\webOS_TV_SDK\Emulator\v6.0.0\LG_webOS_TV_Emulator.bat'
    if (Test-Path $emuBat) {
        Write-Info "Starting emulator via: $emuBat"
        Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$emuBat`"" -WorkingDirectory (Split-Path -Parent $emuBat) | Out-Null
    }
    else {
        Write-WarnLine 'Emulator launcher bat not found; assuming emulator is started manually.'
    }
}

if (-not (Wait-Port -Port 6622 -MaxAttempts 50 -SleepSeconds 3)) {
    throw 'Emulator SSH port 6622 did not become ready.'
}

Write-Info 'Ensuring ares device mapping exists'
$deviceListRes = Invoke-Native -FilePath $aresSetupDevice -Arguments @('--list')
if ($deviceListRes.Output) {
    Write-Host $deviceListRes.Output
}

Write-Info 'Removing previous com.smc.* apps from emulator'
$listRes = Invoke-Native -FilePath $aresInstall -Arguments @('-d', $Device, '-l')
if ($listRes.Output) {
    Write-Host $listRes.Output
}
$appIds = @()
foreach ($line in ($listRes.Output -split "`r?`n")) {
    $txt = $line.Trim()
    if ($txt -match '^com\.smc\.') {
        $appIds += $txt
    }
}
$appIds = $appIds | Select-Object -Unique
foreach ($id in $appIds) {
    Write-Info "Removing $id"
    $rmRes = Invoke-Native -FilePath $aresInstall -Arguments @('-d', $Device, '-r', $id)
    if ($rmRes.Output) {
        Write-Host $rmRes.Output
    }
}

Write-Info 'Rebuild + fresh install + launch'
Push-Location $repoRoot
try {
    powershell -ExecutionPolicy Bypass -File $runScript
    if ($LASTEXITCODE -ne 0) {
        throw "run.ps1 failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

Write-Info 'Waiting for Web Inspector port 9998'
if (-not (Wait-Port -Port 9998 -MaxAttempts 40 -SleepSeconds 2)) {
    throw 'Web Inspector port 9998 did not become ready.'
}

Write-Info 'Running visible automation (settings + login) with console streaming'
Push-Location $repoRoot
try {
    node $nodeScript --username $Username --token $Token --app-id 'com.smc.signage' --monitor-ms $MonitorMs
    if ($LASTEXITCODE -ne 0) {
        throw "Automation script failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

Write-Ok 'Scratch run + visible automation completed.'
Write-Info 'Running app check:'
$runningRes = Invoke-Native -FilePath $aresLaunch -Arguments @('-d', $Device, '--running')
if ($runningRes.Output) {
    Write-Host $runningRes.Output
}
