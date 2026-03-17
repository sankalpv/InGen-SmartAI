# ╔══════════════════════════════════════════════════════════════╗
# ║            InGen Installer for Windows (v2.0)                ║
# ║       Local AI-Powered Productivity Dashboard                ║
# ║                                                              ║
# ║  Features: Resume support, disk space check, MCP tooling,   ║
# ║  Node-based JSON config, post-install health verification    ║
# ╚══════════════════════════════════════════════════════════════╝

# --- Configuration ---
$INSTALL_DIR = $PSScriptRoot | Split-Path | Split-Path  # Two levels up from scripts/windows/
$LLM_MODEL = "llama3.2:1b"
$EMBEDDING_MODEL = "qwen3-embedding"
$PROGRESS_FILE = "$env:USERPROFILE\.ingen-install-progress"
$TOTAL_STEPS = 11
$SETTINGS_FILE = Join-Path $INSTALL_DIR "config\settings.json"
$ENV_FILE = Join-Path $INSTALL_DIR ".env.local"
$TOOLBOX_BIN = "$env:LOCALAPPDATA\Toolbox\bin"
$DEFAULT_TASKEI_URL = "https://taskei.amazon.dev/rooms/2c8f0ce4-0d0d-4ff9-9d8d-eb744252bc23/tasks?f=folder%3Aab02443f-f7a8-4fec-a815-afc0a27906fa"
$DEFAULT_BEDROCK_KEY = ""
$DEFAULT_CW_ACCESS_KEY = ""
$DEFAULT_CW_SECRET_KEY = ""
$DEFAULT_CW_REGION = "us-east-1"

# --- Unblock all scripts (downloaded from internet gets Zone.Identifier) ---
Get-ChildItem -Path $INSTALL_DIR -Recurse -Include '*.ps1','*.bat','*.cmd' -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue

# --- Installation Log ---
$LOG_FILE = Join-Path $INSTALL_DIR 'install.log'
Start-Transcript -Path $LOG_FILE -Append -Force | Out-Null
Write-Host "  [Log] Installation log: $LOG_FILE" -ForegroundColor DarkGray

# --- Utility Functions ---

function Print-Header {
    Write-Host ""
    Write-Host "  ======================================================" -ForegroundColor Magenta
    Write-Host "    InGen - AI Productivity Dashboard Installer" -ForegroundColor White
    Write-Host "    Local-first * Privacy-first * Zero cloud" -ForegroundColor Cyan
    Write-Host "    v2.0 - with resume support & MCP tooling" -ForegroundColor DarkGray
    Write-Host "  ======================================================" -ForegroundColor Magenta
    Write-Host ""
    if (Test-Path $PROGRESS_FILE) {
        $completed = (Get-Content $PROGRESS_FILE | Measure-Object -Line).Lines
        Write-Host "  >> Resuming installation ($completed steps already completed)" -ForegroundColor Yellow
        Write-Host "     Delete $PROGRESS_FILE to start fresh" -ForegroundColor DarkGray
        Write-Host ""
    }
}

function Print-Step ($num, $title) {
    Write-Host ""
    Write-Host "  --------------------------------------------------------" -ForegroundColor Blue
    Write-Host "    [$num/$TOTAL_STEPS] $title" -ForegroundColor White
    Write-Host "  --------------------------------------------------------" -ForegroundColor Blue
}

function Print-Ok ($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Print-Warn ($msg) { Write-Host "    [!!] $msg" -ForegroundColor Yellow }
function Print-Fail ($msg) { Write-Host "    [XX] $msg" -ForegroundColor Red }
function Print-Info ($msg) { Write-Host "    [..] $msg" -ForegroundColor Cyan }

function Step-Done ($stepName) {
    Add-Content -Path $PROGRESS_FILE -Value $stepName
}

function Is-StepDone ($stepName) {
    if (Test-Path $PROGRESS_FILE) {
        return (Get-Content $PROGRESS_FILE | Where-Object { $_ -eq $stepName }).Count -gt 0
    }
    return $false
}

function Clear-Progress {
    Remove-Item -Path $PROGRESS_FILE -ErrorAction SilentlyContinue
}

function Test-CommandExists ($command) {
    return [bool](Get-Command $command -ErrorAction SilentlyContinue)
}

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    if (Test-Path $TOOLBOX_BIN) {
        if ($env:Path -notlike "*$TOOLBOX_BIN*") {
            $env:Path = "$TOOLBOX_BIN;$env:Path"
        }
    }
}

function Node-JsonSet ($file, $key, $value) {
    # Convert Windows backslashes to forward slashes for JSON/Node.js compatibility
    $safeFile = $file -replace '\\', '/'
    $safeValue = $value -replace '\\', '/'
    $safeValue = $safeValue -replace '"', '\"'
    $script = @"
const fs = require('fs');
const f = '$safeFile';
const d = JSON.parse(fs.readFileSync(f, 'utf8'));
const keys = '$key'.split('.');
let obj = d;
for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]]) obj[keys[i]] = {};
    obj = obj[keys[i]];
}
try { obj[keys[keys.length-1]] = JSON.parse('$safeValue'); }
catch { obj[keys[keys.length-1]] = '$safeValue'; }
fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
"@
    # Write script to temp file to avoid BOM issues with node -e
    $tmpScript = Join-Path $env:TEMP 'ingen-json-set.js'
    [System.IO.File]::WriteAllText($tmpScript, $script, (New-Object System.Text.UTF8Encoding $false))
    node $tmpScript 2>$null
    Remove-Item $tmpScript -ErrorAction SilentlyContinue
}

