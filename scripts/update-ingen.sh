#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║                    InGen Updater for macOS                   ║
# ╚══════════════════════════════════════════════════════════════╝

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'
BOLD='\033[1m'

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

# Stop running instances
echo -e "  Stopping InGen if running..."
pkill -f "node.*launcher.js" 2>/dev/null || true
pkill -f "node.*background-agent.js" 2>/dev/null || true
sleep 1

# Pull latest code
echo -e "  Pulling latest code..."
git pull --rebase 2>/dev/null
if [[ $? -ne 0 ]]; then
    echo -e "  ${YELLOW}⚠️  Git pull failed. You may have local changes.${NC}"
    echo -e "  Try: ${CYAN}cd ~/InGen && git stash && git pull && git stash pop${NC}"
fi

# Update dependencies
echo -e "  Updating dependencies..."
npm install --production 2>/dev/null || npm install

# Clear issues DB to force re-parse with latest parser improvements
if [[ -f "$INSTALL_DIR/data/issues.db" ]]; then
    echo -e "  Clearing issues database (will re-parse on next load)..."
    rm -f "$INSTALL_DIR/data/issues.db"
    echo -e "  ${GREEN}✅ Issues DB cleared — Team Pulse will re-parse with improved owner detection${NC}"
fi

# Clear Next.js build cache
echo -e "  Clearing build cache..."
rm -rf "$INSTALL_DIR/.next" 2>/dev/null

# Done
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}  ${BOLD}✅ InGen updated successfully!${NC}                               ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Start InGen: ${CYAN}cd ~/InGen && node launcher.js${NC}"
echo -e "  Or double-click ${CYAN}InGen${NC} on your Desktop"
echo ""

read -p "Start InGen now? [Y/n]: " START_NOW
if [[ "$START_NOW" != "n" && "$START_NOW" != "N" ]]; then
    echo "🧬 Starting InGen..."
    node launcher.js
fi