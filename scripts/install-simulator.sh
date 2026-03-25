#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║  InGen Install Simulator — Dry-Run Precondition Checker      ║
# ║  Simulates a fresh Mac install without making any changes     ║
# ╚══════════════════════════════════════════════════════════════╝

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'

pass=0; fail=0; warn=0

check_pass() { echo -e "  ${GREEN}✅ PASS${NC}  $1"; pass=$((pass + 1)); }
check_fail() { echo -e "  ${RED}❌ FAIL${NC}  $1"; echo -e "         ${YELLOW}→ $2${NC}"; fail=$((fail + 1)); }
check_warn() { echo -e "  ${YELLOW}⚠️  WARN${NC}  $1"; echo -e "         ${CYAN}→ $2${NC}"; warn=$((warn + 1)); }
section()    { echo ""; echo -e "${BOLD}━━━ $1 ━━━${NC}"; }

INSTALL_DIR="$HOME/InGen"
LLM_MODEL="qwen3:latest"
EMBEDDING_MODEL="qwen3-embedding"

# ═══════════════════════════════════════════════════
section "Step 1: System Check"
# ═══════════════════════════════════════════════════

# macOS
if [[ "$(uname)" == "Darwin" ]]; then
    check_pass "macOS $(sw_vers -productVersion)"
else
    check_fail "Not macOS" "This installer only supports macOS"
fi

# Architecture
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
    check_pass "Apple Silicon (M-series)"
else
    check_warn "Intel Mac ($ARCH)" "Ollama will be slower without Apple Silicon GPU"
fi

# Disk space
free_gb=$(df -g "$HOME" | awk 'NR==2 {print $4}')
if [[ "$free_gb" -ge 15 ]]; then
    check_pass "Disk space: ${free_gb} GB free (15 GB needed)"
elif [[ "$free_gb" -ge 10 ]]; then
    check_warn "Disk space: ${free_gb} GB free" "15 GB recommended for models + dependencies"
else
    check_fail "Disk space: ${free_gb} GB free" "Need at least 15 GB for models + node_modules"
fi

# Outlook
if [[ -d "/Applications/Microsoft Outlook.app" ]]; then
    check_pass "Microsoft Outlook installed"
    if pgrep -x "Microsoft Outlook" >/dev/null 2>&1; then
        check_pass "Microsoft Outlook is running"
    else
        check_warn "Microsoft Outlook is NOT running" "Calendar detection will be skipped during install"
    fi
    
    # Check classic vs new Outlook
    OUTLOOK_INFO=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "/Applications/Microsoft Outlook.app/Contents/Info.plist" 2>/dev/null || echo "unknown")
    check_pass "Outlook version: $OUTLOOK_INFO"
else
    check_fail "Microsoft Outlook not found" "Install Outlook for email/calendar features"
fi

# ═══════════════════════════════════════════════════
section "Step 2: Xcode CLI Tools"
# ═══════════════════════════════════════════════════

if xcode-select -p &>/dev/null; then
    check_pass "Xcode CLI Tools: $(xcode-select -p)"
else
    check_fail "Xcode CLI Tools not installed" "Run: xcode-select --install"
fi

# Python setuptools
if python3 -c "import setuptools" &>/dev/null 2>&1; then
    check_pass "Python setuptools available"
elif python3 -c "import distutils" &>/dev/null 2>&1; then
    check_pass "Python distutils available (legacy)"
else
    check_fail "Python setuptools missing" "Run: pip3 install setuptools --break-system-packages"
fi

# ═══════════════════════════════════════════════════
section "Step 3: Homebrew"
# ═══════════════════════════════════════════════════

if command -v brew &>/dev/null; then
    check_pass "Homebrew $(brew --version 2>/dev/null | head -1 | awk '{print $2}')"
else
    check_fail "Homebrew not installed" "Will be installed automatically"
fi

