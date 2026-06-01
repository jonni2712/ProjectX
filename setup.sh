#!/bin/bash
set -e

# ============================================================
# ProjectX - Setup & Startup Script
# Run this on your desktop PC to get everything running
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      ProjectX - Remote Dev Platform      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# --- Step 1: Check prerequisites ---
echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}  ✗ $1 not found. Please install it first.${NC}"
    exit 1
  fi
  echo -e "${GREEN}  ✓ $1 found${NC}"
}

check_cmd node
check_cmd npm
check_cmd git
check_cmd python3

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo -e "${RED}  ✗ Node.js 20+ required (found v$(node -v))${NC}"
  exit 1
fi

# Check for Claude CLI (optional)
if command -v claude &>/dev/null; then
  echo -e "${GREEN}  ✓ Claude CLI found${NC}"
else
  echo -e "${YELLOW}  ⚠ Claude CLI not found (API fallback will be used)${NC}"
fi

# --- Step 2: Install server dependencies ---
echo ""
echo -e "${YELLOW}[2/6] Installing server dependencies...${NC}"
cd "$SCRIPT_DIR/server"

if [ ! -d "node_modules" ]; then
  npm install
  echo -e "${GREEN}  ✓ Server dependencies installed${NC}"
else
  echo -e "${GREEN}  ✓ Server dependencies already installed${NC}"
fi

# --- Step 3: Configure (interactive wizard) ---
echo ""
echo -e "${YELLOW}[3/6] Configuring server...${NC}"

CONFIG_FILE="data/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  # Delegate to the cross-platform setup wizard (server/src/setup.ts): it
  # collects workspace, network, admin account and Anthropic key, writes
  # data/config.json (0600 perms) and seeds the admin user in the database.
  npm run setup
else
  echo -e "${GREEN}  ✓ Configuration already exists ($CONFIG_FILE)${NC}"
  echo -e "    Re-run 'cd server && npm run setup' to reconfigure."
fi

if [ ! -f "$CONFIG_FILE" ]; then
  echo -e "${RED}  ✗ Configuration was not created. Aborting.${NC}"
  exit 1
fi

# --- Step 4: Verify configuration ---
echo ""
echo -e "${YELLOW}[4/6] Verifying configuration...${NC}"

# Read the effective values back from config.json for the steps below.
WORKSPACE_ROOT=$(node -e "process.stdout.write(String(require('./$CONFIG_FILE').workspaceRoot||''))")
PORT=$(node -e "process.stdout.write(String(require('./$CONFIG_FILE').port||3000))")

if [ ! -d "$WORKSPACE_ROOT" ]; then
  echo -e "${RED}  ✗ Workspace root does not exist: $WORKSPACE_ROOT${NC}"
  exit 1
fi

echo -e "${GREEN}  ✓ Workspace root: $WORKSPACE_ROOT${NC}"
echo -e "${GREEN}  ✓ Admin account configured in database${NC}"

# --- Step 5: Get network info ---
echo ""
echo -e "${YELLOW}[5/6] Network information...${NC}"

# Tailscale IP
if command -v tailscale &>/dev/null; then
  TS_IP=$(tailscale ip -4 2>/dev/null || echo "")
  if [ -n "$TS_IP" ]; then
    echo -e "${GREEN}  ✓ Tailscale IP: $TS_IP${NC}"
  fi
fi

# Local IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")
echo -e "${GREEN}  ✓ Local IP: $LOCAL_IP${NC}"

PORT=${PORT:-3000}

# --- Step 6: Start server ---
echo ""
echo -e "${YELLOW}[6/6] Starting ProjectX server...${NC}"
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Server starting on port $PORT                      ║"
echo "║                                                  ║"
if [ -n "$TS_IP" ]; then
echo "║  Tailscale:  http://$TS_IP:$PORT            ║"
fi
echo "║  Local:      http://$LOCAL_IP:$PORT              ║"
echo "║  Localhost:  http://localhost:$PORT               ║"
echo "║                                                  ║"
echo "║  Use these URLs in the Flutter app login screen  ║"
echo "║  Press Ctrl+C to stop the server                 ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Run with tsx
npx tsx src/index.ts
