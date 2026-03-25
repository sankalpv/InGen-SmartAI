#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║              InGen Installer for macOS (v2.1)                ║
# ║         Local AI-Powered Productivity Dashboard              ║
# ║                                                              ║
# ║  Features: Resume support, disk space check, MCP tooling,   ║
# ║  Node-based JSON config, post-install health verification    ║
# ╚══════════════════════════════════════════════════════════════╝

# Error handling: show context on failure instead of silently exiting
trap 'echo ""; echo -e "\033[0;31m❌ Install failed at line $LINENO: $BASH_COMMAND\033[0m"; echo -e "\033[0;36mℹ️  Re-run the installer to resume from where it left off.\033[0m"; exit 1' ERR
set -eE  # -E ensures ERR trap is inherited by functions

# ─── Configuration ───
INSTALL_DIR="$HOME/InGen"
REPO_URL="ssh://git.amazon.com/pkg/InGen-SmartAI"
DESKTOP_SHORTCUT="$HOME/Desktop/InGen.command"
LLM_MODEL="qwen3:latest"
EMBEDDING_MODEL="qwen3-embedding"
PROGRESS_FILE="$HOME/.ingen-install-progress"
TOTAL_STEPS=12

# ─── Colors ───
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; PURPLE='\033[0;35m'; CYAN='\033[0;36m'
NC='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'

# ─── Utility Functions ───

print_header() {
    echo ""
    echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║${NC}  ${BOLD}🧬 InGen — AI Productivity Dashboard Installer${NC}             ${PURPLE}║${NC}"
    echo -e "${PURPLE}║${NC}  ${CYAN}Local-first • Privacy-first • Zero cloud${NC}                    ${PURPLE}║${NC}"
    echo -e "${PURPLE}║${NC}  ${DIM}v2.1 — with resume support & MCP tooling${NC}                    ${PURPLE}║${NC}"
    echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    if [[ -f "$PROGRESS_FILE" ]]; then
        local completed
        completed=$(wc -l < "$PROGRESS_FILE" | tr -d ' ')
        echo -e "  ${YELLOW}⏩ Resuming installation (${completed} steps already completed)${NC}"
        echo -e "  ${DIM}Delete ${PROGRESS_FILE} to start fresh${NC}"
        echo ""
    fi
}

print_step() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  [$1/${TOTAL_STEPS}]${NC} ${BOLD}$2${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_ok()   { echo -e "  ${GREEN}✅ $1${NC}"; }
print_warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }
print_fail() { echo -e "  ${RED}❌ $1${NC}"; }
print_info() { echo -e "  ${CYAN}ℹ️  $1${NC}"; }

# Resume support: mark a step as done
step_done() {
    echo "$1" >> "$PROGRESS_FILE"
}

# Resume support: check if step was already completed
is_step_done() {
    [[ -f "$PROGRESS_FILE" ]] && grep -qx "$1" "$PROGRESS_FILE" 2>/dev/null
}

# Clean up progress file after successful install
clear_progress() {
    rm -f "$PROGRESS_FILE"
}

# Retry a command up to N times with delay (for flaky network operations)
retry_cmd() {
    local max_attempts="${1:-3}" delay="${2:-5}" attempt=1
    shift 2
    while [[ $attempt -le $max_attempts ]]; do
        if "$@"; then
            return 0
        fi
        if [[ $attempt -lt $max_attempts ]]; then
            print_warn "Attempt $attempt/$max_attempts failed. Retrying in ${delay}s..."
            sleep "$delay"
        fi
        attempt=$((attempt + 1))
    done
    return 1
}

# Set a key=value in .env.local, replacing if it already exists (prevents duplicates)
env_set() {
    local file="$1" key="$2" value="$3"
    if [[ -f "$file" ]] && grep -q "^${key}=" "$file" 2>/dev/null; then
        sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
    else
        echo "${key}=${value}" >> "$file"
    fi
}

# Edit JSON config using Node.js (no Python dependency)
node_json_set() {
    local file="$1" key="$2" value="$3"
    local result
    result=$(node -e "
const fs = require('fs');
const f = '$file';
const d = JSON.parse(fs.readFileSync(f, 'utf8'));
const keys = '$key'.split('.');
let obj = d;
for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]]) obj[keys[i]] = {};
    obj = obj[keys[i]];
}
try { obj[keys[keys.length-1]] = JSON.parse('$value'); }
catch { obj[keys[keys.length-1]] = '$value'; }
fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
console.log('OK');
" 2>&1) || true
    if [[ "$result" != "OK" ]]; then
        print_warn "Failed to set ${key} in $(basename "$file"): ${result}"
    fi
}

# ─── Step Functions ───

step_01_system_check() {
    if is_step_done "step_01"; then print_step 1 "System Check ✅ (cached)"; return; fi
    print_step 1 "Checking system requirements"

    # Must be macOS
    if [[ "$(uname)" != "Darwin" ]]; then
        print_fail "This installer is for macOS only."
        exit 1
    fi
    print_ok "macOS $(sw_vers -productVersion)"

    # Architecture
    ARCH=$(uname -m)
    if [[ "$ARCH" == "arm64" ]]; then
        print_ok "Apple Silicon (M-series)"
    else
        print_ok "Intel Mac"
    fi

    # Disk space check (~15 GB needed: 10 GB models + 3 GB node_modules + 2 GB buffer)
    local free_gb
    free_gb=$(df -g "$HOME" | awk 'NR==2 {print $4}')
    if [[ "$free_gb" -lt 15 ]]; then
        print_warn "Low disk space: ${free_gb} GB free (15 GB recommended)"
        print_info "AI models need ~10 GB + ~3 GB for dependencies"
        read -p "  Continue anyway? [y/N]: " DISK_CONTINUE
        if [[ "$DISK_CONTINUE" != "y" && "$DISK_CONTINUE" != "Y" ]]; then
            echo "  Install cancelled. Free up disk space and try again."
            exit 1
        fi
    else
        print_ok "Disk space: ${free_gb} GB free"
    fi

    # Check Outlook is installed
    if [[ -d "/Applications/Microsoft Outlook.app" ]]; then
        print_ok "Microsoft Outlook installed"
    else
        print_warn "Microsoft Outlook not found in /Applications"
        print_info "InGen reads local Outlook data. Install Outlook for full functionality."
    fi

    step_done "step_01"
}

