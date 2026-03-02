param(
    [Parameter(Mandatory = $true)]
    [string]$TvIp,

    [Parameter(Mandatory = $true)]
    [string]$Passphrase,

    [string]$DeviceName = 'lgclient',
    [string]$Port = '9922',
    [string]$Username = 'prisoner',
    [string]$AppId = 'com.smc.signage.player',
    [string]$IpkPath = '.\\com.smc.signage.player_2.0.0_client_ready.ipk',
    [string]$IpkUrl = ''
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

function Ensure-Command($Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "Required command not found: $Name"
    }
    return $cmd.Source
}

function Get-AresCommandPath($BaseName) {
    $cmdShim = Join-Path (Join-Path $env:APPDATA 'npm') ("$BaseName.cmd")
    if (Test-Path $cmdShim) {
        return $cmdShim
    }

    $cmd = Get-Command $BaseName -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    return $null
}

function Ensure-WebOSCli {
    $npm = Ensure-Command 'npm'

    $aresInstall = Get-AresCommandPath 'ares-install'
    if ($aresInstall) {
        return
    }

    Write-Info 'Installing @webos-tools/cli globally (one-time setup)...'
    & $npm install -g @webos-tools/cli
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install @webos-tools/cli (exit $LASTEXITCODE)"
    }

    $aresInstall = Get-AresCommandPath 'ares-install'
    if (-not $aresInstall) {
        throw 'webOS CLI installation finished but ares-install was not found in PATH.'
    }
}

function Resolve-IpkFile {
    if (-not [string]::IsNullOrWhiteSpace($IpkUrl)) {
        $downloadDir = Join-Path $env:TEMP 'smc_webos_install'
        New-Item -Path $downloadDir -ItemType Directory -Force | Out-Null
        $outPath = Join-Path $downloadDir 'com.smc.signage.player_client_ready.ipk'

        Write-Info "Downloading IPK from URL: $IpkUrl"
        Invoke-WebRequest -Uri $IpkUrl -OutFile $outPath -UseBasicParsing
        if (-not (Test-Path $outPath)) {
            throw "IPK download failed: $IpkUrl"
        }
        return [System.IO.Path]::GetFullPath($outPath)
    }

    $full = [System.IO.Path]::GetFullPath($IpkPath)
    if (-not (Test-Path $full)) {
        throw "IPK file not found: $full`nProvide -IpkPath or -IpkUrl"
    }

    return $full
}

function Upsert-Device($AresSetupDevice) {
    Write-Info "Registering TV target '$DeviceName' ($($TvIp):$Port)"

    $listOutput = & $AresSetupDevice --list | Out-String
    $exists = $false
    foreach ($line in ($listOutput -split "`r?`n")) {
        if ($line.Trim().StartsWith($DeviceName + ' ')) {
            $exists = $true
            break
        }
    }

    if ($exists) {
        & $AresSetupDevice -m $DeviceName -i "host=$TvIp" -i "port=$Port" -i "username=$Username" -i "password=$Passphrase"
    }
    else {
        & $AresSetupDevice -a $DeviceName -i "host=$TvIp" -i "port=$Port" -i "username=$Username" -i "password=$Passphrase"
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to configure target device '$DeviceName'"
    }

    & $AresSetupDevice -f $DeviceName
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to set default target device '$DeviceName'"
    }
}

Ensure-WebOSCli

$aresSetupDevice = Get-AresCommandPath 'ares-setup-device'
$aresInstall = Get-AresCommandPath 'ares-install'
$aresLaunch = Get-AresCommandPath 'ares-launch'
$aresNovacom = Get-AresCommandPath 'ares-novacom'

if (-not $aresSetupDevice -or -not $aresInstall -or -not $aresLaunch -or -not $aresNovacom) {
    throw 'Missing one or more required ares tools after CLI setup.'
}

$ipkFile = Resolve-IpkFile
Write-Info "Using IPK: $ipkFile"

Upsert-Device -AresSetupDevice $aresSetupDevice
Write-Info 'Fetching TV SSH key (first-time setup may prompt for passphrase on screen)...'
& $aresNovacom -d $DeviceName --getkey | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-WarnLine 'Key fetch may have been skipped/failed. Continuing with direct connectivity test.'
}


Write-Info 'Checking TV connectivity...'
& $aresNovacom -d $DeviceName --run 'echo connected'
if ($LASTEXITCODE -ne 0) {
    throw "Cannot reach TV '$DeviceName'. Check TV IP/passphrase and Developer Mode status."
}

Write-Info "Removing previous app (if installed): $AppId"
& $aresInstall -d $DeviceName -r $AppId | Out-Null

Write-Info 'Installing app package...'
& $aresInstall -d $DeviceName $ipkFile
if ($LASTEXITCODE -ne 0) {
    throw "Install failed for '$ipkFile'"
}

Write-Info "Launching app: $AppId"
& $aresLaunch -d $DeviceName $AppId
if ($LASTEXITCODE -ne 0) {
    throw "Launch failed for app '$AppId'"
}

Write-Ok 'Install and launch completed successfully.'
Write-Host ''
Write-Host 'Next time, client can rerun the same script with the same arguments to upgrade app.'
