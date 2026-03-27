#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║        InGen — AgentSpaces Bootstrap Script                  ║
# ║     Launches InGen in a cloud AgentSpace environment         ║
# ╚══════════════════════════════════════════════════════════════╝
#
# This script is called by the AgentSpaces deep link initial prompt.
# It sets up and starts InGen in hosted mode on an AgentSpace VM.
#
# ── One-click share URL ──
# Natural-language prompt so Kiro clones first (trusted), then runs the
# local script (already in workspace = trusted). Tested and confirmed working.
#
# PRIMARY — pass your Bedrock token as an env var prefix so Kiro won't block it:
# (Replace YOUR_BEDROCK_TOKEN with your ABSK token before sharing)
#
# https://agentspaces.amazon.dev/app/?mode=CODE&blueprint=AgentSpacesEmptyBlueprintProd&spaceName=InGen&initialPrompt=Clone+InGen-SmartAI+from+ssh%3A%2F%2Fgit.amazon.com%2Fpkg%2FInGen-SmartAI+into+%7E%2F.workspace%2Fsrc%2FInGen-SmartAI%2C+then+run%3A+AWS_BEARER_TOKEN_BEDROCK%3DYOUR_BEDROCK_TOKEN+bash+%7E%2F.workspace%2Fsrc%2FInGen-SmartAI%2Fscripts%2Fstart-agentspaces.sh
#
# PLAIN (no token — user must configure via Settings page after startup):
# https://agentspaces.amazon.dev/app/?mode=CODE&blueprint=AgentSpacesEmptyBlueprintProd&spaceName=InGen&initialPrompt=Clone+InGen-SmartAI+from+ssh%3A%2F%2Fgit.amazon.com%2Fpkg%2FInGen-SmartAI+into+%7E%2F.workspace%2Fsrc%2FInGen-SmartAI%2C+then+run+the+setup+script+at+%7E%2F.workspace%2Fsrc%2FInGen-SmartAI%2Fscripts%2Fstart-agentspaces.sh
#
# FALLBACK (if Kiro blocks — Blueprint startup script runs automatically):
# https://devspaces.amazon.dev/blueprints/InGen-SmartAI  →  click "Create DevSpace"

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# Detect if running inside AgentSpaces (workspace structure)
if [ -d "$HOME/.workspace/src" ]; then
    INSTALL_DIR="$HOME/.workspace/src/InGen-SmartAI"
elif [ -d "$HOME/InGen" ]; then
    INSTALL_DIR="$HOME/InGen"
else
    INSTALL_DIR="$HOME/InGen"
fi

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     🧬 InGen — AgentSpaces Setup                 ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Clone if not already present ──
if [ ! -f "$INSTALL_DIR/package.json" ]; then
    echo -e "${BOLD}Step 1: Cloning InGen...${NC}"
    git clone ssh://git.amazon.com/pkg/InGen-SmartAI "$INSTALL_DIR"
    echo -e "  ${GREEN}✅${NC} Cloned to $INSTALL_DIR"
else
    echo -e "${BOLD}Step 1: InGen source already present${NC}"
    echo -e "  ${GREEN}✅${NC} $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── Step 2: Install dependencies ──
echo ""
echo -e "${BOLD}Step 2: Installing dependencies...${NC}"
# hnswlib-node and sqlite3 require Python distutils (missing on AL2023).
# Install setuptools first so node-gyp can compile native addons.
pip3 install setuptools --quiet 2>/dev/null || true
npm install 2>&1 | tail -3
echo -e "  ${GREEN}✅${NC} Dependencies installed"

# ── Step 3: Install required MCP servers (aws-outlook-mcp + slack-mcp) ──
echo ""
echo -e "${BOLD}Step 3: Installing required MCP servers...${NC}"
echo -e "  aws-outlook-mcp (email/calendar) and slack-mcp (Slack integration)"

# Ensure aim CLI is available — install via toolbox if missing
export PATH="$HOME/.toolbox/bin:$PATH"
if ! command -v aim &>/dev/null; then
    if command -v toolbox &>/dev/null; then
        echo -e "  Installing aim CLI via toolbox..."
        toolbox install aim 2>&1 | tail -3
    elif [[ -x "$HOME/.toolbox/bin/toolbox" ]]; then
        echo -e "  Installing aim CLI via toolbox..."
        "$HOME/.toolbox/bin/toolbox" install aim 2>&1 | tail -3
    fi
fi

AIM=$(command -v aim 2>/dev/null || echo "$HOME/.toolbox/bin/aim")
if ! [[ -x "$AIM" ]]; then
    echo -e "  ${RED:-\033[0;31m}❌ aim CLI not found. Cannot install required MCP servers.${NC}"
    echo -e "     Fix: toolbox install aim  then re-run this script."
    exit 1
