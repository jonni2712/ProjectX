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

# --- Step 3: Configure .env ---
echo ""
echo -e "${YELLOW}[3/6] Configuring environment...${NC}"

if [ ! -f ".env" ]; then
  cp .env.example .env

  # Ask for workspace root
  echo ""
  read -p "  Workspace root path [/github]: " WORKSPACE_ROOT
  WORKSPACE_ROOT=${WORKSPACE_ROOT:-/github}

  # Validate it exists
  if [ ! -d "$WORKSPACE_ROOT" ]; then
    echo -e "${RED}  ✗ Directory does not exist: $WORKSPACE_ROOT${NC}"
    echo "  Create it or enter a valid path."
    exit 1
  fi

  # Ask for credentials
  read -p "  Admin username [admin]: " USERNAME
  USERNAME=${USERNAME:-admin}

  read -sp "  Admin password: " PASSWORD
  echo ""

  if [ -z "$PASSWORD" ]; then
    echo -e "${RED}  ✗ Password is required${NC}"
    exit 1
  fi

  # Generate password hash
  HASH=$(node -e "
    const bcrypt = require('bcrypt');
    bcrypt.hash('$PASSWORD', 12).then(h => process.stdout.write(h));
  ")

  # Generate JWT secret
  JWT_SECRET=$(openssl rand -hex 32)

  # Write .env
  sed -i.bak "s|WORKSPACE_ROOT=.*|WORKSPACE_ROOT=$WORKSPACE_ROOT|" .env
  sed -i.bak "s|AUTH_USERNAME=.*|AUTH_USERNAME=$USERNAME|" .env
  sed -i.bak "s|AUTH_PASSWORD_HASH=.*|AUTH_PASSWORD_HASH=$HASH|" .env
  sed -i.bak "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
  rm -f .env.bak

  # Ask for Anthropic API key (optional)
  echo ""
  read -p "  Anthropic API key (optional, press Enter to skip): " API_KEY
  if [ -n "$API_KEY" ]; then
    sed -i.bak "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$API_KEY|" .env
    rm -f .env.bak
  fi

  echo -e "${GREEN}  ✓ Environment configured${NC}"
else
  echo -e "${GREEN}  ✓ .env already exists${NC}"
fi

# --- Step 4: Verify setup ---
echo ""
echo -e "${YELLOW}[4/6] Verifying configuration...${NC}"

source .env 2>/dev/null || true

if [ -z "$AUTH_PASSWORD_HASH" ] || [ "$AUTH_PASSWORD_HASH" = "" ]; then
  echo -e "${RED}  ✗ AUTH_PASSWORD_HASH not set in .env${NC}"
  echo "  Run: cd server && npm run setup"
  exit 1
fi

if [ ! -d "$WORKSPACE_ROOT" ]; then
  echo -e "${RED}  ✗ WORKSPACE_ROOT does not exist: $WORKSPACE_ROOT${NC}"
  exit 1
fi

echo -e "${GREEN}  ✓ Workspace root: $WORKSPACE_ROOT${NC}"
echo -e "${GREEN}  ✓ Auth configured for: ${AUTH_USERNAME:-admin}${NC}"

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
