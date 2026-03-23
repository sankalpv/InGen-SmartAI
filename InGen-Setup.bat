@echo off
setlocal enabledelayedexpansion
title InGen - AI Productivity Dashboard Setup
color 0B

echo.
echo  ======================================================
echo    InGen - AI Productivity Dashboard
echo    One-Click Windows Installer
echo  ======================================================
echo.
echo  This will download and install InGen to:
echo    %USERPROFILE%\InGen
echo.
echo  Requirements: Internet connection
echo  Time: ~5-10 minutes
echo.

set "INSTALL_DIR=%USERPROFILE%\InGen"
set "AMAZON_REPO=ssh://git.amazon.com/pkg/InGen-SmartAI"
set "AMAZON_HTTPS=https://git.amazon.com/pkg/InGen-SmartAI"
set "GITHUB_ZIP=https://github.com/sankalpv/InGen-SmartAI/archive/refs/heads/mainline.zip"
set "ZIP_FILE=%TEMP%\InGen-download.zip"
set "EXTRACT_DIR=%TEMP%\InGen-extract"

REM --- Check if already installed ---
if exist "%INSTALL_DIR%\package.json" (
    echo  [!!] InGen already installed at %INSTALL_DIR%
    echo.
    set /p REINSTALL="  Reinstall/Update? [y/N]: "
    if /i not "!REINSTALL!"=="y" (
        echo  Running existing installer...
        goto :run_installer
    )
    echo  Updating existing installation...
)

REM --- Download ---
echo  [1/3] Downloading InGen...
echo.
echo    Requires: Amazon VPN connected
echo.

REM Strategy 1: git clone via SSH (fastest if SSH keys configured)
where git >nul 2>&1
if %errorlevel% equ 0 (
    echo    Trying git clone (SSH)...
    if exist "%INSTALL_DIR%" rd /s /q "%INSTALL_DIR%" 2>nul
    git clone "%AMAZON_REPO%" "%INSTALL_DIR%" 2>nul
    if %errorlevel% equ 0 (
        echo    [OK] Cloned from code.amazon.com (SSH)
        goto :run_installer
    )

    REM Strategy 2: git clone via HTTPS (Midway auth)
    echo    SSH failed. Trying HTTPS (may prompt for Midway credentials)...
    git clone "%AMAZON_HTTPS%" "%INSTALL_DIR%" 2>nul
    if %errorlevel% equ 0 (
        echo    [OK] Cloned from code.amazon.com (HTTPS)
        goto :run_installer
    )

    REM Strategy 3: GitHub mirror (no VPN needed)
    echo    Amazon git failed. Trying GitHub mirror...
    git clone https://github.com/sankalpv/InGen-SmartAI.git "%INSTALL_DIR%" 2>nul
    if %errorlevel% equ 0 (
        echo    [OK] Cloned from GitHub
        goto :run_installer
    )
)

REM Strategy 4: ZIP download from GitHub (no git needed)
echo    Git not available. Downloading ZIP...
powershell -NoProfile -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%GITHUB_ZIP%' -OutFile '%ZIP_FILE%' -TimeoutSec 60; Write-Host 'OK' } catch { Write-Host 'FAIL' }" > "%TEMP%\dl_result.txt" 2>&1
set /p DL_RESULT=<"%TEMP%\dl_result.txt"

if not "!DL_RESULT:OK=!"=="!DL_RESULT!" (
    echo    [OK] Downloaded ZIP from GitHub
    goto :extract
)

echo.
echo  [XX] All download methods failed.
echo.
echo  Please try one of these:
echo    1. Connect to Amazon VPN, authenticate Midway, and re-run
echo    2. Install Git: winget install Git.Git
echo    3. Download manually from:
echo       https://code.amazon.com/packages/InGen-SmartAI/trees/mainline
echo       Extract to: %INSTALL_DIR%
echo       Then re-run this installer
echo.
pause
exit /b 1

:extract
echo  [2/3] Extracting...

REM Clean up previous extract
if exist "%EXTRACT_DIR%" rd /s /q "%EXTRACT_DIR%" 2>nul
mkdir "%EXTRACT_DIR%" 2>nul

REM Extract ZIP using PowerShell
powershell -NoProfile -Command "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%EXTRACT_DIR%' -Force"

REM Find the extracted folder (GitHub adds branch name suffix)
for /d %%D in ("%EXTRACT_DIR%\*") do (
    set "EXTRACTED_FOLDER=%%D"
)

if not defined EXTRACTED_FOLDER (
    echo  [XX] Extraction failed.
    pause
    exit /b 1
)

REM Move to install directory
if exist "%INSTALL_DIR%" (
    REM Preserve existing config files
    if exist "%INSTALL_DIR%\config\settings.json" (
        copy "%INSTALL_DIR%\config\settings.json" "%TEMP%\ingen-settings-backup.json" >nul 2>&1
    )
    if exist "%INSTALL_DIR%\.env.local" (
        copy "%INSTALL_DIR%\.env.local" "%TEMP%\ingen-env-backup" >nul 2>&1
    )
    rd /s /q "%INSTALL_DIR%" 2>nul
)

move "!EXTRACTED_FOLDER!" "%INSTALL_DIR%" >nul
echo    [OK] Extracted to %INSTALL_DIR%

REM Restore config backups
if exist "%TEMP%\ingen-settings-backup.json" (
    copy "%TEMP%\ingen-settings-backup.json" "%INSTALL_DIR%\config\settings.json" >nul 2>&1
    echo    [OK] Restored previous settings
)
if exist "%TEMP%\ingen-env-backup" (
    copy "%TEMP%\ingen-env-backup" "%INSTALL_DIR%\.env.local" >nul 2>&1
    echo    [OK] Restored previous .env.local
)

REM Clean up temp files
del "%ZIP_FILE%" 2>nul
rd /s /q "%EXTRACT_DIR%" 2>nul

:run_installer
echo  [3/3] Running InGen installer...
echo.

REM Run the PowerShell installer
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%\scripts\windows\install-ingen.ps1"

if %errorlevel% neq 0 (
    echo.
    echo  [!!] Installer exited with errors.
    echo  You can re-run: powershell -File "%INSTALL_DIR%\scripts\windows\install-ingen.ps1"
    echo.
)

pause
