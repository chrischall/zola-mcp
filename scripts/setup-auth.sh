#!/usr/bin/env bash
#
# Zola MCP Auth Setup
#
# Captures a mobile refresh token from the Zola iOS app via mitmproxy.
# The token lasts ~1 year. Run this once, then you're set.
#
# Requirements:
#   - Zola iOS app installed (runs on Mac via Apple Silicon)
#   - mitmproxy installed (brew install mitmproxy)
#   - Wi-Fi as primary network interface
#
# Usage:
#   ./scripts/setup-auth.sh
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PROXY_PORT=8080
CAPTURE_FILE=$(mktemp /tmp/zola-auth-XXXXXX.mitm)
FULL_DUMP=$(mktemp /tmp/zola-auth-dump-XXXXXX.txt)
MITMDUMP_PID=""
ENV_FILE="${1:-.env}"

cleanup() {
  # Kill mitmdump if running
  if [ -n "$MITMDUMP_PID" ] && kill -0 "$MITMDUMP_PID" 2>/dev/null; then
    kill -SIGINT "$MITMDUMP_PID" 2>/dev/null || true
    wait "$MITMDUMP_PID" 2>/dev/null || true
  fi
  # Disable proxy
  networksetup -setwebproxystate Wi-Fi off 2>/dev/null || true
  networksetup -setsecurewebproxystate Wi-Fi off 2>/dev/null || true
  # Clean up temp files
  rm -f "$CAPTURE_FILE" "$FULL_DUMP"
}
trap cleanup EXIT

echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Zola MCP — Auth Token Setup          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
if ! command -v mitmdump &>/dev/null; then
  MITMDUMP=$(find /opt/homebrew/bin -name mitmdump 2>/dev/null | head -1)
  if [ -z "$MITMDUMP" ]; then
    echo -e "${RED}Error: mitmproxy not installed.${NC}"
    echo "Install with: brew install mitmproxy"
    exit 1
  fi
else
  MITMDUMP=$(command -v mitmdump)
fi

if ! ls /Applications/Zola.app &>/dev/null; then
  echo -e "${RED}Error: Zola app not found in /Applications.${NC}"
  echo "Install the Zola app from the App Store."
  exit 1
fi

# Check if mitmproxy CA cert is trusted
if ! security find-certificate -c mitmproxy /Library/Keychains/System.keychain &>/dev/null 2>&1; then
  echo -e "${YELLOW}The mitmproxy CA certificate needs to be trusted.${NC}"
  echo ""
  # Generate cert if needed
  if [ ! -f ~/.mitmproxy/mitmproxy-ca-cert.pem ]; then
    echo "Generating mitmproxy certificate..."
    "$MITMDUMP" -p 0 --set confdir=~/.mitmproxy &>/dev/null &
    local_pid=$!
    sleep 2
    kill $local_pid 2>/dev/null || true
  fi
  echo "Run this command (requires sudo):"
  echo ""
  echo -e "  ${CYAN}sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.mitmproxy/mitmproxy-ca-cert.pem${NC}"
  echo ""
  read -rp "Press Enter after running the command above... "
fi

# Step 1: Quit Zola if running
echo ""
echo -e "${YELLOW}Step 1:${NC} Quitting Zola app (if running)..."
osascript -e 'tell application "Zola" to quit' 2>/dev/null || true
sleep 2

# Step 2: Start proxy
echo -e "${YELLOW}Step 2:${NC} Starting mitmproxy on port ${PROXY_PORT}..."
"$MITMDUMP" -p "$PROXY_PORT" --flow-detail 0 -w "$CAPTURE_FILE" &>/dev/null &
MITMDUMP_PID=$!
sleep 1

if ! kill -0 "$MITMDUMP_PID" 2>/dev/null; then
  echo -e "${RED}Error: Failed to start mitmdump. Port ${PROXY_PORT} may be in use.${NC}"
  exit 1
fi

# Step 3: Enable system proxy
echo -e "${YELLOW}Step 3:${NC} Enabling system proxy..."
networksetup -setwebproxy Wi-Fi 127.0.0.1 "$PROXY_PORT"
networksetup -setsecurewebproxy Wi-Fi 127.0.0.1 "$PROXY_PORT"

# Step 4: Launch Zola
echo -e "${YELLOW}Step 4:${NC} Launching Zola app..."
open -a Zola
echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Wait for the Zola app to fully load,     ${NC}"
echo -e "${GREEN}  then press Enter to capture the token.   ${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
read -rp "Press Enter when Zola is loaded... "

# Step 5: Stop proxy and extract token
echo ""
echo -e "${YELLOW}Step 5:${NC} Capturing tokens..."

# Stop mitmdump cleanly
kill -SIGINT "$MITMDUMP_PID" 2>/dev/null || true
wait "$MITMDUMP_PID" 2>/dev/null || true
MITMDUMP_PID=""

