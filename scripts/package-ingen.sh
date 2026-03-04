#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║              InGen Distribution Packager                     ║
# ║     Creates a clean .tar.gz ready to share via Slack         ║
# ╚══════════════════════════════════════════════════════════════╝

CYAN='\033[0;36m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_FILE="$HOME/Desktop/InGen.tar.gz"

echo ""
echo -e "${BOLD}🧬 Packaging InGen for distribution...${NC}"
echo ""

cd "$PROJECT_DIR"

# Create the archive, excluding dev/user-specific files
tar czf "$OUTPUT_FILE" \
    --exclude=node_modules \
    --exclude=.next \
    --exclude=.git \
    --exclude=data \
    --exclude=sync_state.json \
    --exclude=smartai.log \
    --exclude=.env.local \
    --exclude='*.db' \
    --exclude=meetings_raw.json \
    --exclude=meetings_7days_raw.json \
    -C "$(dirname "$PROJECT_DIR")" \
    "$(basename "$PROJECT_DIR")"

SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)

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
echo -e "  2. Open Terminal and run:"
echo -e "     ${CYAN}mkdir -p ~/InGen-install && cd ~/InGen-install${NC}"
echo -e "     ${CYAN}tar xzf ~/Downloads/InGen.tar.gz${NC}"
echo -e "     ${CYAN}bash */scripts/install-ingen.sh${NC}"
echo -e "  3. Double-click 'InGen' on your Desktop"
echo ""
echo -e "Requires: macOS + Microsoft Outlook."
echo -e "The installer handles everything else automatically."
echo -e "────────────────────────────────────────────────────"
echo ""