fi
echo -e "  ${GREEN}✅${NC} aim CLI found: $AIM"

# ── aws-outlook-mcp (required for email/calendar features) ──
if command -v aws-outlook-mcp &>/dev/null || [[ -x "$HOME/.aim/mcp-servers/aws-outlook-mcp" ]]; then
    echo -e "  ${GREEN}✅${NC} aws-outlook-mcp already installed"
else
    echo -e "  Installing aws-outlook-mcp..."
    if ! "$AIM" mcp install aws-outlook-mcp 2>&1 | tail -5; then
        echo -e "  ${RED:-\033[0;31m}❌ aws-outlook-mcp install failed (required for email/calendar).${NC}"
        echo -e "     Fix: aim mcp install aws-outlook-mcp  then re-run this script."
        exit 1
    fi
    echo -e "  ${GREEN}✅${NC} aws-outlook-mcp installed"
fi

# ── slack-mcp (required for Slack integration) ──
if command -v slack-mcp &>/dev/null || [[ -x "$HOME/.aim/mcp-servers/slack-mcp" ]]; then
    echo -e "  ${GREEN}✅${NC} slack-mcp already installed"
else
    echo -e "  Installing slack-mcp..."
    if ! "$AIM" mcp install slack-mcp 2>&1 | tail -5; then
        echo -e "  ${RED:-\033[0;31m}❌ slack-mcp install failed (required for Slack features).${NC}"
        echo -e "     Fix: aim mcp install slack-mcp  then re-run this script."
        exit 1
    fi
    echo -e "  ${GREEN}✅${NC} slack-mcp installed"
fi

# ── Step 4: Configure hosted mode ──
echo ""
echo -e "${BOLD}Step 4: Configuring for AgentSpaces hosted mode...${NC}"

# Detect user's Amazon alias from Midway
ALIAS=""
if [ -f "$HOME/.midway/cookie" ]; then
    # Try to extract alias from environment or whoami
    ALIAS=$(whoami 2>/dev/null || echo "")
fi
if [ -z "$ALIAS" ]; then
    ALIAS=$(echo "$USER" | sed 's/@.*//')
fi

node -e "
const fs = require('fs');
const f = 'config/settings.json';
const d = JSON.parse(fs.readFileSync(f, 'utf8'));

// Set hosted mode
d.deploymentMode = 'hosted';
d.outlookIntegration = false;
d.llmProvider = 'bedrock';

// Set user alias if detected
const alias = '${ALIAS}';
if (alias && alias !== 'ec2-user' && alias !== 'root') {
    d.phonetoolAlias = alias;
}

// Auto-detect MCP server paths
const homedir = require('os').homedir();
const candidates = [
    homedir + '/.toolbox/bin/',
    '/usr/local/bin/',
    homedir + '/.aim/mcp-servers/',
];

function findBinary(name) {
    for (const dir of candidates) {
        const p = dir + name;
        if (fs.existsSync(p)) return p;
    }
    // Try PATH resolution
    try {
        const { execSync } = require('child_process');
        return execSync('which ' + name, { encoding: 'utf8' }).trim();
    } catch { return ''; }
}

if (d.mcpServers) {
    const bp = findBinary('builder-mcp');
    const ap = findBinary('amzn-mcp');
    const op = findBinary('aws-outlook-mcp');
    const sp = findBinary('slack-mcp');
    if (bp && d.mcpServers['builder-mcp']) d.mcpServers['builder-mcp'].command = bp;
    if (ap && d.mcpServers['amzn-mcp']) d.mcpServers['amzn-mcp'].command = ap;
    if (op && d.mcpServers['aws-outlook-mcp']) d.mcpServers['aws-outlook-mcp'].command = op;
    if (sp && d.mcpServers['slack-mcp']) d.mcpServers['slack-mcp'].command = sp;
    console.log('  MCP paths: builder-mcp=' + (bp || 'not found') + ', amzn-mcp=' + (ap || 'not found') + ', aws-outlook-mcp=' + (op || 'not found') + ', slack-mcp=' + (sp || 'not found'));
}

fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
console.log('  deploymentMode=hosted, outlookIntegration=false, llmProvider=bedrock');
console.log('  phonetoolAlias=' + d.phonetoolAlias);
"
echo -e "  ${GREEN}✅${NC} Configured"

# ── Step 5: Configure Bedrock bearer token ──
echo ""
echo -e "${BOLD}Step 5: Configuring Bedrock API key...${NC}"