# ═══════════════════════════════════════════════════════════════
# Step 1: System Check
# ═══════════════════════════════════════════════════════════════
function Step-01-SystemCheck {
    if (Is-StepDone "step_01") { Print-Step 1 "System Check [OK] (cached)"; return }
    Print-Step 1 "Checking system requirements"

    # Must be Windows
    if ($env:OS -ne "Windows_NT") {
        Print-Fail "This installer is for Windows only."
        exit 1
    }
    $osInfo = (Get-CimInstance Win32_OperatingSystem)
    Print-Ok "Windows $($osInfo.Version) ($($osInfo.Caption))"

    # Architecture
    $arch = $env:PROCESSOR_ARCHITECTURE
    Print-Ok "Architecture: $arch"

    # Disk space check (~15 GB needed: 10 GB models + 3 GB node_modules + 2 GB buffer)
    $drive = (Get-Item $env:USERPROFILE).PSDrive.Name
    $freeGB = [math]::Round((Get-PSDrive $drive).Free / 1GB, 1)
    if ($freeGB -lt 15) {
        Print-Warn "Low disk space: ${freeGB} GB free (15 GB recommended)"
        Print-Info "AI models need ~10 GB + ~3 GB for dependencies"
        $continue = Read-Host "    Continue anyway? [y/N]"
        if ($continue -ne "y" -and $continue -ne "Y") {
            Write-Host "    Install cancelled. Free up disk space and try again."
            exit 1
        }
    } else {
        Print-Ok "Disk space: ${freeGB} GB free"
    }

    # Check Outlook — detect both Classic and New
    $outlookPath = "${env:ProgramFiles}\Microsoft Office\root\Office16\OUTLOOK.EXE"
    $outlookPath2 = "${env:ProgramFiles(x86)}\Microsoft Office\root\Office16\OUTLOOK.EXE"
    $hasClassic = (Test-Path $outlookPath) -or (Test-Path $outlookPath2)
    $newOutlook = Get-AppxPackage -Name 'Microsoft.OutlookForWindows' -ErrorAction SilentlyContinue
    $hasNew = $null -ne $newOutlook

    if ($hasNew -and $hasClassic) {
        Print-Ok 'Microsoft Outlook (New + Classic both installed)'
        Print-Info 'New Outlook detected - data will be extracted via IndexedDB reader'
    } elseif ($hasNew) {
        Print-Ok 'Microsoft Outlook (New) installed'
        Print-Info 'Data will be extracted via IndexedDB reader (Python extractor)'
    } elseif ($hasClassic) {
        Print-Ok 'Microsoft Outlook (Classic) installed'
    } else {
        Print-Warn 'Microsoft Outlook not found'
        Print-Info 'InGen reads local Outlook data. Install Outlook for full functionality.'
    }

    Step-Done "step_01"
}

# ═══════════════════════════════════════════════════════════════
# Step 2: C++ Build Tools
# ═══════════════════════════════════════════════════════════════
function Step-02-BuildTools {
    if (Is-StepDone "step_02") { Print-Step 2 "C++ Build Tools [OK] (cached)"; return }
    Print-Step 2 "Checking C++ Build Tools"

    $hasClExe = $false
    try {
        $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
        if (Test-Path $vsWhere) {
            $vsPath = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
            if ($vsPath) {
                Print-Ok "Visual Studio Build Tools found"
                $hasClExe = $true
            }
        }
        if (-not $hasClExe) {
            $clCheck = Get-Command cl.exe -ErrorAction SilentlyContinue
            if ($clCheck) {
                Print-Ok "C++ compiler (cl.exe) found on PATH"
                $hasClExe = $true
            }
        }
    } catch { }

    if (-not $hasClExe) {
        Print-Warn "C++ Build Tools not found. Installing Visual Studio Build Tools 2022..."
        Print-Info "This is needed for hnswlib-node vector search (~2-4 GB download)"
        try {
            $vsUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe"
            $vsInstaller = "$env:TEMP\vs_BuildTools.exe"
            Invoke-WebRequest -Uri $vsUrl -OutFile $vsInstaller
            Print-Info "Running installer (selecting C++ workload)..."
            Start-Process $vsInstaller -ArgumentList "--quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.Windows11SDK.22621 --includeRecommended" -Wait
            Print-Ok "Visual Studio Build Tools installed"
            Refresh-Path
        } catch {
            Print-Warn "Failed to install Build Tools automatically"
            Print-Info "Install manually: https://visualstudio.microsoft.com/visual-cpp-build-tools/"
            Print-Info "Select 'Desktop development with C++' workload"
        }
    }

    # Python (needed by node-gyp for native modules + Outlook extraction)
    # Note: Windows Store alias returns true for Test-CommandExists but isn't real Python
    $pyReal = $false
    try { $pyOut = python --version 2>&1; if ($pyOut -match 'Python \d') { $pyReal = $true } } catch {}
    if ($pyReal) {
        Print-Ok "Python available ($pyOut)"
    } else {
        Print-Warn "Python not found. Installing Python 3.12..."
        Print-Info "Python is required for native module builds and Outlook extraction"
        try {
            $pyUrl = "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe"
            $pyInstaller = "$env:TEMP\python_install.exe"
            Invoke-WebRequest -Uri $pyUrl -OutFile $pyInstaller
            Print-Info "Installing Python (silent, with PATH)..."
            Start-Process $pyInstaller -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1" -Wait
            Refresh-Path
            if (Test-CommandExists python) {
                $pyVer = python --version 2>&1
                Print-Ok "Python installed ($pyVer)"
            } else {
                Print-Warn "Python installed but not in PATH yet. May need terminal restart."
            }
        } catch {
            Print-Fail "Failed to install Python: $_"
            Print-Info "Install manually from: https://www.python.org/downloads/"
            Print-Info "IMPORTANT: Check 'Add Python to PATH' during installation"
        }
    }

    Step-Done "step_02"
}

