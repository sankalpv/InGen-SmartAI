#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║                    InGen Installer for macOS                 ║
# ║         Local AI-Powered Productivity Dashboard              ║
# ╚══════════════════════════════════════════════════════════════╝

set -e

# Configuration
INSTALL_DIR="$HOME/InGen"
REPO_URL="https://github.com/sankalpv/InGen-SmartAI.git"
DESKTOP_SHORTCUT="$HOME/Desktop/InGen.command"
LLM_MODEL="qwen3:latest"
EMBEDDING_MODEL="qwen3-embedding"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

print_header() {
    echo ""
    echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║${NC}  ${BOLD}🧬 InGen — AI Productivity Dashboard${NC}                       ${PURPLE}║${NC}"
    echo -e "${PURPLE}║${NC}  ${CYAN}Local-first • Privacy-first • Zero cloud${NC}                    ${PURPLE}║${NC}"
    echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}[$1/$TOTAL_STEPS]${NC} $2"
}

print_ok() {
    echo -e "  ${GREEN}✅ $1${NC}"
}

print_warn() {
    echo -e "  ${YELLOW}⚠️  $1${NC}"
}

print_fail() {
    echo -e "  ${RED}❌ $1${NC}"
}

print_info() {
    echo -e "  ${CYAN}ℹ️  $1${NC}"
}

TOTAL_STEPS=8

print_header

# ─── Step 1: Check macOS ───
print_step 1 "Checking system requirements..."

if [[ "$(uname)" != "Darwin" ]]; then
    print_fail "This installer is for macOS only."
    exit 1
fi
print_ok "macOS $(sw_vers -productVersion) detected"

# Check for Apple Silicon vs Intel
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
    print_ok "Apple Silicon (M-series) detected"
else
    print_ok "Intel Mac detected"
fi

# ─── Step 2: Check/Install Homebrew ───
print_step 2 "Checking Homebrew..."