# ═══════════════════════════════════════════════════
section "Step 4: Node.js"
# ═══════════════════════════════════════════════════

if command -v node &>/dev/null; then
    NODE_VER=$(node -v 2>/dev/null)
    NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
    if [[ "$NODE_MAJOR" -ge 20 ]]; then
        check_pass "Node.js $NODE_VER (need ≥20)"
    else
        check_fail "Node.js $NODE_VER too old" "Need Node.js 20+. Run: brew install node"
    fi
    
    if command -v npm &>/dev/null; then
        check_pass "npm $(npm -v 2>/dev/null)"
    else
        check_fail "npm not found" "Should come with Node.js"
    fi
else
    check_fail "Node.js not installed" "Will be installed via: brew install node"
fi

# ═══════════════════════════════════════════════════
section "Step 5: Ollama"
# ═══════════════════════════════════════════════════

if command -v ollama &>/dev/null; then
    check_pass "Ollama installed ($(ollama --version 2>/dev/null || echo 'unknown version'))"
else
    check_fail "Ollama not installed" "Will be installed via: brew install ollama"
fi

# Port check
if curl -s http://127.0.0.1:11434/api/tags &>/dev/null; then
    check_pass "Ollama service running on :11434"
else
    port_user=$(lsof -i :11434 -sTCP:LISTEN -t 2>/dev/null || true)
    if [[ -n "$port_user" ]]; then
        port_cmd=$(ps -p "$port_user" -o comm= 2>/dev/null || echo "unknown")
        check_fail "Port 11434 blocked by '$port_cmd' (PID $port_user)" "Kill it: kill $port_user"
    else
        check_warn "Ollama service not running" "Will be started automatically"
    fi
fi

# ═══════════════════════════════════════════════════
section "Step 6: AI Models"
# ═══════════════════════════════════════════════════

if command -v ollama &>/dev/null && curl -s http://127.0.0.1:11434/api/tags &>/dev/null; then
    if ollama list 2>/dev/null | grep -q "$LLM_MODEL"; then
        check_pass "LLM model: $LLM_MODEL"
    else
        check_warn "LLM model $LLM_MODEL not pulled" "Will download ~5.2 GB"
    fi
    
    if ollama list 2>/dev/null | grep -q "$EMBEDDING_MODEL"; then
        check_pass "Embedding model: $EMBEDDING_MODEL"
    else
        check_warn "Embedding model $EMBEDDING_MODEL not pulled" "Will download ~4.7 GB"
    fi
else
    check_warn "Cannot check models (Ollama not running)" "Models will be pulled during install"
fi

# ═══════════════════════════════════════════════════
section "Step 7: MCP Tooling (Amazon Internal)"
# ═══════════════════════════════════════════════════

# Toolbox
if command -v toolbox &>/dev/null || [[ -x "$HOME/.toolbox/bin/toolbox" ]]; then
    check_pass "Amazon Toolbox installed"
else
    check_warn "Amazon Toolbox not found" "Install from https://w.amazon.com/bin/view/AmazonToolbox"
fi

# amzn-mcp
if command -v amzn-mcp &>/dev/null || [[ -x "$HOME/.toolbox/bin/amzn-mcp" ]]; then
    check_pass "amzn-mcp binary found"
else
    check_warn "amzn-mcp not found" "Install: toolbox install amzn-mcp"
fi

# builder-mcp
if command -v builder-mcp &>/dev/null || [[ -x "$HOME/.toolbox/bin/builder-mcp" ]]; then
    check_pass "builder-mcp binary found"
else
    check_warn "builder-mcp not found" "Install: toolbox install builder-mcp"
fi

# slack-mcp (check both toolbox and aim)
if command -v slack-mcp &>/dev/null || [[ -x "$HOME/.toolbox/bin/slack-mcp" ]] || [[ -x "$HOME/.aim/mcp-servers/slack-mcp" ]]; then
    check_pass "slack-mcp binary found"