# ═══════════════════════════════════════════════════════════════
# Step 3: Node.js
# ═══════════════════════════════════════════════════════════════
function Step-03-NodeJS {
    if (Is-StepDone "step_03") { Print-Step 3 "Node.js [OK] (cached)"; return }
    Print-Step 3 "Checking Node.js"

    $needInstall = $false
    if (-not (Test-CommandExists node)) {
        $needInstall = $true
        Print-Warn "Node.js not found"
    } else {
        $nodeVer = node -v 2>$null
        $nodeMajor = [int]($nodeVer -replace 'v','').Split('.')[0]
        if ($nodeMajor -lt 20) {
            $needInstall = $true
            Print-Warn "Node.js $nodeVer is too old (need 20+)"
        }
    }

    if ($needInstall) {
        Print-Info "Downloading Node.js LTS..."
        try {
            $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
            $nodeInstaller = "$env:TEMP\node_install.msi"
            Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller
            Print-Info "Installing Node.js (silent)..."
            Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /qn" -Wait
            Refresh-Path

            # Also try common Node.js install paths directly
            $nodePaths = @(
                "$env:ProgramFiles\nodejs",
                "${env:ProgramFiles(x86)}\nodejs",
                "$env:APPDATA\npm"
            )
            foreach ($np in $nodePaths) {
                if ((Test-Path (Join-Path $np 'node.exe')) -and ($env:Path -notlike "*$np*")) {
                    $env:Path = "$np;$env:Path"
                }
            }

            if (-not (Test-CommandExists node)) {
                Print-Fail "Node.js installed but not in PATH. Please restart terminal and re-run."
                pause
                exit 1
            }
        } catch {
            Print-Fail "Failed to install Node.js: $_"
            Print-Info "Download manually: https://nodejs.org"
            pause
            exit 1
        }
    }

    $nodeVer = node -v 2>$null
    $npmVer = npm -v 2>$null
    Print-Ok "Node.js $nodeVer / npm $npmVer"
    Step-Done "step_03"
}

# ═══════════════════════════════════════════════════════════════
# Step 4: Ollama
# ═══════════════════════════════════════════════════════════════
function Step-04-Ollama {
    if (Is-StepDone "step_04") { Print-Step 4 "Ollama [OK] (cached)"; return }
    Print-Step 4 "Checking Ollama (local AI engine)"

    if (-not (Test-CommandExists ollama)) {
        Print-Warn "Ollama not found. Downloading..."
        try {
            $ollamaUrl = "https://ollama.com/download/OllamaSetup.exe"
            $ollamaInstaller = "$env:TEMP\OllamaSetup.exe"
            Invoke-WebRequest -Uri $ollamaUrl -OutFile $ollamaInstaller
            Print-Info "Installing Ollama..."
            Start-Process $ollamaInstaller -Wait
            Refresh-Path
            Print-Ok "Ollama installed"
        } catch {
            Print-Fail "Failed to install Ollama: $_"
            Print-Info "Download manually: https://ollama.com"
        }
    } else {
        Print-Ok "Ollama found"
    }

    # Ensure Ollama service is running
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5 -ErrorAction Stop
        Print-Ok "Ollama service running"
    } catch {
        Print-Info "Starting Ollama service..."
        Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
        $waited = 0
        while ($waited -lt 30) {
            Start-Sleep -Seconds 2
            $waited += 2
            try {
                $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 3 -ErrorAction Stop
                Print-Ok "Ollama service started"
                break
            } catch { }
        }
        if ($waited -ge 30) {
            Print-Warn "Ollama failed to start within 30 seconds"
            Print-Info "Try manually: ollama serve"
        }
    }

    Step-Done "step_04"
}

# ═══════════════════════════════════════════════════════════════
# Step 5: AI Models
# ═══════════════════════════════════════════════════════════════
function Step-05-AIModels {
    if (Is-StepDone "step_05") { Print-Step 5 "AI Models [OK] (cached)"; return }
    Print-Step 5 "Downloading AI models"
    Print-Info "This may take 5-10 minutes on first install (~10 GB total)"

    # LLM model
    $models = ollama list 2>$null
    if ($models -match $LLM_MODEL) {
        Print-Ok "LLM model ($LLM_MODEL) already downloaded"
    } else {
        Print-Info "Pulling $LLM_MODEL..."
        try {
            Start-Process ollama -ArgumentList "pull $LLM_MODEL" -Wait -NoNewWindow
            Print-Ok "$LLM_MODEL downloaded"
        } catch {
            Print-Warn "Failed to pull $LLM_MODEL. Run manually: ollama pull $LLM_MODEL"
        }
    }

    # Embedding model
    if ($models -match $EMBEDDING_MODEL) {
        Print-Ok "Embedding model ($EMBEDDING_MODEL) already downloaded"
    } else {
        Print-Info "Pulling $EMBEDDING_MODEL..."
        try {
            Start-Process ollama -ArgumentList "pull $EMBEDDING_MODEL" -Wait -NoNewWindow
            Print-Ok "$EMBEDDING_MODEL downloaded"
        } catch {
            Print-Warn "Failed to pull $EMBEDDING_MODEL. Run manually: ollama pull $EMBEDDING_MODEL"
        }
    }

    Step-Done "step_05"
}

