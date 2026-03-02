$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

function Write-Info($Message) {
    Write-Host "[INFO] $Message"
}

function Write-WarnLine($Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Ok($Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Get-RequiredCommandPath($Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "Required command not found: $Name"
    }
    return $cmd.Source
}

function Add-PathEntryIfMissing($PathValue) {
    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        return
    }

    $parts = ($env:PATH -split ';') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    if ($parts -notcontains $PathValue) {
        $env:PATH = "$PathValue;$env:PATH"
        Write-Info "Added to PATH for this session: $PathValue"
    }
}

function Get-AresCommandPath($BaseName) {
    $cmdShim = Join-Path (Join-Path $env:APPDATA 'npm') ("$BaseName.cmd")
    if (Test-Path $cmdShim) {
        return $cmdShim
    }
    return Get-RequiredCommandPath $BaseName
}

function Is-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
Write-Info "Repo root: $repoRoot"

$appInfoFile = Get-ChildItem -Path $repoRoot -Filter 'appinfo.json' -File -Recurse | Select-Object -First 1
if (-not $appInfoFile) {
    throw "appinfo.json not found under repo root: $repoRoot"
}

$appInfo = Get-Content -Path $appInfoFile.FullName -Raw | ConvertFrom-Json
$appId = $appInfo.id
if ([string]::IsNullOrWhiteSpace($appId)) {
    throw "Could not read app id from: $($appInfoFile.FullName)"
}
$appRoot = $appInfoFile.DirectoryName
Write-Info "App root: $appRoot"
Write-Info "App id: $appId"

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    Write-Info 'Node.js not found. Installing Node.js LTS via winget...'
    $winget = Get-RequiredCommandPath 'winget.exe'
    & $winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw 'Node.js installation failed via winget.'
    }
    Write-Ok 'Node.js LTS installed.'
}
else {
    Write-Ok 'Node.js already installed.'
}

$npmDir = Join-Path $env:APPDATA 'npm'
Add-PathEntryIfMissing $npmDir

$aresPackagePath = Get-Command ares-package -ErrorAction SilentlyContinue
if (-not $aresPackagePath) {
    Write-Info 'webOS CLI not found. Installing @webos-tools/cli globally...'

    $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCmd) {
        $defaultNpmCmd = Join-Path ${env:ProgramFiles} 'nodejs\npm.cmd'
        if (Test-Path $defaultNpmCmd) {
            $npmCmd = Get-Item $defaultNpmCmd
        }
    }

    if (-not $npmCmd) {
        throw 'npm.cmd not found. Ensure Node.js installation completed successfully.'
    }

    & $npmCmd.Source install -g @webos-tools/cli
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to install @webos-tools/cli.'
    }
    Write-Ok '@webos-tools/cli installed globally.'
}
else {
    Write-Ok 'webOS CLI already installed.'
}

$aresSetupDevice = Get-AresCommandPath 'ares-setup-device'
$deviceListText = ''
try {
    $deviceListText = (& $aresSetupDevice --list 2>$null | Out-String)
}
catch {
    $deviceListText = $_ | Out-String
}
if ($deviceListText -match 'developer@127\.0\.0\.1:6622' -or $deviceListText -match '(?m)^emulator\s') {
    Write-Ok 'Emulator device entry detected in ares-setup-device list.'
}
else {
    Write-WarnLine 'Emulator device entry (developer@127.0.0.1:6622) was not found in ares-setup-device --list output.'
    Write-Host $deviceListText
}

$virtualBoxManage = Get-Command VBoxManage.exe -ErrorAction SilentlyContinue
$needsVirtualBoxInstall = $true
if ($virtualBoxManage) {
    $vboxVersionOutput = & $virtualBoxManage.Source --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $vboxVersionOutput -match '^6\.1\.') {
        $needsVirtualBoxInstall = $false
        Write-Ok "VirtualBox $vboxVersionOutput detected."
    }
    else {
        Write-WarnLine "VirtualBox version '$vboxVersionOutput' detected. 6.1.x required."
    }
}

if ($needsVirtualBoxInstall) {
    if (-not (Is-Administrator)) {
        Write-Host 'Re-run PowerShell as Administrator and run this script again'
        exit 1
    }

    $vboxUrl = 'https://download.virtualbox.org/virtualbox/6.1.50/VirtualBox-6.1.50-161033-Win.exe'
    $vboxInstaller = Join-Path $env:TEMP 'VirtualBox-6.1.50-161033-Win.exe'
    Write-Info "Downloading VirtualBox 6.1.50 from $vboxUrl"
    Invoke-WebRequest -Uri $vboxUrl -OutFile $vboxInstaller

    Write-Info 'Installing VirtualBox 6.1.50 silently...'
    $installProc = Start-Process -FilePath $vboxInstaller -ArgumentList '--silent' -Wait -PassThru
    if ($installProc.ExitCode -ne 0) {
        throw "VirtualBox installer exited with code $($installProc.ExitCode)"
    }
    Write-Ok 'VirtualBox 6.1.50 installed.'
}

