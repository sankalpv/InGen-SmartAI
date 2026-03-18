# ╔══════════════════════════════════════════════════════════════╗
# ║             InGen Uninstaller for Windows (v2.0)             ║
# ╚══════════════════════════════════════════════════════════════╝

$INSTALL_DIR = $PSScriptRoot | Split-Path | Split-Path  # Two levels up from scripts/windows/
$DESKTOP_SHORTCUT = Join-Path ([Environment]::GetFolderPath("Desktop")) "InGen.lnk"
$PROGRESS_FILE = "$env:USERPROFILE\.ingen-install-progress"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Red
Write-Host "    InGen Uninstaller" -ForegroundColor White
Write-Host "  ======================================================" -ForegroundColor Red
Write-Host ""
Write-Host "  This will remove:" -ForegroundColor White
Write-Host "    * $INSTALL_DIR\ (app code, local data, logs)" -ForegroundColor Red
Write-Host "    * Desktop shortcut (InGen.lnk)" -ForegroundColor Red
Write-Host "    * Install progress file (~\.ingen-install-progress)" -ForegroundColor Red
Write-Host ""
Write-Host "  This will NOT remove (shared tools):" -ForegroundColor White
Write-Host "    * Node.js" -ForegroundColor Green
Write-Host "    * Ollama" -ForegroundColor Green
Write-Host "    * Ollama AI models (~10 GB)" -ForegroundColor Green
Write-Host "    * Python" -ForegroundColor Green
Write-Host "    * Amazon Toolbox / MCP tools" -ForegroundColor Green
Write-Host "    * Visual Studio Build Tools" -ForegroundColor Green
Write-Host "    * Quip token (~\.amazon-internal-mcp-server\)" -ForegroundColor Green
Write-Host ""

# Prompt before deletion
$confirm = Read-Host "  Remove InGen? [y/N]"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host ""
    Write-Host "  Uninstall cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""

# --- Stop running InGen processes ---
Write-Host "  Stopping InGen processes..." -ForegroundColor Cyan
try {
    # Stop node processes related to InGen
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
        try {
            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
            $cmdLine -match "launcher\.js|background-agent|smartai|InGen"
        } catch { $false }
    } | ForEach-Object {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        Write-Host "    Stopped process: $($_.Id) ($($_.ProcessName))" -ForegroundColor Gray
    }
} catch { }

# Also kill any npm dev server
try {
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and $_.Path -like "*$INSTALL_DIR*"
    } | Stop-Process -Force -ErrorAction SilentlyContinue
} catch { }

Start-Sleep -Seconds 1
Write-Host "    [OK] Processes stopped" -ForegroundColor Green

# --- Remove Desktop shortcut ---
if (Test-Path $DESKTOP_SHORTCUT) {
    Remove-Item $DESKTOP_SHORTCUT -Force
    Write-Host "    [OK] Removed Desktop shortcut" -ForegroundColor Green
} else {
    Write-Host "    [!!] Desktop shortcut not found (already removed?)" -ForegroundColor Yellow
}

# --- Remove install progress file ---
if (Test-Path $PROGRESS_FILE) {
    Remove-Item $PROGRESS_FILE -Force
    Write-Host "    [OK] Removed install progress file" -ForegroundColor Green
}

# --- Remove InGen directory ---
if (Test-Path $INSTALL_DIR) {
    Write-Host "    Removing $INSTALL_DIR\ ..." -ForegroundColor Cyan
    try {
        Remove-Item $INSTALL_DIR -Recurse -Force
        Write-Host "    [OK] Removed $INSTALL_DIR\" -ForegroundColor Green
    } catch {
        Write-Host "    [!!] Could not fully remove $INSTALL_DIR\: $_" -ForegroundColor Yellow
        Write-Host "    Some files may be locked. Close all terminals and try again." -ForegroundColor Yellow
    }
} else {
    Write-Host "    [!!] $INSTALL_DIR\ not found (already removed?)" -ForegroundColor Yellow
}

# --- Done ---
Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host "    InGen has been uninstalled." -ForegroundColor White
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  To reclaim disk space (optional):" -ForegroundColor White
Write-Host ""
Write-Host "  Remove AI models (~10 GB):" -ForegroundColor Gray
Write-Host "    ollama rm llama3.2:1b" -ForegroundColor Cyan
Write-Host "    ollama rm qwen3-embedding" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Remove Ollama entirely:" -ForegroundColor Gray
Write-Host "    Uninstall from Settings > Apps > Ollama" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Remove Node.js:" -ForegroundColor Gray
Write-Host "    Uninstall from Settings > Apps > Node.js" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Remove Python:" -ForegroundColor Gray
Write-Host "    Uninstall from Settings > Apps > Python" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Remove VS Build Tools (~2-4 GB):" -ForegroundColor Gray
Write-Host "    Uninstall from Settings > Apps > Visual Studio Build Tools" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Remove Amazon Toolbox + MCP tools:" -ForegroundColor Gray
Write-Host ""
Write-Host "  Remove Quip token:" -ForegroundColor Gray
Write-Host "    Remove-Item `"$env:USERPROFILE\.amazon-internal-mcp-server`" -Recurse" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To reinstall later:" -ForegroundColor Gray
Write-Host "    git clone ssh://git.amazon.com/pkg/InGen-SmartAI" -ForegroundColor Cyan
Write-Host "    cd InGen-SmartAI && .\setup_windows.bat" -ForegroundColor Cyan
Write-Host ""

pause