# ═══════════════════════════════════════════════════════════════
# Step 6: Amazon Toolbox + MCP Tools
# ═══════════════════════════════════════════════════════════════
function Step-06-MCPTooling {
    if (Is-StepDone "step_06") { Print-Step 6 "MCP Tooling [OK] (cached)"; return }
    Print-Step 6 "Checking Amazon MCP tools"
    Print-Info "MCP tools enable Phonetool, code.amazon.com, Taskei, Quip, and Slack"

    $toolboxExe = "$TOOLBOX_BIN\toolbox.exe"
    $mcpOk = $true

    # --- Install Toolbox if not present ---
    if (-not (Test-Path $toolboxExe)) {
        Print-Warn "Amazon Toolbox not found. Installing..."
        Print-Info "Requires VPN + Midway authentication"
        try {
            Invoke-WebRequest -useb https://toolbox.a2z.com/install.ps1 | Invoke-Expression
            Refresh-Path
            if (Test-Path $toolboxExe) {
                $tbVer = & $toolboxExe --version 2>&1
                Print-Ok "Toolbox installed ($tbVer)"
            } else {
                Print-Warn "Toolbox install completed but binary not found"
                Print-Info "You may need to restart terminal and re-run"
                $mcpOk = $false
            }
        } catch {
            Print-Warn "Failed to install Toolbox: $_"
            Print-Info "Manual install:"
            Print-Info "  1. Connect to VPN + authenticate with Midway"
            Print-Info "  2. Run: iwr -useb https://toolbox.a2z.com/install.ps1 | iex"
            Print-Info "  3. Restart terminal and re-run this installer"
            $mcpOk = $false
        }
    } else {
        $tbVer = & $toolboxExe --version 2>&1
        Print-Ok "Toolbox installed ($tbVer)"
    }

    # --- Install MCP tools via Toolbox ---
    $script:MCP_BUILDER_PATH = ""
    $script:MCP_AMZN_PATH = ""
    $script:MCP_SLACK_PATH = ""

    if (Test-Path $toolboxExe) {
        $mcpTools = @(
            @{ Name = "builder-mcp"; Desc = "Phonetool, code.amazon.com, Taskei, Quip" },
            @{ Name = "amzn-mcp";    Desc = "Amazon internal MCP server" },
            @{ Name = "slack-mcp";   Desc = "Slack messaging integration" },
            @{ Name = "mcp-registry"; Desc = "MCP tool registry" }
        )

        foreach ($tool in $mcpTools) {
            $toolExe = "$TOOLBOX_BIN\$($tool.Name).exe"
            if (Test-Path $toolExe) {
                Print-Ok "$($tool.Name) already installed"
            } else {
                Print-Info "Installing $($tool.Name) ($($tool.Desc))..."
                try {
                    & $toolboxExe install $tool.Name 2>&1 | Out-Null
                    if (Test-Path $toolExe) {
                        Print-Ok "$($tool.Name) installed"
                    } else {
                        Print-Warn "$($tool.Name) install completed but binary not found"
                        $mcpOk = $false
                    }
                } catch {
                    Print-Warn "Failed to install $($tool.Name): $_"
                    Print-Info "Install later: toolbox install $($tool.Name)"
                    $mcpOk = $false
                }
            }
        }

        # Save resolved paths
        if (Test-Path "$TOOLBOX_BIN\builder-mcp.exe") { $script:MCP_BUILDER_PATH = "$TOOLBOX_BIN\builder-mcp.exe" }
        if (Test-Path "$TOOLBOX_BIN\amzn-mcp.exe")    { $script:MCP_AMZN_PATH = "$TOOLBOX_BIN\amzn-mcp.exe" }
        if (Test-Path "$TOOLBOX_BIN\slack-mcp.exe")    { $script:MCP_SLACK_PATH = "$TOOLBOX_BIN\slack-mcp.exe" }
    } else {
        Print-Warn "Toolbox not available - skipping MCP tool installation"
        Print-Info "Team Health, Code Metrics, Ticket Health, and Slack will not work"
        Print-Info "Install Toolbox later: iwr -useb https://toolbox.a2z.com/install.ps1 | iex"
        $mcpOk = $false
    }

    if (-not $mcpOk) {
        Print-Warn "Some MCP tools missing - features requiring VPN + Midway may not work"
        Print-Info "You can set them up later from Settings"
    }

    Step-Done "step_06"
}