$downloads = Join-Path $env:USERPROFILE 'Downloads'
$emulatorZip = Get-ChildItem -Path $downloads -Filter 'Emulator_tv_win_v*.zip' -File -ErrorAction SilentlyContinue |
    Sort-Object -Property LastWriteTime -Descending |
    Select-Object -First 1
$resourcesZip = Get-ChildItem -Path $downloads -Filter 'Resources_win.zip' -File -ErrorAction SilentlyContinue |
    Select-Object -First 1

if (-not $emulatorZip -or -not $resourcesZip) {
    $url = 'https://webostv.developer.lge.com/develop/tools/emulator-installation'
    Write-WarnLine 'Required emulator ZIP files are missing in Downloads.'
    if (-not $emulatorZip) {
        Write-Host 'Missing: Emulator_tv_win_v*.zip'
    }
    if (-not $resourcesZip) {
        Write-Host 'Missing: Resources_win.zip'
    }
    Write-Info "Opening: $url"
    Start-Process $url | Out-Null
    exit 1
}

$sdkRoot = 'C:\LG\webOS_TV_SDK'
New-Item -Path $sdkRoot -ItemType Directory -Force | Out-Null

Write-Info "Extracting emulator ZIP: $($emulatorZip.FullName)"
Expand-Archive -Path $emulatorZip.FullName -DestinationPath $sdkRoot -Force

Write-Info "Extracting resources ZIP: $($resourcesZip.FullName)"
Expand-Archive -Path $resourcesZip.FullName -DestinationPath $sdkRoot -Force

$emulatorRoot = Join-Path $sdkRoot 'Emulator'
$vmRegisterBat = Get-ChildItem -Path $emulatorRoot -Filter 'vm_register.bat' -File -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
if (-not $vmRegisterBat) {
    throw "vm_register.bat not found under $emulatorRoot"
}

Write-Info "Running VM registration: $($vmRegisterBat.FullName)"
$vmProc = Start-Process -FilePath $vmRegisterBat.FullName -Wait -PassThru
if ($vmProc.ExitCode -ne 0) {
    Write-WarnLine "vm_register.bat exited with code $($vmProc.ExitCode). Continuing."
}

$emulatorBat = Get-ChildItem -Path $emulatorRoot -Filter 'LG_webOS_TV_Emulator.bat' -File -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
$emulatorExe = Get-ChildItem -Path $emulatorRoot -Filter 'LG_webOS_TV_Emulator.exe' -File -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1

if ($emulatorBat) {
    $emulatorDir = Split-Path -Parent $emulatorBat.FullName
    Write-Info "Starting emulator via bat launcher: $($emulatorBat.FullName)"
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$($emulatorBat.FullName)`"" -WorkingDirectory $emulatorDir | Out-Null
}
elseif ($emulatorExe) {
    Write-Info "Starting emulator: $($emulatorExe.FullName)"
    Start-Process -FilePath $emulatorExe.FullName -WorkingDirectory (Split-Path -Parent $emulatorExe.FullName) | Out-Null
}
else {
    throw "LG_webOS_TV_Emulator.bat/.exe not found under $emulatorRoot"
}

$workDist = 'C:\LG\work\dist'
New-Item -Path $workDist -ItemType Directory -Force | Out-Null

$aresPackage = Get-AresCommandPath 'ares-package'
$aresInstall = Get-AresCommandPath 'ares-install'
$aresLaunch = Get-AresCommandPath 'ares-launch'

Write-Info 'Packaging app...'
Push-Location $workDist
try {
    & $aresPackage $appRoot
    if ($LASTEXITCODE -ne 0) {
        throw "ares-package failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$latestIpk = Get-ChildItem -Path $workDist -Filter '*.ipk' -File |
    Sort-Object -Property LastWriteTime -Descending |
    Select-Object -First 1
if (-not $latestIpk) {
    throw "No .ipk package found in $workDist"
}

Write-Info "Installing package: $($latestIpk.FullName)"
& $aresInstall -d emulator $latestIpk.FullName
if ($LASTEXITCODE -ne 0) {
    throw "ares-install failed with exit code $LASTEXITCODE"
}

Write-Info "Launching app id: $appId"
& $aresLaunch -d emulator $appId
if ($LASTEXITCODE -ne 0) {
    throw "ares-launch failed with exit code $LASTEXITCODE"
}

Write-Ok 'Setup and run completed successfully.'
Write-Host ''
Write-Host 'Fast rerun command:'
Write-Host 'powershell -ExecutionPolicy Bypass -File tools\webos\run.ps1'

