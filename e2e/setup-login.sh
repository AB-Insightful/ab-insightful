#!/bin/bash
# Launch a real Chrome instance for Shopify login.
#
# ChromeDriver-launched Chrome always has navigator.webdriver=true,
# which hCaptcha detects and blocks. This script launches Chrome
# normally with remote debugging enabled so Selenium can connect
# to it after you've logged in.
#
# Usage:
#   1. Run this script:  npm run test:e2e:setup
#   2. Chrome opens — log in to your Shopify dev store admin
#   3. Once you see the admin dashboard, leave the browser open
#   4. In another terminal: npm run test:e2e:headed
#   5. Tests will connect to your running Chrome and save cookies
#   6. Close Chrome when done. Future runs use saved cookies headlessly.

# --- Find Chrome binary ---
find_chrome() {
  # Allow override via environment variable
  if [ -n "$CHROME_PATH" ]; then
    echo "$CHROME_PATH"
    return
  fi

  # macOS
  if [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    echo "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    return
  fi

  # Linux
  for cmd in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$cmd" &>/dev/null; then
      echo "$cmd"
      return
    fi
  done

  # Windows (Git Bash / WSL)
  for path in \
    "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"; do
    if [ -x "$path" ]; then
      echo "$path"
      return
    fi
  done

  return 1
}

CHROME_BIN=$(find_chrome)
if [ -z "$CHROME_BIN" ]; then
  echo "Error: Chrome not found. Set CHROME_PATH to your Chrome binary."
  echo "  Example: CHROME_PATH=/usr/bin/google-chrome npm run test:e2e:setup"
  exit 1
fi

PROFILE_DIR="/tmp/e2e-chrome-profile"
mkdir -p "$PROFILE_DIR"

# Read store URL from .env.e2e
STORE_URL=""
if [ -f .env.e2e ]; then
  STORE_URL=$(grep -E '^SHOPIFY_TEST_STORE_URL=' .env.e2e | cut -d'=' -f2 | tr -d '"' | tr -d "'")
fi

if [ -z "$STORE_URL" ]; then
  echo "Error: SHOPIFY_TEST_STORE_URL not found in .env.e2e"
  exit 1
fi

STORE_URL=$(echo "$STORE_URL" | sed 's|^https\?://||' | sed 's|/$||')
STORE_NAME=$(echo "$STORE_URL" | sed 's|\.myshopify\.com||')
ADMIN_URL="https://admin.shopify.com/store/${STORE_NAME}"

echo ""
echo "===== E2E Login Setup ====="
echo "Using Chrome: $CHROME_BIN"
echo "Opening with remote debugging on port 9222..."
echo ""
echo "Steps:"
echo "  1. Log in to Shopify in the browser window that opens"
echo "  2. Navigate to: ${ADMIN_URL}"
echo "  3. Once you see the admin dashboard, leave the browser open"
echo "  4. In another terminal, run: npm run test:e2e:headed"
echo ""

"$CHROME_BIN" \
  --remote-debugging-port=9222 \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  "${ADMIN_URL}" 2>/dev/null
