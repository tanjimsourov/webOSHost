@echo off
setlocal

set SCRIPT_DIR=%~dp0
set DEVICE=%~1
set MODE=%~2

if "%DEVICE%"=="" set DEVICE=emulator

if /I "%MODE%"=="build" (
  powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%tools\webos\install_on_lg_screen.ps1" -Device "%DEVICE%" -BuildOnly
) else (
  powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%tools\webos\install_on_lg_screen.ps1" -Device "%DEVICE%"
)

if errorlevel 1 (
  echo.
  echo [FAIL] Install launcher failed.
  exit /b 1
)

echo.
echo [OK] Completed.
exit /b 0