if ! command -v brew &>/dev/null; then
    print_warn "Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add brew to PATH for Apple Silicon
    if [[ "$ARCH" == "arm64" ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    fi
    print_ok "Homebrew installed"
else
    print_ok "Homebrew found"
fi

# ─── Step 3: Check/Install Node.js ───
print_step 3 "Checking Node.js..."

if ! command -v node &>/dev/null; then
    print_warn "Node.js not found. Installing via Homebrew..."
    brew install node
    print_ok "Node.js $(node -v) installed"
else
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$NODE_VERSION" -lt 20 ]]; then
        print_warn "Node.js $(node -v) is too old (need 20+). Upgrading..."
        brew upgrade node || brew install node
    fi
    print_ok "Node.js $(node -v)"
fi

# ─── Step 4: Check/Install Ollama ───
print_step 4 "Checking Ollama (local AI engine)..."

if ! command -v ollama &>/dev/null; then
    print_warn "Ollama not found. Installing..."
    brew install ollama
    print_ok "Ollama installed"
    
    # Start Ollama service
    print_info "Starting Ollama service..."
    ollama serve &>/dev/null &
    sleep 3
else
    print_ok "Ollama found"
    
    # Ensure Ollama is running
    if ! curl -s http://127.0.0.1:11434/api/tags &>/dev/null; then
        print_info "Starting Ollama service..."
        ollama serve &>/dev/null &
        sleep 3
    fi
fi

# ─── Step 5: Pull AI Models ───
print_step 5 "Downloading AI models (this may take 5-10 minutes on first install)..."

# Check if models already exist
if ollama list 2>/dev/null | grep -q "$LLM_MODEL"; then
    print_ok "LLM model ($LLM_MODEL) already downloaded"
else
    print_info "Pulling $LLM_MODEL (~5.2 GB)..."
    ollama pull "$LLM_MODEL"
    print_ok "$LLM_MODEL downloaded"
fi

if ollama list 2>/dev/null | grep -q "$EMBEDDING_MODEL"; then
    print_ok "Embedding model ($EMBEDDING_MODEL) already downloaded"
else
    print_info "Pulling $EMBEDDING_MODEL (~4.7 GB)..."
    ollama pull "$EMBEDDING_MODEL"
    print_ok "$EMBEDDING_MODEL downloaded"
fi

# ─── Step 6: Install InGen ───
print_step 6 "Installing InGen..."

# Detect if we're running from inside the source directory (zip distribution)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

if [[ -f "$SOURCE_DIR/package.json" ]] && grep -q "smartai" "$SOURCE_DIR/package.json" 2>/dev/null; then
    # Running from inside the extracted zip — copy to install dir
    if [[ "$SOURCE_DIR" != "$INSTALL_DIR" ]]; then
        if [[ -d "$INSTALL_DIR" ]]; then
            print_info "Existing installation found. Updating files..."
            # Preserve user data
            [[ -d "$INSTALL_DIR/data" ]] && cp -r "$INSTALL_DIR/data" /tmp/ingen-data-backup 2>/dev/null
            [[ -f "$INSTALL_DIR/.env.local" ]] && cp "$INSTALL_DIR/.env.local" /tmp/ingen-env-backup 2>/dev/null
            [[ -f "$INSTALL_DIR/sync_state.json" ]] && cp "$INSTALL_DIR/sync_state.json" /tmp/ingen-sync-backup 2>/dev/null
            rm -rf "$INSTALL_DIR"
        fi
        print_info "Copying to $INSTALL_DIR..."
        cp -r "$SOURCE_DIR" "$INSTALL_DIR"
        # Restore user data
        [[ -d /tmp/ingen-data-backup ]] && cp -r /tmp/ingen-data-backup "$INSTALL_DIR/data" && rm -rf /tmp/ingen-data-backup
        [[ -f /tmp/ingen-env-backup ]] && cp /tmp/ingen-env-backup "$INSTALL_DIR/.env.local" && rm -f /tmp/ingen-env-backup
        [[ -f /tmp/ingen-sync-backup ]] && cp /tmp/ingen-sync-backup "$INSTALL_DIR/sync_state.json" && rm -f /tmp/ingen-sync-backup
    else
        print_ok "Already installed at $INSTALL_DIR"
    fi
    cd "$INSTALL_DIR"
elif [[ -d "$INSTALL_DIR" ]]; then
    print_info "Existing installation found."
    cd "$INSTALL_DIR"
    # Try git pull if it's a git repo
    if [[ -d ".git" ]]; then
        git pull --rebase 2>/dev/null || true
    fi
else
    # No source dir detected, no existing install — try git clone as fallback
    if command -v git &>/dev/null && [[ -n "$REPO_URL" ]]; then
        print_info "Cloning from repository..."
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    else
        print_fail "No InGen source found. Download InGen.tar.gz first and extract it."
        print_info "Then run: bash scripts/install-ingen.sh"
        exit 1
    fi
fi

# Install dependencies
print_info "Installing Node.js dependencies (this may take 1-2 minutes)..."
npm install 2>&1 | tail -1

print_ok "InGen installed at $INSTALL_DIR"

# ─── Step 7: Configure ───
print_step 7 "Configuring InGen..."

# Create .env.local if it doesn't exist
if [[ ! -f "$INSTALL_DIR/.env.local" ]]; then
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

# Update phonetool alias if we can detect it
CURRENT_USER=$(whoami)
if [[ -n "$CURRENT_USER" ]]; then
    # Update settings.json with detected alias
    if command -v python3 &>/dev/null; then
        python3 -c "
import json
try:
    with open('$INSTALL_DIR/config/settings.json', 'r') as f:
        s = json.load(f)
    s['phonetoolAlias'] = '$CURRENT_USER'
    with open('$INSTALL_DIR/config/settings.json', 'w') as f:
        json.dump(s, f, indent=2)
except: pass
" 2>/dev/null
    fi
    print_ok "Set Phonetool alias: $CURRENT_USER"
fi

# Create data directory
mkdir -p "$INSTALL_DIR/data"
print_ok "Created data directory"

# ─── Step 8: Create Desktop Shortcut ───
print_step 8 "Creating Desktop shortcut..."

cat > "$DESKTOP_SHORTCUT" << 'LAUNCHER'
#!/bin/bash
# InGen — AI Productivity Dashboard
cd "$HOME/InGen"

echo "🧬 Starting InGen..."
echo ""

# Ensure Ollama is running
if ! curl -s http://127.0.0.1:11434/api/tags &>/dev/null; then
    echo "Starting Ollama..."
    ollama serve &>/dev/null &
    sleep 2
fi

# Launch InGen
node launcher.js

# Keep terminal open on error
read -p "Press Enter to close..."
LAUNCHER

chmod +x "$DESKTOP_SHORTCUT"
print_ok "Created Desktop shortcut: InGen.command"

# ─── Done ───
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}  ${BOLD}✨ InGen installed successfully!${NC}                            ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}To start InGen:${NC}"
echo -e "    • Double-click ${CYAN}InGen${NC} on your Desktop"
echo -e "    • Or run: ${CYAN}cd ~/InGen && node launcher.js${NC}"
echo ""
echo -e "  ${BOLD}Then open:${NC} ${CYAN}http://localhost:3000${NC}"
echo ""
echo -e "  ${BOLD}To update later:${NC} ${CYAN}~/InGen/scripts/update-ingen.sh${NC}"
echo -e "  ${BOLD}To uninstall:${NC}   ${CYAN}~/InGen/scripts/uninstall-ingen.sh${NC}"
echo ""

# Offer to start now
read -p "Start InGen now? [Y/n]: " START_NOW
if [[ "$START_NOW" != "n" && "$START_NOW" != "N" ]]; then
    echo ""
    echo "🧬 Starting InGen..."
    cd "$INSTALL_DIR"
    node launcher.js
fi