step_02_xcode_tools() {
    if is_step_done "step_02"; then print_step 2 "Xcode CLI Tools ✅ (cached)"; return; fi
    print_step 2 "Checking build tools"

    if ! xcode-select -p &>/dev/null; then
        print_warn "Xcode Command Line Tools not found. Installing..."
        print_info "A system dialog may appear — click 'Install' and wait."
        xcode-select --install 2>/dev/null || true
        # Wait for installation (up to 10 minutes)
        local waited=0
        while ! xcode-select -p &>/dev/null; do
            sleep 10
            waited=$((waited + 10))
            printf "\r  \033[0;36mℹ️  Waiting for Xcode install... (%ds / 600s)\033[0m" "$waited"
            if [[ $waited -gt 600 ]]; then
                echo ""
                print_fail "Xcode CLI Tools install timed out. Please install manually and re-run."
                exit 1
            fi
        done
        echo ""
        print_ok "Xcode Command Line Tools installed"
    else
        print_ok "Xcode Command Line Tools found"
    fi

    # Python setuptools (needed by node-gyp for hnswlib-node)
    if python3 -c "import distutils" &>/dev/null 2>&1 || python3 -c "import setuptools" &>/dev/null 2>&1; then
        print_ok "Python build tools available"
    else
        print_info "Installing Python setuptools (needed for native modules)..."
        pip3 install setuptools --break-system-packages 2>/dev/null \
            || python3 -m pip install setuptools --break-system-packages 2>/dev/null \
            || brew install python-setuptools 2>/dev/null \
            || true
        if python3 -c "import setuptools" &>/dev/null 2>&1; then
            print_ok "Python setuptools installed"
        else
            print_warn "setuptools install failed — 'npm install' may fail on native modules (hnswlib-node, sqlite3)"
            print_info "Fix manually: pip3 install setuptools --break-system-packages"
            print_info "If that fails, try: brew install python-setuptools"
        fi
    fi

    step_done "step_02"
}

