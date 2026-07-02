#!/usr/bin/env bash
#
# Trigger the best-seats cache cron on demand via the admin endpoint
# (POST /api/admin/best-seats-cron/run). Runs the exact cron refresh logic once,
# bypassing the 5-min schedule, the NODE_ENV=development gate, and the leader
# lease — so it works against a locally-running backend to populate route_caching.
#
# The run is SYNCHRONOUS and can take several minutes (full best-train scans for
# every due route x date). Only combos missing or older than BEST_SEATS_REFRESH_MS
# are refreshed; to force-refresh everything, start the backend with
# BEST_SEATS_REFRESH_MS=1.
#
# Auth: BEST_SEATS_CRON_API_KEY, sent as the x-api-key header. The key is read
# from (in order): $1, $BEST_SEATS_CRON_API_KEY, backend/.env.
#
# Usage:
#   scripts/run-best-seats-cron.sh
#   scripts/run-best-seats-cron.sh <api-key>
#   BASE_URL=https://backend-production-11a50.up.railway.app scripts/run-best-seats-cron.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3009}"
ENDPOINT="$BASE_URL/api/admin/best-seats-cron/run"
TIMEOUT="${TIMEOUT:-1800}" # seconds; a full refresh wave is slow

# Resolve the repo root relative to this script so backend/.env is found from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

read_key_from_env_file() {
  local file="$1"
  [ -f "$file" ] || return 1
  grep -E '^[[:space:]]*BEST_SEATS_CRON_API_KEY[[:space:]]*=' "$file" \
    | tail -n1 \
    | sed -E 's/^[^=]*=//; s/^["'\'']//; s/["'\'']$//' \
    | tr -d '[:space:]'
}

KEY="${1:-${BEST_SEATS_CRON_API_KEY:-}}"
if [ -z "$KEY" ]; then
  KEY="$(read_key_from_env_file "$ROOT_DIR/backend/.env" || true)"
fi
if [ -z "$KEY" ]; then
  echo "No API key found." >&2
  echo "Pass it as an argument, set BEST_SEATS_CRON_API_KEY, or add it to backend/.env." >&2
  exit 1
fi

echo "POST $ENDPOINT"
echo "Triggering a cron refresh — synchronous, may take several minutes..."
start=$(date +%s)

# -w appends the HTTP status on its own line so we can separate body from code.
resp="$(curl -s -m "$TIMEOUT" -w $'\n%{http_code}' -X POST "$ENDPOINT" \
  -H "x-api-key: $KEY" || true)"

code="$(printf '%s' "$resp" | tail -n1)"
body="$(printf '%s' "$resp" | sed '$d')"
elapsed=$(( $(date +%s) - start ))

echo "HTTP $code (${elapsed}s)"
if command -v jq >/dev/null 2>&1 && printf '%s' "$body" | jq . >/dev/null 2>&1; then
  printf '%s' "$body" | jq .
else
  echo "$body"
fi

case "$code" in
  200) echo "Done. Verify with: scripts/check-best-seats-cache.sh" ;;
  401) echo "Unauthorized — check the API key / that BEST_SEATS_CRON_API_KEY is set on the server." >&2 ;;
  000) echo "No response — is the backend running at $BASE_URL?" >&2 ;;
  *)   echo "Unexpected status." >&2 ;;
esac
