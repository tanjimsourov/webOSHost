$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

$sdkHome = 'C:\LG\webOS_TV_SDK'
$vbox = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
$vmName = 'LG webOS TV Emulator 6.0.0'
$hostWorkspace = 'C:\Users\spicy\webOS_SDK\EmulWorkspace'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$appInfoPath = Join-Path $repoRoot 'appinfo.json'

if (-not (Test-Path $appInfoPath)) {
    throw "appinfo.json not found at $appInfoPath"
}

$appInfo = Get-Content -Path $appInfoPath -Raw | ConvertFrom-Json
$appId = $appInfo.id
if ([string]::IsNullOrWhiteSpace($appId)) {
    throw 'appinfo.json id is missing'
}

function Add-PathEntryIfMissing {
    param([string]$PathValue)
    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        return
    }
    $parts = ($env:PATH -split ';') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    if ($parts -notcontains $PathValue) {
        $env:PATH = "$PathValue;$env:PATH"
    }
}

function Get-ToolPath {
    param([Parameter(Mandatory = $true)][string]$BaseName)

    $npmBin = Join-Path $env:APPDATA 'npm'
    $cmdShim = Join-Path $npmBin ("$BaseName.cmd")
    if (Test-Path $cmdShim) {
        return $cmdShim
    }

    $cmd = Get-Command "$BaseName.cmd" -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    $fallback = Get-Command $BaseName -ErrorAction SilentlyContinue
    if ($fallback) {
        return $fallback.Source
    }

    throw "Required command not found: $BaseName"
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
        [PSCustomObject]@{
            ExitCode = $exitCode
            Output = $text
        }
    }
    catch {
        [PSCustomObject]@{
            ExitCode = 1
            Output = ($_ | Out-String).Trim()
        }
    }
    finally {
        $ErrorActionPreference = $oldEap
    }
}

function Invoke-NativeWithTimeout {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter()][string[]]$Arguments = @(),
        [Parameter()][int]$TimeoutSeconds = 10
    )

    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $FilePath
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $escaped = $Arguments | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '""') + '"' } else { $_ }
    }
    $psi.Arguments = ($escaped -join ' ')

    $proc = [System.Diagnostics.Process]::new()
    $proc.StartInfo = $psi
    [void]$proc.Start()

    $finished = $proc.WaitForExit($TimeoutSeconds * 1000)
    if (-not $finished) {
        try { $proc.Kill() } catch { }
    }

    $stdOut = $proc.StandardOutput.ReadToEnd()
    $stdErr = $proc.StandardError.ReadToEnd()
    $text = (@($stdOut, $stdErr) -join [Environment]::NewLine).Trim()

    [PSCustomObject]@{
        ExitCode = $(if ($finished) { $proc.ExitCode } else { 124 })
        Output = $text
    }
}

function Invoke-Ares {
    param(
        [Parameter(Mandatory = $true)][string]$CommandName,
        [Parameter()][string[]]$Arguments = @()
    )

    $tool = $script:AresTools[$CommandName]
    if (-not $tool) {
        return [PSCustomObject]@{
            ExitCode = 127
            Output = "ares tool not resolved: $CommandName"
        }
    }

    return Invoke-Native -FilePath $tool -Arguments $Arguments
}

function Test-Tcp6622 {
    if (Get-Command Test-NetConnection -ErrorAction SilentlyContinue) {
        try {
            $res = Test-NetConnection -ComputerName 127.0.0.1 -Port 6622 -WarningAction SilentlyContinue
            return [bool]$res.TcpTestSucceeded
        }
        catch {
            return $false
        }
    }

    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        $async = $client.BeginConnect('127.0.0.1', 6622, $null, $null)
        $ok = $async.AsyncWaitHandle.WaitOne(1200)
        if ($ok -and $client.Connected) {
            $client.EndConnect($async)
            $client.Close()
            return $true
        }
        $client.Close()
        return $false
    }
    catch {
        return $false
    }
}