else
    check_warn "slack-mcp not found" "Install: toolbox install slack-mcp"
fi

# VPN connectivity (simple check)
if curl -s --connect-timeout 5 https://phonetool.amazon.com &>/dev/null; then
    check_pass "VPN connectivity (phonetool.amazon.com reachable)"
else
    check_warn "VPN may not be connected" "Phonetool, MCP tools, and org tree require VPN + Midway"
fi

# SSH to git.amazon.com
if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -T git.amazon.com 2>&1 | grep -qi "success\|welcome\|authenticated"; then
    check_pass "SSH to git.amazon.com"
else
    check_warn "SSH to git.amazon.com failed" "Needs VPN + Midway + SSH keys"
fi

# ═══════════════════════════════════════════════════
section "Step 8: Install App (npm)"
# ═══════════════════════════════════════════════════

if [[ -d "$INSTALL_DIR" ]]; then
    check_pass "Install dir exists: $INSTALL_DIR"
    if [[ -d "$INSTALL_DIR/node_modules" ]]; then
        local_count=$(ls -1 "$INSTALL_DIR/node_modules" 2>/dev/null | wc -l | tr -d ' ')
        check_pass "node_modules present ($local_count packages)"
    else
        check_warn "node_modules missing" "npm install will run during install"
    fi
    
    # Native modules
    if [[ -d "$INSTALL_DIR" ]] && command -v node &>/dev/null; then
        cd "$INSTALL_DIR" 2>/dev/null
        if node -e "require('hnswlib-node')" 2>/dev/null; then
            check_pass "hnswlib-node native module compiled"
        else
            check_warn "hnswlib-node not compiled" "npm rebuild will attempt this"
        fi
        
        if node -e "require('sqlite3')" 2>/dev/null; then
            check_pass "sqlite3 native module compiled"
        else
            check_warn "sqlite3 not compiled" "npm rebuild will attempt this"
        fi
        cd - &>/dev/null
    fi
else
    check_warn "Install dir not found: $INSTALL_DIR" "Will be created during install"
fi

# ═══════════════════════════════════════════════════
section "Step 9: Configuration"
# ═══════════════════════════════════════════════════

if [[ -f "$INSTALL_DIR/.env.local" ]]; then
    check_pass ".env.local exists"
    
    # Check for required vars
    for var in LLM_MODEL EMBEDDING_MODEL EMBEDDING_DIMENSIONS OLLAMA_BASE_URL; do
        if grep -q "^${var}=" "$INSTALL_DIR/.env.local" 2>/dev/null; then
            check_pass "  .env.local has $var"
        else
            check_warn "  .env.local missing $var" "May cause runtime issues"
        fi
    done
    
    # Check for duplicate entries
    dupes=$(grep -c "^AWS_BEARER_TOKEN_BEDROCK=" "$INSTALL_DIR/.env.local" 2>/dev/null || echo "0")
    if [[ "$dupes" -gt 1 ]]; then
        check_warn "Duplicate AWS_BEARER_TOKEN_BEDROCK in .env.local ($dupes entries)" "Fixed by env_set in v2.1"
    fi
else
    check_warn ".env.local not found" "Will be created during install"
fi

if [[ -f "$INSTALL_DIR/config/settings.json" ]]; then
    check_pass "config/settings.json exists"
    
    # Check for stale llmProvider
    if grep -q '"llmProvider"' "$INSTALL_DIR/config/settings.json" 2>/dev/null; then
        check_warn "settings.json still has 'llmProvider'" "Removed in v2.1 (Mac-only simplification)"
    fi
    
    # Check MCP paths
    for mcp in amzn-mcp builder-mcp; do
        mcp_path=$(node -e "const s=JSON.parse(require('fs').readFileSync('$INSTALL_DIR/config/settings.json','utf8'));console.log(s.mcpServers?.['$mcp']?.command||'')" 2>/dev/null || echo "")
        if [[ -n "$mcp_path" ]]; then
            if [[ -x "$mcp_path" ]]; then
                check_pass "  $mcp path valid: $mcp_path"
            else
                check_fail "  $mcp path invalid: $mcp_path" "Binary not found at configured path"
            fi
        fi
    done
