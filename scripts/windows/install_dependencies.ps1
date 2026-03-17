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

# --- C++ Build Tools (required for native Node modules like hnswlib-node) ---
Write-Host "`nChecking C++ Build Tools (required for hnswlib-node vector search)..." -ForegroundColor Cyan
$hasClExe = $false
try {
    # Check if cl.exe is available (MSVC compiler)
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $vsPath = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
        if ($vsPath) {
            Write-Host "Visual Studio Build Tools found at: $vsPath" -ForegroundColor Green
            $hasClExe = $true
        }
    }
    if (-not $hasClExe) {
        # Also check if cl.exe is directly on PATH
        $clCheck = Get-Command cl.exe -ErrorAction SilentlyContinue
        if ($clCheck) {
            Write-Host "C++ compiler (cl.exe) found on PATH." -ForegroundColor Green
            $hasClExe = $true
        }
    }
} catch { }

if (-not $hasClExe) {
    Write-Host "C++ Build Tools not found. Installing Visual Studio Build Tools 2022..." -ForegroundColor Yellow
    Write-Host "  (This is needed for hnswlib-node vector search. ~2-4 GB download)" -ForegroundColor Yellow
    
    $vsUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe"
    $vsInstaller = "$env:TEMP\vs_BuildTools.exe"
    
    try {
        Invoke-WebRequest -Uri $vsUrl -OutFile $vsInstaller
        Write-Host "  Running installer (selecting C++ workload)..." -ForegroundColor Yellow
        # Install with C++ Desktop workload (includes cl.exe, MSBuild, Windows SDK)
        Start-Process $vsInstaller -ArgumentList "--quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" -Wait
        Write-Host "  Visual Studio Build Tools installed." -ForegroundColor Green
        $hasClExe = $true
        
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } catch {
        Write-Host "  Failed to install Build Tools automatically." -ForegroundColor Red
        Write-Host "  Please install manually from: https://visualstudio.microsoft.com/visual-cpp-build-tools/" -ForegroundColor Yellow
        Write-Host "  Select 'Desktop development with C++' workload." -ForegroundColor Yellow
    }
}

# Install NPM deps
Write-Host "`nInstalling Project Dependencies (npm install)..." -ForegroundColor Cyan
npm install

# Rebuild native modules if build tools are available
if ($hasClExe) {
    Write-Host "`nRebuilding native modules (hnswlib-node)..." -ForegroundColor Cyan
    try {
        npm rebuild hnswlib-node 2>&1
        Write-Host "  hnswlib-node rebuilt successfully." -ForegroundColor Green
    } catch {
        Write-Host "  hnswlib-node rebuild failed: $_" -ForegroundColor Yellow
        Write-Host "  Vector search will be disabled. The app will still work." -ForegroundColor Yellow
    }
} else {
    Write-Host "`nSkipping hnswlib-node rebuild (no C++ build tools)." -ForegroundColor Yellow
    Write-Host "  Vector search will be disabled. Install Build Tools and run 'npm rebuild hnswlib-node' to enable." -ForegroundColor Yellow
}

# Setup Models (Windows-optimized: smaller LLM for CPU, plus embedding model)
Pull-Model "llama3.2:1b"
Pull-Model "qwen3-embedding"

# --- Python + Outlook Forensic Extraction Dependencies ---
Write-Host "`nChecking Python..." -ForegroundColor Cyan
if (Test-CommandIds python) {
    $pyVer = python --version 2>&1
    Write-Host "Python is installed ($pyVer)." -ForegroundColor Green
} else {
    Write-Host "Python not found. Please install Python 3.12+ from python.org" -ForegroundColor Yellow
    Write-Host "  Download: https://www.python.org/downloads/" -ForegroundColor Yellow
}