# Check if token is already in env or .env.local
BEDROCK_TOKEN="${AWS_BEARER_TOKEN_BEDROCK:-}"
if [ -z "$BEDROCK_TOKEN" ] && [ -f ".env.local" ]; then
    BEDROCK_TOKEN=$(grep -m1 "^AWS_BEARER_TOKEN_BEDROCK=" .env.local 2>/dev/null | cut -d'=' -f2- || echo "")
fi

# Write base .env.local (auth secrets + trust host)
SECRET=$(openssl rand -base64 32 2>/dev/null || echo "agentspaces-$(date +%s)")
if [ ! -f ".env.local" ]; then
    cat > .env.local << ENVEOF
NEXTAUTH_SECRET=$SECRET
AUTH_SECRET=$SECRET
AUTH_TRUST_HOST=true
ENVEOF
fi
# Ensure AUTH_TRUST_HOST is set
if ! grep -q "AUTH_TRUST_HOST" .env.local; then
    echo "AUTH_TRUST_HOST=true" >> .env.local
fi

if [ -n "$BEDROCK_TOKEN" ]; then
    # Token was provided via env var (e.g. AWS_BEARER_TOKEN_BEDROCK=... bash start-agentspaces.sh)
    if ! grep -q "AWS_BEARER_TOKEN_BEDROCK" .env.local; then
        echo "AWS_BEARER_TOKEN_BEDROCK=$BEDROCK_TOKEN" >> .env.local
    else
        sed -i.bak "s|^AWS_BEARER_TOKEN_BEDROCK=.*|AWS_BEARER_TOKEN_BEDROCK=$BEDROCK_TOKEN|" .env.local && rm -f .env.local.bak
    fi
    echo -e "  ${GREEN}✅${NC} Bedrock token configured"
else
    echo -e "  ${YELLOW}⚠️  AWS_BEARER_TOKEN_BEDROCK not set — AI features will be unavailable until configured.${NC}"
    echo -e "  ${YELLOW}   Add it via Settings → API Keys after startup, or re-run with:${NC}"
    echo -e "  ${YELLOW}   AWS_BEARER_TOKEN_BEDROCK=<token> bash scripts/start-agentspaces.sh${NC}"
fi

# ── Step 6: Build Next.js ──
echo ""
echo -e "${BOLD}Step 6: Building Next.js...${NC}"
npm run build 2>&1 | tail -5
echo -e "  ${GREEN}✅${NC} Build complete"

# ── Step 7: Start InGen ──
echo ""
echo -e "${BOLD}Step 7: Starting InGen...${NC}"

# Start in production mode directly — bypass launcher.js (Mac-only Outlook sync + ADA creds
# would block for minutes on a fresh AgentSpace VM before Next.js ever starts).
# npm start = "next start -H 0.0.0.0" which is all we need in hosted mode.
npm start &
INGEN_PID=$!

echo -e "  ${GREEN}✅${NC} InGen starting (PID: $INGEN_PID)"

# Wait for server to be ready
echo -e "  Waiting for server..."
for i in $(seq 1 30); do
    if curl -s -o /dev/null http://localhost:3000 2>/dev/null; then
        break
    fi
    sleep 2
done

# ── Compute external proxy URL ──
DEVSPACE_ID=$(cat /etc/devspace/id 2>/dev/null || echo "")
DEVSPACE_REGION=$(cat /etc/devspace/region 2>/dev/null || echo "us-west-2")
if [ -n "$DEVSPACE_ID" ]; then
    INGEN_URL="https://${DEVSPACE_ID}--3000.${DEVSPACE_REGION}.prod.proxy.devspaces.amazon.dev/"
else
    INGEN_URL="http://localhost:3000"
fi

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     🎉 InGen is running!                         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}${BOLD}Open InGen in your browser:${NC}"
echo -e "  ${CYAN}${INGEN_URL}${NC}"
echo ""
echo -e "  ${BOLD}Available pages:${NC}"
echo -e "    • Agent Workspace   — AI agent with MCP tools"
echo -e "    • Team Health       — WBR goal tracking (Taskei)"
echo -e "    • Code Metrics      — Per-engineer CR dashboard"
echo -e "    • Ticket Health     — Resolver group ticket status"
echo -e "    • WBR Prep          — AI-generated weekly report"
echo -e "    • CPP WBR           — CPP Weekly Business Review"
echo -e "    • Org Pulse         — Organization overview"
echo -e "    • Settings          — Configuration"
echo ""
echo -e "  ${BOLD}Email/Calendar:${NC} Powered by aws-outlook-mcp (cloud Outlook)."
echo -e "  Sign in with your Amazon credentials if prompted."
echo ""