else
    check_warn "config/settings.json not found" "Will be from source"
fi

# ═══════════════════════════════════════════════════
section "Step 10: Outlook Integration (osascript)"
# ═══════════════════════════════════════════════════

if command -v osascript &>/dev/null; then
    check_pass "osascript available"
else
    check_fail "osascript not found" "Should be built into macOS"
fi

# Test Outlook AppleScript access (non-destructive read)
if pgrep -x "Microsoft Outlook" >/dev/null 2>&1; then
    echo -e "  ${CYAN}Testing Outlook AppleScript access...${NC}"
    OUTLOOK_TEST=$(timeout 15 osascript -l JavaScript -e '
        const Outlook = Application("Microsoft Outlook");
        try {
            const accts = Outlook.exchangeAccounts();
            JSON.stringify({ok: true, accounts: accts.length});
        } catch(e) {
            JSON.stringify({ok: false, error: e.message});
        }
    ' 2>&1) || OUTLOOK_TEST='{"ok":false,"error":"timeout"}'
    
    if echo "$OUTLOOK_TEST" | grep -q '"ok":true'; then
        acct_count=$(echo "$OUTLOOK_TEST" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.accounts)" 2>/dev/null || echo "?")
        check_pass "Outlook AppleScript works ($acct_count accounts)"
    elif echo "$OUTLOOK_TEST" | grep -qi "not authorized\|access\|permission"; then
        check_fail "Outlook Automation permission denied" "System Settings → Privacy → Automation → Terminal → Microsoft Outlook"
    elif echo "$OUTLOOK_TEST" | grep -qi "timeout"; then
        check_warn "Outlook AppleScript timed out (15s)" "Outlook may be busy. Try closing dialogs."
    else
        check_warn "Outlook AppleScript returned unexpected result" "$OUTLOOK_TEST"
    fi
    
    # Test calendar access
    echo -e "  ${CYAN}Testing calendar access...${NC}"
    CAL_TEST=$(timeout 15 osascript -l JavaScript -e '
        const Outlook = Application("Microsoft Outlook");
        try {
            const cals = Outlook.calendars();
            JSON.stringify({ok: true, count: cals.length});
        } catch(e) {
            JSON.stringify({ok: false, error: e.message});
        }
    ' 2>&1) || CAL_TEST='{"ok":false,"error":"timeout"}'
    
    if echo "$CAL_TEST" | grep -q '"ok":true'; then
        cal_count=$(echo "$CAL_TEST" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.count)" 2>/dev/null || echo "?")
        check_pass "Calendar access works ($cal_count calendars)"
    else
        check_warn "Calendar access test failed" "$CAL_TEST"
    fi
else
    check_warn "Outlook not running — skipping AppleScript tests" "Start Outlook before install for calendar setup"
fi

# ═══════════════════════════════════════════════════
section "Summary"
# ═══════════════════════════════════════════════════

total=$((pass + fail + warn))
echo ""
echo -e "  ${GREEN}✅ Pass: $pass${NC}  |  ${RED}❌ Fail: $fail${NC}  |  ${YELLOW}⚠️  Warn: $warn${NC}  |  Total: $total"
echo ""

if [[ $fail -eq 0 ]]; then
    echo -e "  ${GREEN}${BOLD}🎉 All clear — install should succeed!${NC}"
elif [[ $fail -le 3 ]]; then
    echo -e "  ${YELLOW}${BOLD}⚠️  $fail issue(s) found — install may need manual intervention${NC}"
else
    echo -e "  ${RED}${BOLD}❌ $fail issues found — fix these before running the installer${NC}"
fi
echo ""
