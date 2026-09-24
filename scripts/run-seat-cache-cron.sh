#!/usr/bin/env bash
#
# Trigger the unified train seat availability cache cron on demand via the admin endpoint
# (POST /api/admin/seat-cache-cron/run).
#
# Usage:
#   scripts/run-seat-cache-cron.sh
#   scripts/run-seat-cache-cron.sh diwali
#   scripts/run-seat-cache-cron.sh diwali <api-key>
#   BASE_URL=https://api-v2.lastberth.com scripts/run-seat-cache-cron.sh diwali
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3009}"
ENDPOINT="$BASE_URL/api/admin/seat-cache-cron/run"
TIMEOUT="${TIMEOUT:-1800}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

CATEGORY="${1:-diwali}"
KEY="${2:-${SEAT_CACHE_CRON_API_KEY:-${BEST_SEATS_CRON_API_KEY:-${TRAIN_AVAILABILITY_CRON_API_KEY:-}}}}"

read_key_from_env_file() {
  local file="$1"
  [ -f "$file" ] || return 1
  grep -E '^[[:space:]]*(SEAT_CACHE_CRON_API_KEY|TRAIN_AVAILABILITY_CRON_API_KEY|BEST_SEATS_CRON_API_KEY)[[:space:]]*=' "$file" \
    | tail -n1 \
    | sed -E 's/^[^=]*=//; s/^["'\'']//; s/["'\'']$//' \
    | tr -d '[:space:]'
}

if [ -z "$KEY" ]; then
  KEY="$(read_key_from_env_file "$ROOT_DIR/backend/.env" || true)"
fi

echo "POST $ENDPOINT (category=${CATEGORY})"
echo "Triggering train availability cache refresh..."
start=$(date +%s)

BODY_DATA=""
if [ -n "$CATEGORY" ] && [ "$CATEGORY" != "ALL" ]; then
  BODY_DATA="{\"category\":\"$CATEGORY\"}"
fi

resp="$(curl -s -m "$TIMEOUT" -w $'\n%{http_code}' -X POST "$ENDPOINT" \
  ${KEY:+-H "x-api-key: $KEY"} \
  -H "Content-Type: application/json" \
  ${BODY_DATA:+-d "$BODY_DATA"} || true)"

code="$(printf '%s' "$resp" | tail -n1)"
body="$(printf '%s' "$resp" | sed '$d')"
elapsed=$(( $(date +%s) - start ))

echo "HTTP $code (${elapsed}s)"
if command -v jq >/dev/null 2>&1 && printf '%s' "$body" | jq . >/dev/null 2>&1; then
  printf '%s' "$body" | jq .
else
  echo "$body"
fi