# Disable proxy immediately
networksetup -setwebproxystate Wi-Fi off
networksetup -setsecurewebproxystate Wi-Fi off

# Read the capture file
"$MITMDUMP" -r "$CAPTURE_FILE" --flow-detail 3 --listen-host 127.0.0.1 -p 9999 2>&1 > "$FULL_DUMP" &
local_pid=$!
sleep 3
kill $local_pid 2>/dev/null || true

# Extract refresh token from sessions/refresh response
REFRESH_TOKEN=$(grep -A 1 '"refresh_token"' "$FULL_DUMP" | grep -o '"eyJ[^"]*"' | tr -d '"' | tail -1)

# If no refresh response, try sessions/verify response (fresh login)
if [ -z "$REFRESH_TOKEN" ]; then
  REFRESH_TOKEN=$(grep '"refresh_token"' "$FULL_DUMP" | grep -o 'eyJ[^"]*' | tail -1)
fi

# Extract account ID from user context
ACCOUNT_ID=$(grep -o '"wedding_account_id":[0-9]*' "$FULL_DUMP" | head -1 | grep -o '[0-9]*')
# Fallback: try from the seating charts or other endpoints
if [ -z "$ACCOUNT_ID" ]; then
  ACCOUNT_ID=$(grep -o '"account_id":[0-9]*' "$FULL_DUMP" | head -1 | grep -o '[0-9]*')
fi

if [ -z "$REFRESH_TOKEN" ]; then
  echo -e "${RED}Could not extract refresh token from capture.${NC}"
  echo "The Zola app may not have made a refresh/login request."
  echo ""
  echo "Try again, or log out of the Zola app first, then re-run this script"
  echo "and log back in when the app opens."
  exit 1
fi

# Validate it's a JWT
if [[ ! "$REFRESH_TOKEN" == eyJ* ]]; then
  echo -e "${RED}Extracted token doesn't look like a JWT.${NC}"
  exit 1
fi

# Decode expiry
TOKEN_EXP=$(echo "$REFRESH_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('exp','unknown'))" 2>/dev/null || echo "unknown")
if [ "$TOKEN_EXP" != "unknown" ]; then
  EXP_DATE=$(date -r "$TOKEN_EXP" "+%Y-%m-%d" 2>/dev/null || echo "unknown")
else
  EXP_DATE="unknown"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Token captured!                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Refresh token: ${CYAN}${REFRESH_TOKEN:0:40}...${NC}"
echo -e "  Token expires: ${CYAN}${EXP_DATE}${NC}"
[ -n "$ACCOUNT_ID" ] && echo -e "  Account ID:    ${CYAN}${ACCOUNT_ID}${NC}"
echo ""

# Step 6: Save to .env
echo -e "${YELLOW}Step 6:${NC} Saving to ${ENV_FILE}..."

if [ -f "$ENV_FILE" ]; then
  # Update existing values
  if grep -q "^ZOLA_REFRESH_TOKEN=" "$ENV_FILE"; then
    sed -i '' "s|^ZOLA_REFRESH_TOKEN=.*|ZOLA_REFRESH_TOKEN=${REFRESH_TOKEN}|" "$ENV_FILE"
  else
    echo "ZOLA_REFRESH_TOKEN=${REFRESH_TOKEN}" >> "$ENV_FILE"
  fi
  if [ -n "$ACCOUNT_ID" ]; then
    if grep -q "^ZOLA_ACCOUNT_ID=" "$ENV_FILE"; then
      sed -i '' "s|^ZOLA_ACCOUNT_ID=.*|ZOLA_ACCOUNT_ID=${ACCOUNT_ID}|" "$ENV_FILE"
    else
      echo "ZOLA_ACCOUNT_ID=${ACCOUNT_ID}" >> "$ENV_FILE"
    fi
  fi
else
  # Create new .env
  cat > "$ENV_FILE" <<EOF
ZOLA_REFRESH_TOKEN=${REFRESH_TOKEN}
${ACCOUNT_ID:+ZOLA_ACCOUNT_ID=${ACCOUNT_ID}}
EOF
fi

echo ""
echo -e "${GREEN}Done! Your auth tokens are saved to ${ENV_FILE}${NC}"
echo ""
echo "You can also export them in your shell:"
echo ""
echo -e "  ${CYAN}export ZOLA_REFRESH_TOKEN=\"${REFRESH_TOKEN:0:40}...\"${NC}"
[ -n "$ACCOUNT_ID" ] && echo -e "  ${CYAN}export ZOLA_ACCOUNT_ID=\"${ACCOUNT_ID}\"${NC}"
echo ""
echo -e "Token is valid until ${CYAN}${EXP_DATE}${NC}. Re-run this script to refresh."