function Wait-EmulatorSsh {
    param([int]$MaxAttempts = 30)

    Write-Host '[WAIT] emulator ssh'
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        $listRes = Invoke-Ares -CommandName 'setup-device' -Arguments @('--list')
        $logListRes = Invoke-Ares -CommandName 'log' -Arguments @('-d', 'emulator', '--list')
        $tcpOk = Test-Tcp6622

        if ($tcpOk) {
            Write-Host "[WAIT] attempt $i/$MaxAttempts -> tcp 127.0.0.1:6622 OK"
            Write-Host 'Emulator SSH ready'
            return $true
        }

        Write-Host "[WAIT] attempt $i/$MaxAttempts -> tcp not ready"
        if ($i -eq $MaxAttempts) {
            Write-Host '[WAIT] ares-setup-device --list output:'
            Write-Host $listRes.Output
            Write-Host '[WAIT] ares-log -d emulator --list output:'
            Write-Host $logListRes.Output
        }
        Start-Sleep -Seconds 3
    }

    return $false
}

Add-PathEntryIfMissing (Join-Path $env:APPDATA 'npm')

$script:AresTools = @{}
$script:AresTools['package'] = Get-ToolPath 'ares-package'
$script:AresTools['install'] = Get-ToolPath 'ares-install'
$script:AresTools['launch'] = Get-ToolPath 'ares-launch'
$script:AresTools['log'] = Get-ToolPath 'ares-log'
$script:AresTools['setup-device'] = Get-ToolPath 'ares-setup-device'

Write-Host '[CHECK] ares paths'
Write-Host "ares-package: $($script:AresTools['package'])"
Write-Host "ares-install: $($script:AresTools['install'])"
Write-Host "ares-launch: $($script:AresTools['launch'])"
Write-Host "ares-log: $($script:AresTools['log'])"
Write-Host "ares-setup-device: $($script:AresTools['setup-device'])"

$emuBat = Get-ChildItem -Path $sdkHome -Filter 'LG_webOS_TV_Emulator.bat' -File -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
$emuExe = Get-ChildItem -Path $sdkHome -Filter 'LG_webOS_TV_Emulator.exe' -File -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName

if (-not $emuBat -and -not $emuExe) {
    Write-Host '[FAIL] Emulator launcher not found under C:\LG\webOS_TV_SDK' -ForegroundColor Red
    exit 1
}

New-Item -Path $hostWorkspace -ItemType Directory -Force | Out-Null

if (Test-Path $vbox) {
    $removeShared = Invoke-Native -FilePath $vbox -Arguments @('sharedfolder', 'remove', $vmName, '--name', 'shared')
    $addShared = Invoke-Native -FilePath $vbox -Arguments @('sharedfolder', 'add', $vmName, '--name', 'shared', '--hostpath', $hostWorkspace, '--automount')
    Write-Host "[CHECK] VBox sharedfolder remove exit: $($removeShared.ExitCode)"
    if ($removeShared.Output) { Write-Host $removeShared.Output }
    Write-Host "[CHECK] VBox sharedfolder add exit: $($addShared.ExitCode)"
    if ($addShared.Output) { Write-Host $addShared.Output }
}
else {
    Write-Host '[CHECK] VBoxManage.exe not found; skipping shared folder update.' -ForegroundColor Yellow
}

$emuProcess = Get-Process -Name 'LG_webOS_TV_Emulator' -ErrorAction SilentlyContinue
$emuJavaProcess = Get-CimInstance Win32_Process -Filter "name='javaw.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'LG_webOS_TV_Emulator_win\.jar|com\.webossdk\.emul\.VmEmulatorManager' } |
    Select-Object -First 1

