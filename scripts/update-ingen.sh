#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║                InGen Updater for macOS (v2.0)                ║
# ╚══════════════════════════════════════════════════════════════╝

# Colors
GREEN='\033[0;32m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
BOLD='\033[1m'; DIM='\033[2m'

INSTALL_DIR="$HOME/InGen"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}  ${BOLD}🧬 InGen Updater${NC}                                            ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ ! -d "$INSTALL_DIR" ]]; then
    echo -e "  ${YELLOW}⚠️  InGen not found at $INSTALL_DIR${NC}"
    echo -e "  Run the installer first: ${CYAN}bash scripts/install-ingen.sh${NC}"
    exit 1
fi

cd "$INSTALL_DIR"

# ── Stop running instances ──
echo -e "  Stopping InGen if running..."
pkill -f "node.*launcher.js" 2>/dev/null || true
pkill -f "node.*background-agent.js" 2>/dev/null || true
sleep 1
echo -e "  ${GREEN}✅${NC} Processes stopped"

# ── Pull latest code ──
echo -e "  Pulling latest code..."
if [[ -d ".git" ]]; then
    git pull --rebase 2>/dev/null
    if [[ $? -ne 0 ]]; then
        echo -e "  ${YELLOW}⚠️  Git pull failed. You may have local changes.${NC}"
        echo -e "  Try: ${CYAN}cd ~/InGen && git stash && git pull && git stash pop${NC}"
    else
        echo -e "  ${GREEN}✅${NC} Code updated"
    fi
else
    echo -e "  ${YELLOW}⚠️  Not a git repo — skipping code pull${NC}"
    echo -e "  For manual update: download InGen.tar.gz and re-run install-ingen.sh"
fi

# ── Update dependencies ──
echo -e "  Updating dependencies..."
npm install 2>&1 | tail -3
echo -e "  ${GREEN}✅${NC} Dependencies updated"

# ── Rebuild native modules if needed ──
echo -e "  Rebuilding native modules..."
npm rebuild 2>&1 | tail -3 || true

# ── Update MCP tooling ──
echo -e "  Checking MCP tools..."
if [[ -x "$HOME/.toolbox/bin/toolbox" ]] || command -v toolbox &>/dev/null; then
    # Check for updates to amzn-mcp and builder-mcp
    if command -v amzn-mcp &>/dev/null || [[ -x "$HOME/.toolbox/bin/amzn-mcp" ]]; then
        toolbox update amzn-mcp 2>/dev/null && echo -e "  ${GREEN}✅${NC} amzn-mcp updated" || echo -e "  ${DIM}amzn-mcp: already latest${NC}"
    fi
    if command -v builder-mcp &>/dev/null || [[ -x "$HOME/.toolbox/bin/builder-mcp" ]]; then
        toolbox update builder-mcp 2>/dev/null && echo -e "  ${GREEN}✅${NC} builder-mcp updated" || echo -e "  ${DIM}builder-mcp: already latest${NC}"
    fi
else
    echo -e "  ${DIM}Toolbox not found — skipping MCP update${NC}"
fi

# ── Clear stale caches ──
echo -e "  Clearing caches..."

# Clear Next.js build cache
rm -rf "$INSTALL_DIR/.next" 2>/dev/null
echo -e "  ${GREEN}✅${NC} Next.js cache cleared"

# Clear issues DB to force re-parse with latest parser
if [[ -f "$INSTALL_DIR/data/issues.db" ]]; then
    rm -f "$INSTALL_DIR/data/issues.db" "$INSTALL_DIR/data/issues.db-shm" "$INSTALL_DIR/data/issues.db-wal"
    echo -e "  ${GREEN}✅${NC} Issues DB cleared (will re-parse on next load)"
fi

# ── Done ──
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}  ${BOLD}✅ InGen updated successfully!${NC}                               ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Start InGen: ${CYAN}cd ~/InGen && node launcher.js${NC}"
echo -e "  Or double-click ${CYAN}InGen${NC} on your Desktop"
echo ""

read -p "  Start InGen now? [Y/n]: " START_NOW
if [[ "$START_NOW" != "n" && "$START_NOW" != "N" ]]; then
    echo ""
    echo "  🧬 Starting InGen..."
    node launcher.js
fi
