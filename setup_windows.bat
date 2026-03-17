@echo off
:: ╔══════════════════════════════════════════════════════════════╗
:: ║            InGen Installer for Windows (v2.0)                ║
:: ║       Local AI-Powered Productivity Dashboard                ║
:: ╚══════════════════════════════════════════════════════════════╝

:: Set execution policy and run the PowerShell installer
cd /d "%~dp0"
echo.
echo   InGen - AI Productivity Dashboard Installer
echo   ============================================
echo.
echo   Launching installer...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\install-ingen.ps1"
pause