# ═══════════════════════════════════════════════════════════════
# Step 7: Install App (npm install + native modules)
# ═══════════════════════════════════════════════════════════════
function Step-07-InstallApp {
    if (Is-StepDone "step_07") { Print-Step 7 "Install App [OK] (cached)"; return }
    Print-Step 7 "Installing InGen"

    Set-Location $INSTALL_DIR

    # Install all JS dependencies first (skip native builds to avoid gyp failures blocking everything)
    Print-Info "Installing dependencies (this may take 1-2 minutes)..."
    npm install --ignore-scripts 2>&1 | Select-Object -Last 5

    # Now rebuild native modules separately (failures here are non-blocking)
    Print-Info "Building native modules (sqlite3, hnswlib-node)..."
    try { npm rebuild sqlite3 2>&1 | Out-Null; Print-Ok "sqlite3 built" } catch { Print-Warn "sqlite3 build failed" }
    try { npm rebuild hnswlib-node 2>&1 | Out-Null; Print-Ok "hnswlib-node built" } catch { Print-Warn "hnswlib-node build failed (optional - needs Windows SDK)" }

    # Create data directory
    $dataDir = Join-Path $INSTALL_DIR "data"
    if (-not (Test-Path $dataDir)) {
        New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    }

    Print-Ok "InGen installed at $INSTALL_DIR"
    Step-Done "step_07"
}

# ═══════════════════════════════════════════════════════════════
# Step 8: Configure (interactive)
# ═══════════════════════════════════════════════════════════════
function Step-08-Configure {
    if (Is-StepDone "step_08") { Print-Step 8 "Configure [OK] (cached)"; return }
    Print-Step 8 "Configuring InGen"

    # --- .env.local ---
    if (-not (Test-Path $ENV_FILE)) {
        $authSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
        $envContent = @"
# InGen Configuration (auto-generated by installer)
LLM_MODEL=$LLM_MODEL
EMBEDDING_MODEL=$EMBEDDING_MODEL
EMBEDDING_DIMENSIONS=4096
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=$LLM_MODEL
AUTH_SECRET=$authSecret
NEXTAUTH_SECRET=$authSecret
LOG_LEVEL=INFO
MCP_ENABLED=true
"@
        [System.IO.File]::WriteAllText($ENV_FILE, $envContent, (New-Object System.Text.UTF8Encoding $false))
        Print-Ok "Created .env.local"
    } else {
        Print-Ok ".env.local already exists (preserved)"
    }

    # --- MCP Paths in settings.json ---
    if ($script:MCP_BUILDER_PATH) {
        Node-JsonSet $SETTINGS_FILE "mcpServers.builder-mcp.command" $script:MCP_BUILDER_PATH
        Print-Ok "builder-mcp path: $($script:MCP_BUILDER_PATH)"
    }
    if ($script:MCP_AMZN_PATH) {
        Node-JsonSet $SETTINGS_FILE "mcpServers.amzn-mcp.command" $script:MCP_AMZN_PATH
        Print-Ok "amzn-mcp path: $($script:MCP_AMZN_PATH)"
    }
    if ($script:MCP_SLACK_PATH) {
        Node-JsonSet $SETTINGS_FILE "mcpServers.slack-mcp.command" $script:MCP_SLACK_PATH
        Print-Ok "slack-mcp path: $($script:MCP_SLACK_PATH)"
    }

    # --- Amazon Alias ---
    Write-Host ""
    Write-Host "    Amazon Alias" -ForegroundColor White
    $currentUser = $env:USERNAME
    Write-Host ""
    $userAlias = Read-Host "    Enter your Amazon alias [$currentUser]"
    if ([string]::IsNullOrWhiteSpace($userAlias)) { $userAlias = $currentUser }
    Node-JsonSet $SETTINGS_FILE "phonetoolAlias" $userAlias
    Print-Ok "Alias: $userAlias"
    $script:INGEN_ALIAS = $userAlias

    # --- Quip Token ---
    Write-Host ""
    Write-Host "    Quip Integration (optional)" -ForegroundColor White
    Write-Host "    InGen reads Quip docs linked in emails for richer AI briefings." -ForegroundColor Gray
    Write-Host "    Get token at: https://quip-amazon.com/dev/token" -ForegroundColor Cyan
    Write-Host ""
    $quipToken = Read-Host "    Enter Quip API token (or Enter to skip)"
    if (-not [string]::IsNullOrWhiteSpace($quipToken)) {
        $mcpEnvDir = "$env:USERPROFILE\.amazon-internal-mcp-server"
        if (-not (Test-Path $mcpEnvDir)) { New-Item -ItemType Directory -Path $mcpEnvDir -Force | Out-Null }
        Set-Content -Path "$mcpEnvDir\.env" -Value "QUIP_API_TOKEN=$quipToken" -Encoding UTF8
        Node-JsonSet $SETTINGS_FILE "quip.enabled" "true"
        Print-Ok "Quip token saved"
    } else {
        Node-JsonSet $SETTINGS_FILE "quip.enabled" "false"
        Print-Info "Skipped - enable later in Settings"
    }

    # --- AWS Bedrock API Key ---
    Write-Host ""
    Write-Host "    AWS Bedrock API Key (optional)" -ForegroundColor White
    Write-Host "    Enables Claude Sonnet 4 for higher-quality AI reports on" -ForegroundColor Gray
    Write-Host "    Team Health, Code Metrics, Ticket Health, and WBR Prep." -ForegroundColor Gray
    Write-Host "    You can skip this and a default key will be used." -ForegroundColor Gray
    Write-Host ""
    $bedrockKey = Read-Host "    Enter Bedrock ABSK API Key (or Enter to use default)"
    if ([string]::IsNullOrWhiteSpace($bedrockKey)) { $bedrockKey = $DEFAULT_BEDROCK_KEY }
    # Append with explicit newline (WriteAllText doesn't add trailing newline)
    $bedrockLine = "`nAWS_BEARER_TOKEN_BEDROCK=$bedrockKey`n"
    [System.IO.File]::AppendAllText($ENV_FILE, $bedrockLine)
    Print-Ok "Bedrock API key configured"

    # --- SIM Goals Folder (WBR / Team Health) ---
    Write-Host ""
    Write-Host "    SIM Goals Folder - Team Health" -ForegroundColor White
    Write-Host "    InGen tracks your team's goals from a SIM/Taskei folder." -ForegroundColor Gray
    Write-Host "    Paste the Taskei URL that shows your goals, or press Enter for default." -ForegroundColor Gray
    Write-Host ""
    $simUrl = Read-Host "    Taskei/SIM goals URL (Enter for default)"
    if ([string]::IsNullOrWhiteSpace($simUrl)) {
        $simUrl = $DEFAULT_TASKEI_URL
        Print-Info "Using default Taskei URL"
    }

    # Parse roomId and folderId using Node.js
    $parseScript = @"
const input = process.argv[1] || '';
let roomId = '', folderId = '';
const roomMatch = input.match(/rooms\/([0-9a-f-]{36})/i);
if (roomMatch) roomId = roomMatch[1];
const folderQs = input.match(/folder(?:%3A|:)([0-9a-f-]{36})/i);
if (folderQs) folderId = folderQs[1];
if (!folderId) { const fp = input.match(/folders\/([0-9a-f-]{36})/i); if (fp) folderId = fp[1]; }
if (!folderId && !roomId) { const raw = input.match(/^([0-9a-f-]{36})$/i); if (raw) folderId = raw[1]; }
console.log(JSON.stringify({roomId, folderId}));
"@
    $parsed = node -e $parseScript -- "$simUrl" 2>$null | ConvertFrom-Json

    if ($parsed.folderId) {
        Node-JsonSet $SETTINGS_FILE "wbr.folderId" $parsed.folderId
        Print-Ok "SIM folder ID: $($parsed.folderId)"
    }
    if ($parsed.roomId) {
        Node-JsonSet $SETTINGS_FILE "wbr.roomId" $parsed.roomId
        Print-Ok "Taskei Room ID: $($parsed.roomId)"
    }

    Write-Host ""
    $wbrTitle = Read-Host "    WBR dashboard title (Enter for default)"
    if (-not [string]::IsNullOrWhiteSpace($wbrTitle)) {
        Node-JsonSet $SETTINGS_FILE "wbr.title" $wbrTitle
        Print-Ok "WBR title: $wbrTitle"
    }

    Print-Ok "Configuration complete"
    Step-Done "step_08"
}