if (-not $emuProcess -and -not $emuJavaProcess) {
    if ($emuBat) {
        $emuDir = Split-Path -Parent $emuBat
        Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$emuBat`"" -WorkingDirectory $emuDir | Out-Null
        Write-Host "[CHECK] Started emulator via bat: $emuBat"
    }
    else {
        Start-Process -FilePath $emuExe -WorkingDirectory (Split-Path -Parent $emuExe) | Out-Null
        Write-Host "[CHECK] Started emulator: $emuExe"
    }
}
else {
    Write-Host '[CHECK] Emulator process already running.'
}

$deviceList = Invoke-Ares -CommandName 'setup-device' -Arguments @('--list')
if ($deviceList.Output -notmatch 'developer@127\.0\.0\.1:6622') {
    $addDevice = Invoke-Ares -CommandName 'setup-device' -Arguments @('-a', 'emulator', '-i', 'developer@127.0.0.1:6622', '-p', '0000')
    Write-Host '[CHECK] Added emulator device mapping output:'
    Write-Host $addDevice.Output
}

$ready = Wait-EmulatorSsh -MaxAttempts 30
if (-not $ready) {
    Write-Host '[FAIL] Emulator SSH was not ready after retries. Next step: open emulator UI and wait for full boot, then rerun.' -ForegroundColor Red
    exit 1
}

$distDir = Join-Path $repoRoot 'dist'
if (Test-Path $distDir) {
    Get-ChildItem -Path $distDir -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
}
New-Item -Path $distDir -ItemType Directory -Force | Out-Null

Push-Location $repoRoot
$packageRes = Invoke-Ares -CommandName 'package' -Arguments @('--no-minify', '-o', 'dist', '.')
Pop-Location

$latestIpk = Get-ChildItem -Path $distDir -Filter '*.ipk' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

Write-Host '[BUILD] ipk path'
Write-Host $(if ($latestIpk) { $latestIpk.FullName } else { '<none>' })
if ($packageRes.Output) {
    Write-Host $packageRes.Output
}

if (-not $latestIpk) {
    Write-Host '[FAIL] Packaging failed to produce IPK. Next step: fix build output above and rerun.' -ForegroundColor Red
    exit 1
}

function Invoke-Uninstall {
    $res = Invoke-Ares -CommandName 'install' -Arguments @('-d', 'emulator', '-r', $appId)
    if ($res.ExitCode -ne 0) {
        $fallback = Invoke-Ares -CommandName 'install' -Arguments @('-d', 'emulator', '--remove', $appId)
        return [PSCustomObject]@{
            ExitCode = $fallback.ExitCode
            Output = (($res.Output + [Environment]::NewLine + $fallback.Output).Trim())
        }
    }
    return $res
}

$installOk = $false
$installRes = $null
$uninstallRes = $null

for ($attempt = 1; $attempt -le 5; $attempt++) {
    $uninstallRes = Invoke-Uninstall
    Write-Host '[UNINSTALL] output'
    Write-Host $uninstallRes.Output

    $installRes = Invoke-Ares -CommandName 'install' -Arguments @('-d', 'emulator', $latestIpk.FullName)
    Write-Host '[INSTALL] output'
    Write-Host $installRes.Output

    $manifestError = $installRes.Output -match 'update manifest file failed'
    if ($installRes.ExitCode -eq 0 -and -not $manifestError) {
        $installOk = $true
        break
    }

    if ($attempt -lt 5) {
        Start-Sleep -Seconds 5
    }
}

if (-not $installOk) {
    Write-Host '[FAIL] Install failed after retries. Capturing emulator logs...' -ForegroundColor Red
    $logList = Invoke-Ares -CommandName 'log' -Arguments @('-d', 'emulator', '--list')
    Write-Host $logList.Output
    $logTail = Invoke-NativeWithTimeout -FilePath $script:AresTools['log'] -Arguments @('-d', 'emulator') -TimeoutSeconds 10
    Write-Host $logTail.Output
    exit 1
}

$launchRes = Invoke-Ares -CommandName 'launch' -Arguments @('-d', 'emulator', $appId)
Write-Host '[LAUNCH] output'
Write-Host $launchRes.Output

if ($launchRes.ExitCode -eq 0) {
    Start-Sleep -Seconds 3
    $runningRes = Invoke-Ares -CommandName 'launch' -Arguments @('--running', '-d', 'emulator')
    if ($runningRes.ExitCode -eq 0 -and $runningRes.Output) {
        Write-Host $runningRes.Output
    }
    Write-Host '[SUCCESS] App installed and launched on emulator.' -ForegroundColor Green
    exit 0
}

Write-Host '[FAIL] Launch failed. Next step: confirm app appears in `ares-install -d emulator -l` and retry launch.' -ForegroundColor Red
exit 1

