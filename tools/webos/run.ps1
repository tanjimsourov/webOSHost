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

$npmDir = Join-Path $env:APPDATA 'npm'
Add-PathEntryIfMissing $npmDir

$workDist = 'C:\LG\work\dist'
New-Item -Path $workDist -ItemType Directory -Force | Out-Null

$aresPackage = Get-AresCommandPath 'ares-package'
$aresInstall = Get-AresCommandPath 'ares-install'
$aresLaunch = Get-AresCommandPath 'ares-launch'

Write-Info 'Packaging app...'
Push-Location $workDist
try {
    $excludeArgs = @(
        '-e', 'tools',
        '-e', 'output',
        '-e', 'docs',
        '-e', 'dist',
        '-e', '.playwright-cli',
        '-e', 'assets/java',
        '-e', 'assets/images_original',
        '-e', 'LGwebOS.zip',
        '-e', 'PARITY_CHECKLIST.md',
        '-e', 'REGRESSION_CHECKLIST.md',
        '-e', 'README.md'
    )
    & $aresPackage --no-minify @excludeArgs $appRoot
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

Write-Ok 'Run completed successfully.'