# ═══════════════════════════════════════════════════════════════
# Step 9: Org Tree
# ═══════════════════════════════════════════════════════════════
function Step-09-OrgTree {
    if (Is-StepDone "step_09") { Print-Step 9 "Org Tree [OK] (cached)"; return }
    Print-Step 9 "Fetching org tree"

    $alias = if ($script:INGEN_ALIAS) { $script:INGEN_ALIAS } else { $env:USERNAME }
    Print-Info "Fetching org hierarchy for '$alias' from Phonetool..."
    Print-Info "This may take 30-60 seconds (requires VPN + Midway)"

    Set-Location $INSTALL_DIR

    # First verify builder-mcp is accessible
    $builderMcpExe = "$TOOLBOX_BIN\builder-mcp.exe"
    if (-not (Test-Path $builderMcpExe)) {
        Print-Warn "builder-mcp not found - org tree fetch requires builder-mcp"
        Print-Info "Install: toolbox install builder-mcp"
        Print-Info "Then fetch from Settings > Team Settings > Fetch Team"
        Step-Done "step_09"
        return
    }

    $orgScript = @"
const orgStore = require('./services/org-store');
(async () => {
    try {
        const count = await orgStore.populateFromPhoneTool('$alias');
        console.log(JSON.stringify({ok:true,count:count}));
    } catch(e) {
        console.log(JSON.stringify({ok:false,error:e.message,stack:e.stack?e.stack.split('\n')[1]:''}));
    }
    process.exit(0);
})();
"@
    try {
        $rawOutput = node -e $orgScript 2>&1
        # Find the JSON line in output (skip any log lines)
        $jsonLine = ($rawOutput | Where-Object { $_ -match '^\{' }) | Select-Object -Last 1
        if ($jsonLine) {
            $orgResult = $jsonLine | ConvertFrom-Json
            if ($orgResult.ok -and $orgResult.count -gt 0) {
                Print-Ok "Org tree saved: $($orgResult.count) people (data/org.db)"
            } else {
                $errMsg = if ($orgResult.error) { $orgResult.error } else { "Unknown error" }
                Print-Warn "Could not fetch org tree: $errMsg"
                if ($errMsg -match "MCP|builder-mcp|connect") {
                    Print-Info "Ensure VPN is connected and Midway is authenticated"
                }
                Print-Info "Fetch later from Settings > Team Settings > Fetch Team"
            }
        } else {
            Print-Warn "Could not fetch org tree (no response)"
            Print-Info "Ensure VPN is connected and Midway is authenticated"
            Print-Info "Fetch later from Settings > Team Settings > Fetch Team"
        }
    } catch {
        Print-Warn "Could not fetch org tree: $_"
        Print-Info "Fetch later from Settings > Team Settings > Fetch Team"
    }

    Step-Done "step_09"
}