step_03_homebrew() {
    if is_step_done "step_03"; then print_step 3 "Homebrew ✅ (cached)"; return; fi
    print_step 3 "Checking Homebrew"

    if ! command -v brew &>/dev/null; then
        print_warn "Homebrew not found. Installing..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        # Add brew to PATH for Apple Silicon
        if [[ "$(uname -m)" == "arm64" ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
        fi
        print_ok "Homebrew installed"
    else
        print_ok "Homebrew $(brew --version | head -1 | awk '{print $2}')"
    fi

    step_done "step_03"
}

step_04_nodejs() {
    if is_step_done "step_04"; then print_step 4 "Node.js ✅ (cached)"; return; fi
    print_step 4 "Checking Node.js"

    local need_install=false

    if ! command -v node &>/dev/null; then
        need_install=true
        print_warn "Node.js not found"
    else
        local node_major
        node_major=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
        if [[ -z "$node_major" ]] || [[ "$node_major" -lt 20 ]]; then
            need_install=true
            print_warn "Node.js v${node_major:-??} is too old (need 20+)"
        fi
    fi

    if [[ "$need_install" == "true" ]]; then
        print_info "Installing Node.js via Homebrew..."
        brew install node 2>/dev/null || brew upgrade node 2>/dev/null || true
        brew link --overwrite node 2>/dev/null || true
        hash -r 2>/dev/null

        # Verify
        local node_major
        node_major=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
        if [[ -z "$node_major" ]] || [[ "$node_major" -lt 20 ]]; then
            print_fail "Node.js install failed. Current: $(node -v 2>/dev/null || echo 'not found')"
            echo ""
            print_info "Install manually: brew install node"
            print_info "Or download from: https://nodejs.org"
            print_info "Then re-run this installer."
            exit 1
        fi
    fi

    print_ok "Node.js $(node -v) / npm $(npm -v)"
    step_done "step_04"
}
step_05_ollama() {
    if is_step_done "step_05"; then print_step 5 "Ollama ✅ (cached)"; return; fi
    print_step 5 "Checking Ollama (local AI engine)"

    if ! command -v ollama &>/dev/null; then
        print_warn "Ollama not found. Installing..."
        brew install ollama
        print_ok "Ollama installed"
    else
        print_ok "Ollama found ($(ollama --version 2>/dev/null || echo 'unknown version'))"
    fi

    # Ensure Ollama service is running
    if ! curl -s http://127.0.0.1:11434/api/tags &>/dev/null; then
        # Check for port conflict before starting
        local port_user
        port_user=$(lsof -i :11434 -sTCP:LISTEN -t 2>/dev/null || true)
        if [[ -n "$port_user" ]]; then
            local port_cmd
            port_cmd=$(ps -p "$port_user" -o comm= 2>/dev/null || echo "unknown")
            print_warn "Port 11434 is in use by '$port_cmd' (PID $port_user)"
            print_info "Kill it first: kill $port_user"
            print_info "Then re-run the installer."
            exit 1
        fi

        print_info "Starting Ollama service..."
        ollama serve &>/dev/null &
        # Wait up to 30 seconds for it to come up
        local waited=0
        while ! curl -s http://127.0.0.1:11434/api/tags &>/dev/null; do
            sleep 2
            waited=$((waited + 2))
            if [[ $waited -gt 30 ]]; then
                print_fail "Ollama failed to start within 30 seconds"
                print_info "Try manually: ollama serve"
                print_info "Then re-run this installer."
                exit 1
            fi
        done
        print_ok "Ollama service started"
    else
        print_ok "Ollama service running"
    fi

    step_done "step_05"
}

step_06_ai_models() {
    if is_step_done "step_06"; then print_step 6 "AI Models ✅ (cached)"; return; fi
    print_step 6 "Downloading AI models"
    print_info "This may take 5-10 minutes on first install (~10 GB total)"

    # LLM model
    if ollama list 2>/dev/null | grep -iq "$LLM_MODEL"; then
        print_ok "LLM model ($LLM_MODEL) already downloaded"
    else
        echo ""
        print_info "Pulling $LLM_MODEL (~5.2 GB)..."
        retry_cmd 3 10 ollama pull "$LLM_MODEL" || {
            print_fail "Failed to pull $LLM_MODEL after 3 attempts"
            print_info "Check your network and retry: ollama pull $LLM_MODEL"
            exit 1
        }
        print_ok "$LLM_MODEL downloaded"
    fi

    # Embedding model
    if ollama list 2>/dev/null | grep -iq "$EMBEDDING_MODEL"; then
        print_ok "Embedding model ($EMBEDDING_MODEL) already downloaded"
    else
        echo ""
        print_info "Pulling $EMBEDDING_MODEL (~4.7 GB)..."
        retry_cmd 3 10 ollama pull "$EMBEDDING_MODEL" || {
            print_fail "Failed to pull $EMBEDDING_MODEL after 3 attempts"
            print_info "Check your network and retry: ollama pull $EMBEDDING_MODEL"
            exit 1
        }
        print_ok "$EMBEDDING_MODEL downloaded"
    fi

    step_done "step_06"
}

step_07_mcp_tooling() {
    if is_step_done "step_07"; then print_step 7 "MCP Tooling ✅ (cached)"; return; fi
    print_step 7 "Checking Amazon MCP tools"
    print_info "MCP tools enable Phonetool, code.amazon.com, Taskei, and Quip"

    local mcp_ok=true

    # ── Midway Authentication ──
    echo ""
    echo -e "  ${BOLD}🔐 Midway Authentication${NC}"
    if command -v mwinit &>/dev/null; then
        if mwinit -o 2>/dev/null; then
            print_ok "Midway authenticated"
        else
            print_info "Midway session expired. Authenticating..."
            if mwinit; then
                print_ok "Midway authentication successful"
            else
                print_warn "Midway authentication failed"
                print_info "MCP tools require Midway. Run 'mwinit' manually later."
                print_info "Skipping MCP tooling setup..."
                export MCP_AMZN_PATH="" MCP_BUILDER_PATH=""
                step_done "step_07"
                return
            fi
        fi
    else
        print_warn "mwinit not found — cannot verify Midway auth"
        print_info "Install mwinit or authenticate via browser before using MCP features"
    fi

    # ── Builder Toolbox ──
    echo ""
    echo -e "  ${BOLD}🧰 Builder Toolbox${NC}"
    if command -v toolbox &>/dev/null || [[ -x "$HOME/.toolbox/bin/toolbox" ]]; then
        print_ok "Amazon Toolbox installed"
    else
        print_info "Amazon Toolbox not found. Installing via Builder Toolbox bootstrap..."
        local bootstrap_ok=false
        if curl -sS -X POST \
            --data '{"os":"osx"}' \
            -H "Authorization: $(curl -sL \
                --cookie "$HOME/.midway/cookie" \
                --cookie-jar "$HOME/.midway/cookie" \
                "https://midway-auth.amazon.com/SSO?client_id=https://us-east-1.prod.release-service.toolbox.builder-tools.aws.dev&response_type=id_token&nonce=$RANDOM&redirect_uri=https://us-east-1.prod.release-service.toolbox.builder-tools.aws.dev:443")" \
            https://us-east-1.prod.release-service.toolbox.builder-tools.aws.dev/v1/bootstrap \
            -o ~/toolbox-bootstrap.sh 2>/dev/null && [[ -s ~/toolbox-bootstrap.sh ]]; then

            print_info "Running Toolbox installer..."
            if bash ~/toolbox-bootstrap.sh 2>&1 | tail -5; then
                rm -f ~/toolbox-bootstrap.sh
                source "$HOME/.$(basename "$SHELL")rc" 2>/dev/null || true
                export PATH="$HOME/.toolbox/bin:$PATH"
                if command -v toolbox &>/dev/null || [[ -x "$HOME/.toolbox/bin/toolbox" ]]; then
                    print_ok "Amazon Toolbox installed successfully"
                    bootstrap_ok=true
                fi
            else
                rm -f ~/toolbox-bootstrap.sh
            fi
        fi

        if [[ "$bootstrap_ok" != "true" ]]; then
            print_warn "Toolbox auto-install failed"
            print_info "Install manually: visit https://w.amazon.com/bin/view/AmazonToolbox"
            mcp_ok=false
        fi
    fi

    # ── MCP Binaries (only if Toolbox is available) ──
    if command -v toolbox &>/dev/null || [[ -x "$HOME/.toolbox/bin/toolbox" ]]; then
        local TOOLBOX_CMD
        TOOLBOX_CMD=$(command -v toolbox 2>/dev/null || echo "$HOME/.toolbox/bin/toolbox")

        # amzn-mcp (installed directly via toolbox)
        if command -v amzn-mcp &>/dev/null || [[ -x "$HOME/.toolbox/bin/amzn-mcp" ]]; then
            print_ok "amzn-mcp available"
        else
            print_info "Installing amzn-mcp via toolbox..."
            "$TOOLBOX_CMD" install amzn-mcp 2>/dev/null && print_ok "amzn-mcp installed" || { print_warn "amzn-mcp install failed"; mcp_ok=false; }
        fi

        # AIM CLI (needed for builder-mcp and slack-mcp)
        if ! command -v aim &>/dev/null && ! [[ -x "$HOME/.toolbox/bin/aim" ]]; then
            print_info "Installing AIM CLI via toolbox..."
            "$TOOLBOX_CMD" install aim 2>/dev/null && print_ok "AIM CLI installed" || print_warn "AIM CLI install failed"
        fi
        local AIM_CMD
        AIM_CMD=$(command -v aim 2>/dev/null || echo "$HOME/.toolbox/bin/aim")

        # builder-mcp (installed via AIM)
        local has_builder_mcp=false
        if command -v builder-mcp &>/dev/null || [[ -x "$HOME/.toolbox/bin/builder-mcp" ]]; then
            has_builder_mcp=true
        elif [[ -x "$AIM_CMD" ]] && "$AIM_CMD" mcp list --installed 2>/dev/null | grep -q "builder-mcp"; then
            has_builder_mcp=true
        fi

        if [[ "$has_builder_mcp" == "true" ]]; then
            print_ok "builder-mcp available"
        else
            if [[ -x "$AIM_CMD" ]] || command -v aim &>/dev/null; then
                print_info "Installing builder-mcp via AIM..."
                "$AIM_CMD" mcp install builder-mcp 2>/dev/null && print_ok "builder-mcp installed" || { print_warn "builder-mcp install failed"; mcp_ok=false; }
            else
                print_warn "AIM not available — install builder-mcp later: toolbox install aim && aim mcp install builder-mcp"
                mcp_ok=false
            fi
        fi

        # Slack MCP via AIM (optional)
        local has_slack_mcp=false
        if command -v slack-mcp &>/dev/null || [[ -x "$HOME/.toolbox/bin/slack-mcp" ]]; then
            has_slack_mcp=true
        elif command -v aim &>/dev/null || [[ -x "$HOME/.toolbox/bin/aim" ]]; then
            # Check if workplace-chat-mcp is installed via AIM
            if aim mcp list --installed 2>/dev/null | grep -q "workplace-chat"; then
                has_slack_mcp=true
            fi
        fi

        if [[ "$has_slack_mcp" == "true" ]]; then
            print_ok "Slack MCP available"
        else
            echo ""
            read -p "$(echo -e '\033[0;36m  Would you like to enable Slack integration? [y/N]: \033[0m')" slack_choice
            if [[ "$slack_choice" =~ ^[Yy] ]]; then
                if [[ -x "$AIM_CMD" ]] || command -v aim &>/dev/null; then
                    print_info "Installing Slack MCP via AIM..."
                    "$AIM_CMD" mcp install workplace-chat-mcp 2>/dev/null \
                        && print_ok "Slack MCP installed — enables Send to Slack, message search" \
                        || print_warn "Slack MCP install failed (install later: aim mcp install workplace-chat-mcp)"
                else
                    print_warn "AIM not available — install Slack MCP later: toolbox install aim && aim mcp install workplace-chat-mcp"
                fi
            else
                print_info "Skipping Slack integration (install later: aim mcp install workplace-chat-mcp)"
            fi
        fi
    else
        print_warn "Toolbox not available — skipping MCP binary installation"
        print_info "Team Health, Code Metrics, and Ticket Health will not work without MCP tools"
        mcp_ok=false
    fi

    if [[ "$mcp_ok" == "false" ]]; then
        print_warn "Some MCP tools missing — Team Health, Code Metrics, and Ticket Health may not work"
        print_info "These features require VPN + Midway auth. You can set them up later."
    fi

    # Update MCP paths in settings.json if tools are found
    local amzn_path="" builder_path=""
    if [[ -x "$HOME/.toolbox/bin/amzn-mcp" ]]; then
        amzn_path="$HOME/.toolbox/bin/amzn-mcp"
    elif command -v amzn-mcp &>/dev/null; then
        amzn_path="$(which amzn-mcp)"
    fi
    if [[ -x "$HOME/.toolbox/bin/builder-mcp" ]]; then
        builder_path="$HOME/.toolbox/bin/builder-mcp"
    elif command -v builder-mcp &>/dev/null; then
        builder_path="$(which builder-mcp)"
    fi

    # Save paths for step_09 to use
    export MCP_AMZN_PATH="$amzn_path"
    export MCP_BUILDER_PATH="$builder_path"

    step_done "step_07"
}
step_08_install_app() {
    if is_step_done "step_08"; then print_step 8 "Install App ✅ (cached)"; return; fi
    print_step 8 "Installing InGen"

    # Detect source: running from inside extracted archive vs fresh install
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

    if [[ -f "$SOURCE_DIR/package.json" ]] && grep -q "smartai" "$SOURCE_DIR/package.json" 2>/dev/null; then
        # Running from inside the extracted zip/tar — copy to install dir
        if [[ "$SOURCE_DIR" != "$INSTALL_DIR" ]]; then
            if [[ -d "$INSTALL_DIR" ]]; then
                print_info "Existing installation found. Preserving user data..."
                # Backup user data
                local backup_dir="/tmp/ingen-backup-$$"
                mkdir -p "$backup_dir"
                [[ -d "$INSTALL_DIR/data" ]] && cp -r "$INSTALL_DIR/data" "$backup_dir/data" 2>/dev/null || true
                [[ -f "$INSTALL_DIR/.env.local" ]] && cp "$INSTALL_DIR/.env.local" "$backup_dir/.env.local" 2>/dev/null || true
                [[ -f "$INSTALL_DIR/sync_state.json" ]] && cp "$INSTALL_DIR/sync_state.json" "$backup_dir/sync_state.json" 2>/dev/null || true
                [[ -f "$INSTALL_DIR/config/settings.json" ]] && cp "$INSTALL_DIR/config/settings.json" "$backup_dir/settings.json" 2>/dev/null || true
                rm -rf "$INSTALL_DIR"
            fi

            print_info "Copying to $INSTALL_DIR..."
            cp -r "$SOURCE_DIR" "$INSTALL_DIR"

            # Restore user data
            if [[ -d "/tmp/ingen-backup-$$" ]]; then
                [[ -d "/tmp/ingen-backup-$$/data" ]] && cp -r "/tmp/ingen-backup-$$/data" "$INSTALL_DIR/data"
                [[ -f "/tmp/ingen-backup-$$/.env.local" ]] && cp "/tmp/ingen-backup-$$/.env.local" "$INSTALL_DIR/.env.local"
                [[ -f "/tmp/ingen-backup-$$/sync_state.json" ]] && cp "/tmp/ingen-backup-$$/sync_state.json" "$INSTALL_DIR/sync_state.json"
                [[ -f "/tmp/ingen-backup-$$/settings.json" ]] && cp "/tmp/ingen-backup-$$/settings.json" "$INSTALL_DIR/config/settings.json"
                rm -rf "/tmp/ingen-backup-$$"
                print_ok "User data preserved"
            fi
        else
            print_ok "Already at $INSTALL_DIR"
        fi
        cd "$INSTALL_DIR"
    elif [[ -d "$INSTALL_DIR" ]]; then
        print_info "Existing installation found at $INSTALL_DIR"
        cd "$INSTALL_DIR"
        if [[ -d ".git" ]]; then
            print_info "Pulling latest code..."
            git pull --rebase 2>/dev/null || true
        fi
    else
        # No source, no existing — git clone
        if command -v git &>/dev/null && [[ -n "$REPO_URL" ]]; then
            # Pre-check SSH connectivity to avoid cryptic errors
            print_info "Checking SSH connectivity to git.amazon.com..."
            if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -T git.amazon.com 2>&1 | grep -qi "success\|welcome\|authenticated"; then
                print_warn "Cannot reach git.amazon.com via SSH"
                print_info "Make sure you are on VPN and have run 'midway' for auth"
                print_info "Also verify SSH keys: ssh -T git.amazon.com"
                print_fail "Fix SSH connectivity and re-run the installer."
                exit 1
            fi
            print_info "Cloning from $REPO_URL..."
            git clone "$REPO_URL" "$INSTALL_DIR"
            cd "$INSTALL_DIR"
        else
            print_fail "No InGen source found."
            print_info "Download InGen.tar.gz first, then run: bash scripts/install-ingen.sh"
            exit 1
        fi
    fi

    # Install Node.js dependencies
    print_info "Installing dependencies (this may take 1-2 minutes)..."
    if ! retry_cmd 2 5 npm install 2>&1 | tail -10; then
        print_fail "npm install failed"
        print_info "Common fixes:"
        print_info "  1. Ensure Python setuptools is installed: pip3 install setuptools --break-system-packages"
        print_info "  2. Ensure Xcode CLI Tools are up to date: xcode-select --install"
        print_info "  3. Check npm registry access: npm ping"
        exit 1
    fi

    # Rebuild native modules
    print_info "Building native modules (hnswlib-node, sqlite3)..."
    npm rebuild 2>&1 | tail -3 || true

    # Create data directory
    mkdir -p "$INSTALL_DIR/data"

    print_ok "InGen installed at $INSTALL_DIR"
    step_done "step_08"
}

step_09_configure() {
    if is_step_done "step_09"; then print_step 9 "Configure ✅ (cached)"; return; fi
    print_step 9 "Configuring InGen"

    local SETTINGS="$INSTALL_DIR/config/settings.json"

    # ── .env.local ──
    if [[ ! -f "$INSTALL_DIR/.env.local" ]]; then
        local AUTH_SECRET
        AUTH_SECRET=$(openssl rand -base64 32)
        cat > "$INSTALL_DIR/.env.local" << EOF
# InGen Configuration (auto-generated by installer)
LLM_MODEL=$LLM_MODEL
EMBEDDING_MODEL=$EMBEDDING_MODEL
EMBEDDING_DIMENSIONS=4096
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=$LLM_MODEL
AUTH_SECRET=$AUTH_SECRET
NEXTAUTH_SECRET=$AUTH_SECRET
LOG_LEVEL=INFO
MCP_ENABLED=true
EOF
        print_ok "Created .env.local"
    else
        print_ok ".env.local already exists (preserved)"
    fi

    # ── MCP Paths ──
    if [[ -n "$MCP_AMZN_PATH" ]]; then
        node_json_set "$SETTINGS" "mcpServers.amzn-mcp.command" "\"$MCP_AMZN_PATH\""
        print_ok "amzn-mcp path: $MCP_AMZN_PATH"
    fi
    if [[ -n "$MCP_BUILDER_PATH" ]]; then
        node_json_set "$SETTINGS" "mcpServers.builder-mcp.command" "\"$MCP_BUILDER_PATH\""
        print_ok "builder-mcp path: $MCP_BUILDER_PATH"
    fi

    # ── Calendar Selection ──
    echo ""
    echo -e "  ${BOLD}📅 Calendar Selection${NC}"

    local CALENDAR_JSON=""
    # Check if Outlook is running before trying to enumerate calendars
    if ! pgrep -x "Microsoft Outlook" >/dev/null 2>&1; then
        print_warn "Microsoft Outlook is not running"
        print_info "Start Outlook, then set calendar later in Settings or config/settings.json"
    else
        CALENDAR_JSON=$(timeout 30 node -e "
const {getCalendarList} = require('./services/outlook-local');
getCalendarList().then(cals => {
    console.log(JSON.stringify(cals && cals.length > 0 ? cals : []));
}).catch(() => console.log('[]'));
" 2>/dev/null || echo "[]")

    if [[ -n "$CALENDAR_JSON" ]] && [[ "$CALENDAR_JSON" != "[]" ]]; then
        local cal_count
        cal_count=$(echo "$CALENDAR_JSON" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
console.log(d.length);
" 2>/dev/null || echo "0")

        if [[ "$cal_count" -gt "0" ]]; then
            echo ""
            echo "  Available Outlook calendars:"
            echo "$CALENDAR_JSON" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
d.forEach((c,i) => {
    const def = c.isDefault ? ' ← default' : '';
    const unread = c.unread !== undefined ? \` (\${c.unread} unread emails)\` : '';
    console.log('    ' + (i+1) + '. ' + (c.name||'Unknown') + ' (ID: ' + c.id + ')' + unread + def);
});
" 2>/dev/null
            echo ""
            read -p "  Enter number (1-${cal_count}) or calendar ID [1]: " CAL_CHOICE
            CAL_CHOICE=${CAL_CHOICE:-1}

            local selected_id
            selected_id=$(echo "$CALENDAR_JSON" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
const c='$CAL_CHOICE';
const byId=d.find(x=>String(x.id)===c);
if(byId){console.log(byId.id)}
else{const i=parseInt(c)-1;console.log(i>=0&&i<d.length?d[i].id:d[0].id)}
" 2>/dev/null)

            if [[ -n "$selected_id" ]]; then
                node_json_set "$SETTINGS" "outlookCalendarId" "\"$selected_id\""
                print_ok "Calendar ID set to: $selected_id"
            fi
        else
            print_warn "No calendars detected (Outlook may not be running)"
            print_info "Set later in Settings or config/settings.json"
        fi
    else
        print_warn "Could not detect calendars (Outlook may need Automation permission)"
        print_info "Grant Terminal access: System Settings → Privacy → Automation → Terminal → Microsoft Outlook"
        print_info "Then set calendar later: ~/InGen/config/settings.json → outlookCalendarId"
    fi
    fi  # end Outlook running check

    # ── Phonetool Alias ──
    echo ""
    echo -e "  ${BOLD}👤 Amazon Alias${NC}"
    local CURRENT_USER
    CURRENT_USER=$(whoami)
    echo ""
    read -p "  Enter your Amazon alias [$CURRENT_USER]: " USER_ALIAS
    USER_ALIAS=${USER_ALIAS:-$CURRENT_USER}

    node_json_set "$SETTINGS" "phonetoolAlias" "\"$USER_ALIAS\""
    print_ok "Alias: $USER_ALIAS"
    export INGEN_ALIAS="$USER_ALIAS"

    # ── Quip Token ──
    echo ""
    echo -e "  ${BOLD}📄 Quip Integration (optional)${NC}"
    echo -e "  InGen reads Quip docs linked in emails for richer AI briefings."
    echo -e "  Get token at: ${CYAN}https://quip-amazon.com/dev/token${NC}"
    echo ""
    read -p "  Enter Quip API token (or Enter to skip): " QUIP_TOKEN

    if [[ -n "$QUIP_TOKEN" ]]; then
        mkdir -p "$HOME/.amazon-internal-mcp-server"
        echo "QUIP_API_TOKEN=$QUIP_TOKEN" > "$HOME/.amazon-internal-mcp-server/.env"
        node_json_set "$SETTINGS" "quip.enabled" "true"
        print_ok "Quip token saved"
    else
        node_json_set "$SETTINGS" "quip.enabled" "false"
        print_info "Skipped — enable later in Settings"
    fi

    # ── AWS Bedrock API Key (optional — enhances AI summaries on key pages) ──
    echo ""
    echo -e "  ${BOLD}🔑 AWS Bedrock API Key (optional)${NC}"
    echo -e "  Enables Claude Sonnet for enhanced AI summaries on Team Health,"
    echo -e "  Code Metrics, and Morning Briefing pages."
    echo -e "  Get your own ABSK key from: ${CYAN}Bedrock API Keys console${NC}"
    echo ""
    read -p "  Enter Bedrock ABSK API Key (or Enter for team default): " BEDROCK_KEY

    if [[ -z "$BEDROCK_KEY" ]]; then
        BEDROCK_KEY="ABSKQmVkcm9ja0FQSUtleS1obmNtLWF0LTcwOTkyOTk2Mjg0NDp3eExsbTFiaVNQTWZGZjlwdFNCUjlLKzlwbU9xUkxXOXE2OUMyMEZGWkhQUGVST014OHM1TEY0dFpadz0="
        print_ok "Using team default Bedrock API key"
    else
        print_ok "Custom Bedrock API key saved"
    fi
    env_set "$INSTALL_DIR/.env.local" "AWS_BEARER_TOKEN_BEDROCK" "$BEDROCK_KEY"

    # ── SIM Goals Folder (WBR / Team Health) ──
    echo ""
    echo -e "  ${BOLD}🎯 SIM Goals Folder — Team Health (optional)${NC}"
    echo -e "  InGen tracks your team's goals from a SIM/Taskei folder."
    echo -e "  Paste the Taskei URL that shows your goals."
    echo -e "  Example: ${CYAN}https://taskei.amazon.dev/rooms/.../tasks?f=folder%3A...${NC}"
    echo -e "  Or: ${CYAN}https://issues.amazon.com/folders/...${NC}"
    echo ""
    read -p "  Taskei/SIM goals URL (Enter to skip): " SIM_URL_INPUT

    if [[ -n "$SIM_URL_INPUT" ]]; then
        # Parse both roomId and folderId from the URL
        local PARSED_IDS
        PARSED_IDS=$(echo "$SIM_URL_INPUT" | node -e "
const input = require('fs').readFileSync('/dev/stdin','utf8').trim();
let roomId = '', folderId = '';
// Taskei URL: /rooms/{roomId}/tasks?f=folder%3A{folderId}...
const roomMatch = input.match(/rooms\/([0-9a-f-]{36})/i);
if (roomMatch) roomId = roomMatch[1];
// folder in query string: folder%3A{folderId} or folder:{folderId}
const folderQs = input.match(/folder(?:%3A|:)([0-9a-f-]{36})/i);
if (folderQs) folderId = folderQs[1];
// issues.amazon.com/folders/{folderId}
if (!folderId) { const folderPath = input.match(/folders\/([0-9a-f-]{36})/i); if (folderPath) folderId = folderPath[1]; }
// Raw UUID
if (!folderId && !roomId) { const raw = input.match(/^([0-9a-f-]{36})$/i); if (raw) folderId = raw[1]; }
console.log(JSON.stringify({roomId, folderId}));
" 2>/dev/null || echo '{"roomId":"","folderId":""}')

        local FOLDER_ID ROOM_ID
        FOLDER_ID=$(echo "$PARSED_IDS" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).folderId)" 2>/dev/null)
        ROOM_ID=$(echo "$PARSED_IDS" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).roomId)" 2>/dev/null)

        if [[ -n "$FOLDER_ID" ]]; then
            node_json_set "$SETTINGS" "wbr.folderId" "\"$FOLDER_ID\""
            print_ok "SIM folder ID: $FOLDER_ID"
        else
            print_warn "Could not parse folder ID from URL"
        fi

        if [[ -n "$ROOM_ID" ]]; then
            node_json_set "$SETTINGS" "wbr.roomId" "\"$ROOM_ID\""
            print_ok "Taskei Room ID: $ROOM_ID"
        else
            # Only ask separately if room wasn't in the URL
            echo ""
            echo -e "  Room ID not found in URL. Paste the Room ID or full Taskei URL:"
            read -p "  Taskei Room ID (Enter to skip): " ROOM_INPUT
            if [[ -n "$ROOM_INPUT" ]]; then
                ROOM_ID=$(echo "$ROOM_INPUT" | node -e "
const i=require('fs').readFileSync('/dev/stdin','utf8').trim();
const m=i.match(/rooms\/([0-9a-f-]{36})/i)||i.match(/^([0-9a-f-]{36})$/i);
console.log(m?m[1]:'');
" 2>/dev/null)
                if [[ -n "$ROOM_ID" ]]; then
                    node_json_set "$SETTINGS" "wbr.roomId" "\"$ROOM_ID\""
                    print_ok "Taskei Room ID: $ROOM_ID"
                fi
            fi
        fi

        # Ask for WBR title
        echo ""
        read -p "  WBR dashboard title (Enter for default): " WBR_TITLE
        if [[ -n "$WBR_TITLE" ]]; then
            node_json_set "$SETTINGS" "wbr.title" "\"$WBR_TITLE\""
            print_ok "WBR title: $WBR_TITLE"
        fi
    else
        print_info "Skipped — configure later in Settings → Team Goals"
    fi

    print_ok "Configuration complete"
    step_done "step_09"
}

step_10_org_tree() {
    if is_step_done "step_10"; then print_step 10 "Org Tree ✅ (cached)"; return; fi
    print_step 10 "Fetching org tree"

    local alias="${INGEN_ALIAS:-$(whoami)}"
    print_info "Fetching org hierarchy for '$alias' from Phonetool..."
    print_info "This may take 30-60 seconds (requires VPN + Midway)"

    cd "$INSTALL_DIR"
    local org_result
    org_result=$(timeout 120 node -e "
const orgStore = require('./services/org-store');
(async () => {
    try {
        const count = await orgStore.populateFromPhoneTool('$alias');
        console.log(JSON.stringify({ok:true,count}));
    } catch(e) {
        console.log(JSON.stringify({ok:false,error:e.message}));
    }
    process.exit(0);
})();
" 2>/dev/null || echo '{"ok":false,"error":"script failed"}')

    local org_ok org_count
    org_ok=$(echo "$org_result" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.ok?'true':'false')" 2>/dev/null || echo "false")
    org_count=$(echo "$org_result" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.count||0)" 2>/dev/null || echo "0")

    if [[ "$org_ok" == "true" && "$org_count" -gt "0" ]]; then
        print_ok "Org tree saved: $org_count people (data/org.db)"
    else
        print_warn "Could not fetch org tree (VPN/Midway may be needed)"
        print_info "You can fetch later from Settings → Team Settings → Fetch Team"
    fi

    step_done "step_10"
}
step_11_verify() {
    if is_step_done "step_11"; then print_step 11 "Verify ✅ (cached)"; return; fi
    print_step 11 "Verifying installation"

    cd "$INSTALL_DIR"
    local all_ok=true

    # node_modules
    if [[ -d "$INSTALL_DIR/node_modules" ]]; then
        print_ok "node_modules installed"
    else
        print_fail "node_modules missing — run: cd ~/InGen && npm install"
        all_ok=false
    fi

    # hnswlib-node native module
    if node -e "require('hnswlib-node')" 2>/dev/null; then
        print_ok "hnswlib-node native module"
    else
        print_warn "hnswlib-node not built — trying rebuild..."
        npm rebuild hnswlib-node 2>&1 | tail -3
        if node -e "require('hnswlib-node')" 2>/dev/null; then
            print_ok "hnswlib-node rebuilt successfully"
        else
            print_warn "hnswlib-node build failed — RAG features may be limited"
        fi
    fi

    # sqlite3 native module
    if node -e "require('sqlite3')" 2>/dev/null; then
        print_ok "sqlite3 native module"
    else
        print_warn "sqlite3 not built — trying rebuild..."
        npm rebuild sqlite3 2>&1 | tail -3
        if node -e "require('sqlite3')" 2>/dev/null; then
            print_ok "sqlite3 rebuilt successfully"
        else
            print_warn "sqlite3 build failed — metrics and issues may not work"
        fi
    fi

    # Run startup checks
    print_info "Running startup health checks..."
    node -e "
const { runAll } = require('./services/startup-checks');
runAll().then(r => {
    const passed = r.results.filter(x => x.ok).length;
    const total = r.results.length;
    console.log(JSON.stringify({passed, total, critical: r.hasCriticalFailure}));
}).catch(() => console.log('{\"passed\":0,\"total\":0,\"critical\":true}'));
" 2>/dev/null | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
if (d.critical) process.stdout.write('CRITICAL');
else process.stdout.write(d.passed + '/' + d.total);
" 2>/dev/null | read -r check_result || true

    if [[ "$check_result" == "CRITICAL" ]]; then
        print_warn "Some startup checks have critical issues (see above)"
    else
        print_ok "Startup checks: ${check_result:-OK}"
    fi

    # Config files
    [[ -f "$INSTALL_DIR/config/settings.json" ]] && print_ok "config/settings.json" || print_warn "config/settings.json missing"
    [[ -f "$INSTALL_DIR/config/prompts.json" ]] && print_ok "config/prompts.json" || print_warn "config/prompts.json missing"
    [[ -f "$INSTALL_DIR/.env.local" ]] && print_ok ".env.local" || print_warn ".env.local missing"

    step_done "step_11"
}

step_12_desktop_shortcut() {
    if is_step_done "step_12"; then print_step 12 "Desktop Shortcut ✅ (cached)"; return; fi
    print_step 12 "Creating Desktop shortcut"

    cat > "$DESKTOP_SHORTCUT" << LAUNCHER
#!/bin/bash
# InGen — AI Productivity Dashboard
cd "$INSTALL_DIR"

echo "🧬 Starting InGen..."
echo ""

# Ensure Ollama is running
if ! curl -s http://127.0.0.1:11434/api/tags &>/dev/null; then
    echo "Starting Ollama..."
    ollama serve &>/dev/null &
    sleep 3
fi

# Launch InGen
node launcher.js

# Keep terminal open on error
read -p "Press Enter to close..."
LAUNCHER

    chmod +x "$DESKTOP_SHORTCUT"
    print_ok "Desktop shortcut: ~/Desktop/InGen.command"

    step_done "step_12"
}

step_13_post_install() {
    print_step 13 "Installation complete!"

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}  ${BOLD}✨ InGen installed successfully!${NC}                            ${GREEN}║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BOLD}Quick Start:${NC}"
    echo -e "    • Double-click ${CYAN}InGen${NC} on your Desktop"
    echo -e "    • Or run: ${CYAN}cd ~/InGen && node launcher.js${NC}"
    echo -e "    • Then open: ${CYAN}http://localhost:3000${NC}"
    echo ""
    echo -e "  ${BOLD}Manage:${NC}"
    echo -e "    Update:    ${CYAN}~/InGen/scripts/update-ingen.sh${NC}"
    echo -e "    Uninstall: ${CYAN}~/InGen/scripts/uninstall-ingen.sh${NC}"
    echo ""
    echo -e "  ${BOLD}Features requiring VPN + Midway:${NC}"
    echo -e "    • Team Health (WBR goals from Taskei)"
    echo -e "    • Code Metrics (CRs from code.amazon.com)"
    echo -e "    • Ticket Health (SIM-T resolver groups)"
    echo -e "    • Org tree / Phonetool"
    echo ""

    # Offer to start
    read -p "  Start InGen now? [Y/n]: " START_NOW
    if [[ "$START_NOW" != "n" && "$START_NOW" != "N" ]]; then
        echo ""
        echo "  🧬 Starting InGen..."
        echo "  Dashboard will be at: http://localhost:3000"
        echo ""
        cd "$INSTALL_DIR"
        node launcher.js
    fi
}

# ─── Main ───
main() {
    print_header
    step_01_system_check
    step_02_xcode_tools
    step_03_homebrew
    step_04_nodejs
    # Ollama + AI models (install before configure so models are ready)
    step_05_ollama
    step_06_ai_models
    step_07_mcp_tooling
    step_08_install_app
    step_09_configure
    step_10_org_tree
    step_11_verify
    step_12_desktop_shortcut
    step_13_post_install
    clear_progress
}

main "$@"
