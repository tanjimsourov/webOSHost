param(
    [string]$Device = 'emulator',
    [switch]$BuildOnly
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
    }
}

function Get-AresCommandPath($BaseName) {
    $cmdShim = Join-Path (Join-Path $env:APPDATA 'npm') ("$BaseName.cmd")
    if (Test-Path $cmdShim) {
        return $cmdShim
    }
    return Get-RequiredCommandPath $BaseName
}

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

Add-PathEntryIfMissing (Join-Path $env:APPDATA 'npm')

$aresPackage = Get-AresCommandPath 'ares-package'
$distDir = Join-Path $repoRoot 'dist'
New-Item -Path $distDir -ItemType Directory -Force | Out-Null

Write-Info "Packaging app as .ipk from $repoRoot"
Push-Location $repoRoot
try {
    & $aresPackage --no-minify -o $distDir .
    if ($LASTEXITCODE -ne 0) {
        throw "ares-package failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$latestIpk = Get-ChildItem -Path $distDir -Filter '*.ipk' -File |
    Sort-Object -Property LastWriteTime -Descending |
    Select-Object -First 1

if (-not $latestIpk) {
    throw "No .ipk package found in $distDir"
}

Write-Ok "IPK ready: $($latestIpk.FullName)"

if ($BuildOnly) {
    Write-Host ''
    Write-Host 'Build-only mode complete.'
    exit 0
}

$aresInstall = Get-AresCommandPath 'ares-install'
$aresLaunch = Get-AresCommandPath 'ares-launch'
$aresSetupDevice = Get-AresCommandPath 'ares-setup-device'

try {
    $deviceList = (& $aresSetupDevice --list | Out-String)
    if ($deviceList -notmatch ("(?m)^" + [regex]::Escape($Device) + "\s")) {
        Write-Host "[WARN] Device '$Device' was not found in ares-setup-device --list." -ForegroundColor Yellow
        Write-Host "       Configure it first with: ares-setup-device"
    }
}
catch {
    Write-Host "[WARN] Could not verify device list. Continuing with install attempt." -ForegroundColor Yellow
}

Write-Info "Installing package on device '$Device'"
& $aresInstall -d $Device $latestIpk.FullName
if ($LASTEXITCODE -ne 0) {
    throw "ares-install failed with exit code $LASTEXITCODE"
}

Write-Info "Launching app id '$appId' on device '$Device'"
& $aresLaunch -d $Device $appId
if ($LASTEXITCODE -ne 0) {
    throw "ares-launch failed with exit code $LASTEXITCODE"
}

Write-Ok 'Install and launch completed successfully.'