# ═══════════════════════════════════════════════════════════════
# Step 10: Python Dependencies (Outlook extraction)
# ═══════════════════════════════════════════════════════════════
function Step-10-PythonDeps {
    if (Is-StepDone "step_10") { Print-Step 10 "Python Deps [OK] (cached)"; return }
    Print-Step 10 "Installing Python dependencies for Outlook extraction"

    # Check for real Python (not Windows Store alias)
    $pyReal10 = $false
    try { $pyOut10 = python --version 2>&1; if ($pyOut10 -match 'Python \d') { $pyReal10 = $true } } catch {}
    if (-not $pyReal10) {
        Print-Warn "Python not found - skipping Outlook extraction dependencies"
        Print-Info "Download Python 3.12+ from: https://www.python.org/downloads/"
        Step-Done "step_10"
        return
    }

    # plyvel-ci
    try {
        pip install plyvel-ci 2>&1 | Out-Null
        Print-Ok "plyvel-ci installed"
    } catch {
        Print-Warn "plyvel-ci install failed (non-critical)"
    }

    # ccl_chromium_reader
    try {
        pip install "git+https://github.com/cclgroupltd/ccl_chrome_indexeddb.git" 2>&1 | Out-Null
        Print-Ok "ccl_chromium_reader installed"
    } catch {
        Print-Warn "ccl_chromium_reader install failed"
        Print-Info "Install manually: pip install git+https://github.com/cclgroupltd/ccl_chrome_indexeddb.git"
    }

    # --- Run Outlook Extractor to fetch emails, conversations, and meetings ---
    Write-Host ""
    Print-Info "Extracting Outlook data (emails, conversations, meetings)..."
    $extractorScript = Join-Path $INSTALL_DIR "scripts\windows\outlook_extractor.py"
    if (Test-Path $extractorScript) {
        try {
            $extractResult = python $extractorScript 2>&1
            # Join output lines into single string for reliable regex matching
            $outputText = ($extractResult | Out-String)
            if ($outputText -match "Extraction complete") {
                Print-Ok "Outlook data extracted to data/outlook-cache.db"
                # Show counts if available
                if ($outputText -match "Emails:\s+(\d+)") { Print-Info "  Emails: $($Matches[1])" }
                if ($outputText -match "Meetings:\s+(\d+)") { Print-Info "  Meetings: $($Matches[1])" }
                if ($outputText -match "Conversations:\s+(\d+)") { Print-Info "  Conversations: $($Matches[1])" }
                if ($outputText -match "Contacts:\s+(\d+)") { Print-Info "  Contacts: $($Matches[1])" }
            } else {
                Print-Warn "Outlook extraction completed with warnings"
                $lastLines = ($extractResult | Select-Object -Last 3) -join "`n"
                if ($lastLines) { Print-Info $lastLines }
            }
        } catch {
            Print-Warn "Outlook extraction failed: $_"
            Print-Info "Run manually later: python scripts\windows\outlook_extractor.py"
        }
    } else {
        Print-Warn "Outlook extractor script not found"
    }

    Step-Done "step_10"
}

# ═══════════════════════════════════════════════════════════════
# Step 11: Verify Installation
# ═══════════════════════════════════════════════════════════════
function Step-11-Verify {
    if (Is-StepDone "step_11") { Print-Step 11 "Verify [OK] (cached)"; return }
    Print-Step 11 "Verifying installation"

    Set-Location $INSTALL_DIR

    # node_modules
    $nmDir = Join-Path $INSTALL_DIR "node_modules"
    if (Test-Path $nmDir) {
        Print-Ok "node_modules installed"
    } else {
        Print-Fail "node_modules missing - run: npm install"
    }

    # hnswlib-node native module
    $hnswCheck = node -e "try{require('hnswlib-node');console.log('ok')}catch{console.log('fail')}" 2>$null
    if ($hnswCheck -eq "ok") {
        Print-Ok "hnswlib-node native module"
    } else {
        Print-Info "Attempting hnswlib-node rebuild..."
        npm rebuild hnswlib-node 2>&1 | Out-Null
        $hnswCheck2 = node -e "try{require('hnswlib-node');console.log('ok')}catch{console.log('fail')}" 2>$null
        if ($hnswCheck2 -eq "ok") {
            Print-Ok "hnswlib-node rebuilt successfully"
        } else {
            Print-Warn "hnswlib-node not available - RAG features will be limited"
            Print-Info "Install Visual Studio Build Tools and run: npm rebuild hnswlib-node"
        }
    }

    # sqlite3 native module
    $sqliteCheck = node -e "try{require('sqlite3');console.log('ok')}catch{console.log('fail')}" 2>$null
    if ($sqliteCheck -eq "ok") {
        Print-Ok "sqlite3 native module"
    } else {
        Print-Info "Attempting sqlite3 rebuild..."
        npm rebuild sqlite3 2>&1 | Out-Null
        $sqliteCheck2 = node -e "try{require('sqlite3');console.log('ok')}catch{console.log('fail')}" 2>$null
        if ($sqliteCheck2 -eq "ok") {
            Print-Ok "sqlite3 rebuilt successfully"
        } else {
            Print-Warn "sqlite3 not available - metrics and issues may not work"
        }
    }

    # Run startup checks
    Print-Info "Running startup health checks..."
    try {
        $checkScript = @"
const { runAll } = require('./services/startup-checks');
runAll().then(r => {
    const passed = r.results.filter(x => x.ok).length;
    const total = r.results.length;
    console.log(JSON.stringify({passed, total, critical: r.hasCriticalFailure}));
}).catch(() => console.log('{"passed":0,"total":0,"critical":true}'));
"@
        $checkResult = node -e $checkScript 2>$null | ConvertFrom-Json
        if ($checkResult.critical) {
            Print-Warn "Some startup checks have critical issues"
        } else {
            Print-Ok "Startup checks: $($checkResult.passed)/$($checkResult.total) passed"
        }
    } catch {
        Print-Warn "Could not run startup checks"
    }

    # Config files
    if (Test-Path $SETTINGS_FILE) { Print-Ok "config/settings.json" } else { Print-Warn "config/settings.json missing" }
    $promptsFile = Join-Path $INSTALL_DIR "config\prompts.json"
    if (Test-Path $promptsFile) { Print-Ok "config/prompts.json" } else { Print-Warn "config/prompts.json missing" }
    if (Test-Path $ENV_FILE) { Print-Ok ".env.local" } else { Print-Warn ".env.local missing" }

    Step-Done "step_11"
}

