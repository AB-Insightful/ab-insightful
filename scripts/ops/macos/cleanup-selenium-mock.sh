#!/usr/bin/env bash
#
# cleanup-selenium-mock.sh
#
# Kills the process tree started by `npm run test:selenium:mock` on macOS.
# It first tries to find wrapper processes (`runSeleniumMock.mjs`) and kill their
# entire descendants. If that fails, it falls back to killing processes matching
# common patterns for:
# - `shopify app dev`
# - `@getverdict/mock-bridge`
# - `vitest run -c vitest.selenium.config.js` / `vitest.selenium`
# - Selenium/ChromeDriver
#
# Usage:
#   ./cleanup-selenium-mock.sh [--force] [--dry-run]
#
# Verification checklist:
# After running `npm run test:selenium:mock` (or after a failure/interrupt):
# 1) Confirm theme port is free (default is 9294):
#    lsof -i :9294
# 2) Confirm mock-bridge UI/admin port is free (often 3080):
#    lsof -i :3080
# 3) Confirm no lingering processes:
#    ps aux | rg -n "shopify app dev|mock-bridge|vitest run|runSeleniumMock\\.mjs|chromedriver" || true
#
# Match the Windows script's "stop on errors" behavior, but be tolerant of
# shells/platforms where `pipefail` isn't supported.
set -euo
set -o pipefail 2>/dev/null || true

FORCE=0
DRY_RUN=0

usage() {
  cat <<'EOF'
cleanup-selenium-mock.sh

Kills the process tree started by: npm run test:selenium:mock
(Shopify dev, mock-bridge, Vitest/Selenium/Chrome).

Usage:
  ./cleanup-selenium-mock.sh [--force] [--dry-run]

Options:
  --force     Do not prompt.
  --dry-run   Print what would be killed, but do not kill anything.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 2
      ;;
  esac
done

WrapperNeedle='node .*scripts/selenium/runSeleniumMock\.mjs'

prompt_yes_no() {
  local msg="$1"
  if [[ "$FORCE" -eq 1 ]]; then
    return 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 1
  fi

  read -r -p "$msg (y/N) " ans
  [[ "$ans" =~ ^([yY]|yes|YES)$ ]]
}

kill_pid_tree() {
  local root_pid="$1"
  local reason="$2"

  echo "Killing PID tree: pid=$root_pid ($reason)"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi

  # Kill deepest children first (post-order-ish).
  # We loop until no more descendants remain.
  while :; do
    local descendants
    descendants="$(pgrep -P "$root_pid" || true)"
    if [[ -z "$descendants" ]]; then
      break
    fi
    # Kill children found this iteration.
    for c in $descendants; do
      if [[ "$FORCE" -eq 1 ]]; then
        kill -9 "$c" 2>/dev/null || true
      else
        kill -15 "$c" 2>/dev/null || true
      fi
    done
    sleep 0.5
  done

  if [[ "$FORCE" -eq 1 ]]; then
    kill -9 "$root_pid" 2>/dev/null || true
  else
    kill -15 "$root_pid" 2>/dev/null || true
  fi
}

wrapper_pids="$(pgrep -f "$WrapperNeedle" || true)"

if [[ -n "$wrapper_pids" ]]; then
  count="$(echo "$wrapper_pids" | wc -w | tr -d ' ')"
  echo "Found wrapper process(es):"
  for pid in $wrapper_pids; do
    echo "  - $pid"
  done

  if prompt_yes_no "Kill $count wrapper PID(s) and their descendants?"; then
    for pid in $wrapper_pids; do
      kill_pid_tree "$pid" "wrapper $WrapperNeedle"
    done
  else
    echo "Skipped killing (user declined or DryRun)."
  fi
  exit 0
fi

echo "Wrapper not found. Falling back to pattern matches..."

patterns=(
  "shopify app dev"
  "@getverdict/mock-bridge"
  "vitest run -c vitest.selenium.config.js"
  "vitest.selenium"
  "chromedriver"
  "selenium-webdriver"
)

all_pids=()
for pat in "${patterns[@]}"; do
  pids="$(pgrep -f "$pat" || true)"
  if [[ -n "$pids" ]]; then
    for pid in $pids; do
      all_pids+=("$pid")
    done
  fi
done

if [[ ${#all_pids[@]} -eq 0 ]]; then
  echo "No matching processes found."
  exit 0
fi

# De-duplicate.
unique_pids="$(printf "%s\n" "${all_pids[@]}" | awk '!a[$0]++')"

echo "Found matching PIDs:"
echo "$unique_pids" | sed 's/^/  - /'

pid_count="$(echo "$unique_pids" | wc -l | tr -d ' ')"
if prompt_yes_no "Kill $pid_count matched PID(s)?"; then
  for pid in $unique_pids; do
    if [[ "$FORCE" -eq 1 ]]; then
      kill -9 "$pid" 2>/dev/null || true
    else
      kill -15 "$pid" 2>/dev/null || true
    fi
  done
else
  echo "Skipped killing (user declined or DryRun)."
fi

echo "Done."

