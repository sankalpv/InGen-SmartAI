#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║                   InGen Uninstaller for macOS                ║
# ╚══════════════════════════════════════════════════════════════╝

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

INSTALL_DIR="$HOME/InGen"
DESKTOP_SHORTCUT="$HOME/Desktop/InGen.command"

echo ""
echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║${NC}  ${BOLD}🧬 InGen Uninstaller${NC}                                       ${RED}║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  This will remove:"
echo -e "    ${RED}•${NC} $INSTALL_DIR/ (app code, local data, logs)"
echo -e "    ${RED}•${NC} Desktop shortcut (InGen.command)"
echo ""
echo -e "  This will ${GREEN}NOT${NC} remove (shared tools):"
echo -e "    ${GREEN}•${NC} Node.js"
echo -e "    ${GREEN}•${NC} Ollama"
echo -e "    ${GREEN}•${NC} Ollama AI models (~10 GB)"
echo ""

# Prompt before deletion
read -p "Remove InGen? [y/N]: " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo ""
    echo "Uninstall cancelled."
    exit 0
fi

echo ""

# Stop any running InGen processes
echo -e "  Stopping InGen processes..."
pkill -f "node.*launcher.js" 2>/dev/null || true
pkill -f "node.*background-agent.js" 2>/dev/null || true
pkill -f "next.*dev\|next.*start" 2>/dev/null || true
sleep 1
echo -e "  ${GREEN}✅ Processes stopped${NC}"

# Remove install directory
if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
    echo -e "  ${GREEN}✅ Removed $INSTALL_DIR/${NC}"
else
    echo -e "  ${YELLOW}⚠️  $INSTALL_DIR/ not found (already removed?)${NC}"
fi

# Remove Desktop shortcut
if [[ -f "$DESKTOP_SHORTCUT" ]]; then
    rm -f "$DESKTOP_SHORTCUT"
    echo -e "  ${GREEN}✅ Removed Desktop shortcut${NC}"
else
    echo -e "  ${YELLOW}⚠️  Desktop shortcut not found${NC}"
fi

# Clean exit summary
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}  ${BOLD}👋 InGen has been uninstalled.${NC}                               ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}To reclaim disk space (optional):${NC}"
echo ""
echo -e "  Remove AI models (~10 GB):"
echo -e "    ${CYAN}ollama rm qwen3:latest${NC}"
echo -e "    ${CYAN}ollama rm qwen3-embedding${NC}"
echo ""
echo -e "  Remove Ollama entirely:"
echo -e "    ${CYAN}brew uninstall ollama${NC}"
echo ""
echo -e "  Remove Node.js:"
echo -e "    ${CYAN}brew uninstall node${NC}"
echo ""