# ═══════════════════════════════════════════════════════════════
# Step 12: Desktop Shortcut
# ═══════════════════════════════════════════════════════════════
function Step-12-DesktopShortcut {
    if (Is-StepDone "step_12") { Print-Step 10 "Desktop Shortcut [OK] (cached)"; return }
    Print-Step 10 "Creating Desktop shortcut"

    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktopPath "InGen.lnk"

    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = "cmd.exe"
        $shortcut.Arguments = "/c cd /d `"$INSTALL_DIR`" && node launcher.js"
        $shortcut.WorkingDirectory = $INSTALL_DIR
        $shortcut.Description = "InGen - AI Productivity Dashboard"
        $shortcut.Save()
        Print-Ok "Desktop shortcut: $shortcutPath"
    } catch {
        Print-Warn "Could not create desktop shortcut: $_"
        Print-Info "Launch manually: cd $INSTALL_DIR && node launcher.js"
    }

    # Also update start_windows.bat
    $batPath = Join-Path $INSTALL_DIR "start_windows.bat"
    $batContent = @"
@echo off
cd /d "%~dp0"
echo Starting InGen - AI Productivity Dashboard...
echo.

REM Ensure Ollama is running
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo Starting Ollama...
    start /min ollama serve
    timeout /t 3 /nobreak >nul
)

node launcher.js
pause
"@
    Set-Content -Path $batPath -Value $batContent -Encoding ASCII
    Print-Ok "start_windows.bat updated"

    Step-Done "step_12"
}

# ═══════════════════════════════════════════════════════════════
# Step 13: Post-Install Summary
# ═══════════════════════════════════════════════════════════════
function Step-13-PostInstall {
    Print-Step 11 "Installation complete!"

    Write-Host ""
    Write-Host "  ======================================================" -ForegroundColor Green
    Write-Host "    InGen installed successfully!" -ForegroundColor White
    Write-Host "  ======================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "    Quick Start:" -ForegroundColor White
    Write-Host "      * Double-click 'InGen' on your Desktop" -ForegroundColor Gray
    Write-Host "      * Or run: cd $INSTALL_DIR && node launcher.js" -ForegroundColor Cyan
    Write-Host "      * Then open: http://localhost:3000" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "    Manage:" -ForegroundColor White
    Write-Host "      Re-run installer: powershell scripts\windows\install-ingen.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "    Features requiring VPN + Midway:" -ForegroundColor White
    Write-Host "      * Team Health (WBR goals from Taskei)" -ForegroundColor Gray
    Write-Host "      * Code Metrics (CRs from code.amazon.com)" -ForegroundColor Gray
    Write-Host "      * Ticket Health (SIM-T resolver groups)" -ForegroundColor Gray
    Write-Host "      * Org tree / Phonetool" -ForegroundColor Gray
    Write-Host ""

    # Offer to start
    $startNow = Read-Host "    Start InGen now? [Y/n]"
    if ($startNow -ne "n" -and $startNow -ne "N") {
        Write-Host ""
        Write-Host "    Starting InGen..." -ForegroundColor Cyan
        Write-Host "    Dashboard will be at: http://localhost:3000" -ForegroundColor Cyan
        Write-Host ""
        Set-Location $INSTALL_DIR
        node launcher.js
    }
}

# ═══════════════════════════════════════════════════════════════
# Main Entry Point
# ═══════════════════════════════════════════════════════════════
function Main {
    Print-Header

    Step-01-SystemCheck       # 1/11
    Step-02-BuildTools        # 2/11
    Step-03-NodeJS            # 3/11
    # Ollama removed — Windows uses Bedrock for all AI
    Step-Done "step_04"       # Skip Ollama (mark as done for resume compat)
    Step-Done "step_05"       # Skip AI Models (mark as done for resume compat)
    Step-06-MCPTooling        # 4/11
    Step-07-InstallApp        # 5/11
    Step-08-Configure         # 6/11
    Step-09-OrgTree           # 7/11
    Step-10-PythonDeps        # 8/11
    Step-11-Verify            # 9/11
    Step-12-DesktopShortcut   # 10/11
    Step-13-PostInstall       # 11/11

    Clear-Progress
}

# Run
Main

# Stop logging
Stop-Transcript -ErrorAction SilentlyContinue | Out-Null


