#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║              InGen Distribution Packager (v2.0)              ║
# ║     Creates a clean .tar.gz ready to share via Slack         ║
# ╚══════════════════════════════════════════════════════════════╝

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_FILE="$HOME/Desktop/InGen.tar.gz"

echo ""
echo -e "${BOLD}🧬 Packaging InGen for distribution...${NC}"
echo ""

cd "$PROJECT_DIR"

# ── Clean settings.json for distribution ──
# Reset user-specific values to template placeholders
SETTINGS="$PROJECT_DIR/config/settings.json"
if [[ -f "$SETTINGS" ]] && command -v node &>/dev/null; then
    # Save current settings, create a clean copy for packaging
    cp "$SETTINGS" "/tmp/ingen-settings-backup-$$.json"

    node -e "
const fs = require('fs');
const f = '$SETTINGS';
const d = JSON.parse(fs.readFileSync(f, 'utf8'));
// Reset user-specific fields to defaults
d.outlookCalendarId = '';
d.phonetoolAlias = '';
d.logUploadUrl = '';
// Reset MCP paths to generic toolbox paths
if (d.mcpServers) {
    if (d.mcpServers['amzn-mcp']) d.mcpServers['amzn-mcp'].command = '\$HOME/.toolbox/bin/amzn-mcp';
    if (d.mcpServers['builder-mcp']) d.mcpServers['builder-mcp'].command = '\$HOME/.toolbox/bin/builder-mcp';
}
fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
" 2>/dev/null

    echo -e "  ${GREEN}✅${NC} Cleaned settings.json for distribution"
    SETTINGS_CLEANED=true
fi

# ── Create the archive ──
rm -rf /tmp/InGen
mkdir -p /tmp/InGen

rsync -a "$PROJECT_DIR/" /tmp/InGen/ \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.git' \
    --exclude='data' \
    --exclude='sync_state.json' \
    --exclude='*.log' \
    --exclude='*.db' \
    --exclude='*.db-shm' \
    --exclude='*.db-wal' \
    --exclude='meetings_raw.json' \
    --exclude='meetings_7days_raw.json' \
    --exclude='brain' \
    --exclude='scripts/demo-audio' \
    --exclude='scripts/demo-output' \
    --exclude='.ingen-install-progress'

cd /tmp
tar -czf "$OUTPUT_FILE" InGen
rm -rf /tmp/InGen

# ── Restore original settings ──
if [[ "$SETTINGS_CLEANED" == "true" ]] && [[ -f "/tmp/ingen-settings-backup-$$.json" ]]; then
    cp "/tmp/ingen-settings-backup-$$.json" "$SETTINGS"
    rm -f "/tmp/ingen-settings-backup-$$.json"
    echo -e "  ${GREEN}✅${NC} Restored your local settings.json"
fi

SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)

echo ""
echo -e "${GREEN}✅ Package created: ${CYAN}$OUTPUT_FILE${NC} (${SIZE})"
echo ""
echo -e "${BOLD}Share this file on Slack with these instructions:${NC}"
echo ""
echo -e "────────────────────────────────────────────────────"
echo -e "${BOLD}🧬 InGen — AI Productivity Dashboard${NC}"
echo ""
echo -e "Your personal AI executive assistant that runs"
echo -e "entirely on your MacBook. Zero cloud, full privacy."
echo ""
echo -e "${BOLD}Install:${NC}"
echo -e "  1. Download InGen.tar.gz (attached)"
echo -e "  2. Open Terminal and run this single command:"
echo -e "     ${CYAN}tar -xzf InGen.tar.gz && cd InGen && bash scripts/install-ingen.sh${NC}"
echo ""
echo -e "Requires: macOS + Microsoft Outlook."
echo -e "The installer handles everything else automatically."
echo -e "(Node.js, Ollama, AI models, MCP tools)."
echo -e ""
echo -e "Features resume — if install fails, re-run and it"
echo -e "picks up where it left off."
echo -e "────────────────────────────────────────────────────"
echo ""