# Install CCL Chromium Reader for Outlook IndexedDB extraction
Write-Host "`nInstalling Python dependencies for Outlook extraction..." -ForegroundColor Cyan
try {
    pip install plyvel-ci 2>&1 | Out-Null
    Write-Host "  plyvel-ci installed." -ForegroundColor Green
} catch {
    Write-Host "  plyvel-ci install failed (non-critical)." -ForegroundColor Yellow
}
try {
    pip install git+https://github.com/cclgroupltd/ccl_chrome_indexeddb.git 2>&1 | Out-Null
    Write-Host "  ccl_chromium_reader installed." -ForegroundColor Green
} catch {
    Write-Host "  ccl_chromium_reader install failed. Install manually:" -ForegroundColor Yellow
    Write-Host "    pip install git+https://github.com/cclgroupltd/ccl_chrome_indexeddb.git" -ForegroundColor Yellow
}

# --- Amazon Toolbox + MCP Tools (builder-mcp, amzn-mcp, slack-mcp) ---
Write-Host "`n=== Amazon Toolbox & MCP Tools ===" -ForegroundColor White
Write-Host "MCP tools enable Phonetool, code.amazon.com, Taskei, Quip, and Slack integration." -ForegroundColor Cyan

$toolboxPath = "$env:LOCALAPPDATA\Toolbox\bin\toolbox.exe"
$toolboxBinDir = "$env:LOCALAPPDATA\Toolbox\bin"

