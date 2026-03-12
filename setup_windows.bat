@echo off
:: Check for Admin
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Verified Admin Privileges.
) else (
    echo Requesting Administrative Privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo Starting Dependency Installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\install_dependencies.ps1"
pause
