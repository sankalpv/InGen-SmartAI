# install_dependencies.ps1
# Installs Node.js and Ollama if missing on Windows
# RUN AS ADMINISTRATOR

$ErrorActionPreference = "Stop"

function Test-CommandIds ($command) {
    return (Get-Command $command -ErrorAction SilentlyContinue)
}

function Install-NodeJS {
    Write-Host "Checking Node.js..." -ForegroundColor Cyan
    if (Test-CommandIds node) {
        $v = node -v
        Write-Host "Node.js is installed ($v)." -ForegroundColor Green
        return
    }

    Write-Host "Node.js not found. Downloading LTS..." -ForegroundColor Yellow
    $url = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi" # Hardcoded LTS for stability
    $output = "$env:TEMP\node_install.msi"
    
    Invoke-WebRequest -Uri $url -OutFile $output
    
    Write-Host "Installing Node.js (Silent)..." -ForegroundColor Yellow
    # /qn = Quiet, No UI
    Start-Process msiexec.exe -ArgumentList "/i `"$output`" /qn" -Wait
    
    # Refresh env vars in current session is hard. User might need restart.
    Write-Host "Node.js installed. You may need to restart your terminal/PC." -ForegroundColor Green
}

function Install-Ollama {
    Write-Host "Checking Ollama..." -ForegroundColor Cyan
    if (Test-CommandIds ollama) {
        Write-Host "Ollama is installed." -ForegroundColor Green
        return
    }

    Write-Host "Ollama not found. Downloading..." -ForegroundColor Yellow
    $url = "https://ollama.com/download/OllamaSetup.exe"
    $output = "$env:TEMP\OllamaSetup.exe"
    
    try {
        Invoke-WebRequest -Uri $url -OutFile $output
        Write-Host "Installing Ollama..." -ForegroundColor Yellow
        # Ollama setup usually has UI, but we'll try to run it. 
        # It installs to AppData usually.
        Start-Process $output -Wait
        Write-Host "Ollama installed." -ForegroundColor Green
    } catch {
        Write-Error "Failed to download/install Ollama. Please install manually from ollama.com"
    }
}

function Pull-Model {
    param($modelName)
    Write-Host "Checking AI Model ($modelName)..." -ForegroundColor Cyan
    
    # Check if ollama is running
    try {
        $models = ollama list
        if ($models -match $modelName) {
            Write-Host "Model $modelName already exists." -ForegroundColor Green
            return
        }
    } catch {
        Write-Host "Ollama might not be running. Attempting to pull anyway (will start server)..." -ForegroundColor Yellow
    }

    Write-Host "Pulling $modelName (this may take a while)..." -ForegroundColor Magenta
    try {
        # 'ollama pull' will start the daemon if needed usually
        Start-Process ollama -ArgumentList "pull $modelName" -Wait -NoNewWindow
        Write-Host "Model pulled successfully." -ForegroundColor Green
    } catch {
        Write-Error "Failed to pull model. Ensure Ollama is running."
    }
}

# --- Main ---

Write-Host "=== InGen SmartAI Dependency Installer ===" -ForegroundColor White

Install-NodeJS
Install-Ollama

# Check Env Vars (Refreshed from registry if possible, or just warn user)
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

if (-not (Test-CommandIds node)) {
    Write-Warning "Node.js was installed but is not yet in PATH for this session."
    Write-Warning "Please CLOSE this window and run 'start_windows.bat' again."
    pause
    exit
}

# Install NPM deps
Write-Host "Installing Project Dependencies (npm install)..." -ForegroundColor Cyan
npm install

# Setup Model
Pull-Model "llama3"

Write-Host "=== Setup Complete! ===" -ForegroundColor Green
Write-Host "You can now run 'start_windows.bat'"
pause