# --- Install Toolbox if not present ---
if (-not (Test-Path $toolboxPath)) {
    Write-Host "`nAmazon Toolbox not found. Installing..." -ForegroundColor Yellow
    Write-Host "  (Requires VPN + Midway authentication)" -ForegroundColor Yellow
    try {
        # Official Amazon Toolbox installer for Windows
        Invoke-WebRequest -useb https://toolbox.a2z.com/install.ps1 | Invoke-Expression
        
        # Refresh PATH so toolbox is available in this session
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        # Also add Toolbox bin dir to PATH for this session if not already there
        if ($env:Path -notlike "*$toolboxBinDir*") {
            $env:Path = "$toolboxBinDir;$env:Path"
        }
        
        if (Test-Path $toolboxPath) {
            $tbVersion = & $toolboxPath --version 2>&1
            Write-Host "  Toolbox installed successfully ($tbVersion)." -ForegroundColor Green
        } else {
            Write-Host "  Toolbox install completed but binary not found at expected path." -ForegroundColor Yellow
            Write-Host "  You may need to close and reopen your terminal, then re-run this script." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  Failed to install Toolbox automatically: $_" -ForegroundColor Red
        Write-Host "  Manual install instructions:" -ForegroundColor Yellow
        Write-Host "    1. Connect to VPN and authenticate with Midway" -ForegroundColor Yellow
        Write-Host "    2. Open PowerShell and run:" -ForegroundColor Yellow
        Write-Host "       iwr -useb https://toolbox.a2z.com/install.ps1 | iex" -ForegroundColor Cyan
        Write-Host "    3. Close and reopen your terminal" -ForegroundColor Yellow
        Write-Host "    4. Re-run this installer" -ForegroundColor Yellow
    }
} else {
    $tbVersion = & $toolboxPath --version 2>&1
    Write-Host "Toolbox is installed ($tbVersion)." -ForegroundColor Green
}

# --- Install MCP tools via Toolbox ---
if (Test-Path $toolboxPath) {
    # Helper function to install a Toolbox tool
    function Install-ToolboxTool {
        param($ToolName, $Description)
        $toolExePath = "$toolboxBinDir\$ToolName.exe"
        if (Test-Path $toolExePath) {
            Write-Host "  $ToolName already installed." -ForegroundColor Green
        } else {
            Write-Host "  Installing $ToolName ($Description)..." -ForegroundColor Yellow
            try {
                & $toolboxPath install $ToolName 2>&1 | Out-Null
                if (Test-Path $toolExePath) {
                    Write-Host "  $ToolName installed successfully." -ForegroundColor Green
                } else {
                    Write-Host "  $ToolName install completed but binary not found." -ForegroundColor Yellow
                }
            } catch {
                Write-Host "  Failed to install ${ToolName}: $_" -ForegroundColor Yellow
                Write-Host "  Install manually later: toolbox install $ToolName" -ForegroundColor Yellow
            }
        }
    }

    Write-Host "`nInstalling MCP tools..." -ForegroundColor Cyan
    Install-ToolboxTool "builder-mcp" "Phonetool, code.amazon.com, Taskei, Quip"
    Install-ToolboxTool "amzn-mcp" "Amazon internal MCP server"
    Install-ToolboxTool "slack-mcp" "Slack messaging integration"
    Install-ToolboxTool "mcp-registry" "MCP tool registry"

    # --- Update config/settings.json with resolved MCP paths ---
    Write-Host "`nUpdating MCP server paths in config/settings.json..." -ForegroundColor Cyan
    $settingsFile = Join-Path $PSScriptRoot "..\..\config\settings.json"
    if (Test-Path $settingsFile) {
        try {
            $settings = Get-Content $settingsFile -Raw | ConvertFrom-Json

            # Ensure mcpServers section exists
            if (-not $settings.mcpServers) {
                $settings | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue ([PSCustomObject]@{}) -Force
            }

            # Update builder-mcp path
            $builderPath = "$toolboxBinDir\builder-mcp.exe"
            if (Test-Path $builderPath) {
                if (-not $settings.mcpServers.'builder-mcp') {
                    $settings.mcpServers | Add-Member -NotePropertyName "builder-mcp" -NotePropertyValue ([PSCustomObject]@{ command = $builderPath; args = @(); env = [PSCustomObject]@{} }) -Force
                } else {
                    $settings.mcpServers.'builder-mcp'.command = $builderPath
                }
                Write-Host "  builder-mcp path: $builderPath" -ForegroundColor Green
            }

            # Update amzn-mcp path
            $amznPath = "$toolboxBinDir\amzn-mcp.exe"
            if (Test-Path $amznPath) {
                if (-not $settings.mcpServers.'amzn-mcp') {
                    $settings.mcpServers | Add-Member -NotePropertyName "amzn-mcp" -NotePropertyValue ([PSCustomObject]@{ command = $amznPath; args = @(); env = [PSCustomObject]@{} }) -Force
                } else {
                    $settings.mcpServers.'amzn-mcp'.command = $amznPath
                }
                Write-Host "  amzn-mcp path: $amznPath" -ForegroundColor Green
            }

            # Update slack-mcp path
            $slackPath = "$toolboxBinDir\slack-mcp.exe"
            if (Test-Path $slackPath) {
                if (-not $settings.mcpServers.'slack-mcp') {
                    $settings.mcpServers | Add-Member -NotePropertyName "slack-mcp" -NotePropertyValue ([PSCustomObject]@{ command = $slackPath; args = @(); env = [PSCustomObject]@{} }) -Force
                } else {
                    $settings.mcpServers.'slack-mcp'.command = $slackPath
                }
                Write-Host "  slack-mcp path: $slackPath" -ForegroundColor Green
            }

            # Write back settings.json with proper formatting
            $settings | ConvertTo-Json -Depth 10 | Set-Content $settingsFile -Encoding UTF8
            Write-Host "  config/settings.json updated." -ForegroundColor Green
        } catch {
            Write-Host "  Failed to update settings.json: $_" -ForegroundColor Yellow
            Write-Host "  MCP paths will be auto-resolved at runtime." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  settings.json not found — MCP paths will be auto-resolved at runtime." -ForegroundColor Yellow
    }
} else {
    Write-Host "`nToolbox not available — skipping MCP tool installation." -ForegroundColor Yellow
    Write-Host "  Team Health, Code Metrics, Ticket Health, and Slack features will not work." -ForegroundColor Yellow
    Write-Host "  Install Toolbox later:" -ForegroundColor Yellow
    Write-Host "    iwr -useb https://toolbox.a2z.com/install.ps1 | iex" -ForegroundColor Cyan
    Write-Host "  Then install MCP tools:" -ForegroundColor Yellow
    Write-Host "    toolbox install builder-mcp" -ForegroundColor Cyan
    Write-Host "    toolbox install amzn-mcp" -ForegroundColor Cyan
    Write-Host "    toolbox install slack-mcp" -ForegroundColor Cyan
}

Write-Host "`n=== Setup Complete! ===" -ForegroundColor Green
Write-Host "You can now run 'start_windows.bat'"
Write-Host ""
Write-Host "Optional: Extract Outlook data with:" -ForegroundColor Cyan
Write-Host "  python scripts\windows\outlook_extractor.py" -ForegroundColor White
pause
