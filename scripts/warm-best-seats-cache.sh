#!/usr/bin/env bash
#
# Warm the best-seats route cache by driving the live "Find best tickets" compute
# endpoint (POST /api/booking-v2/best-trains/stream) for every curated popular
# route across today + the next 5 days. That endpoint now persists the top result
# to route_caching on a full non-AC scan, so this does the same work the cron
# does — on demand, from a script.
#
# This is SLOW and hits IRCTC hard: each route+date is a full multi-train scan
# (~1-3 min). Runs sequentially on purpose. 9 routes x 6 dates can take a while.
#
# After it finishes, run scripts/check-best-seats-cache.sh to see the HITs.
#
# Usage:
#   scripts/warm-best-seats-cache.sh
#   BASE_URL=http://localhost:3009 scripts/warm-best-seats-cache.sh
#   DAYS=2 scripts/warm-best-seats-cache.sh        # today + next 2 days only
#   ONLY=NDLS:MMCT scripts/warm-best-seats-cache.sh # single route, all dates
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3009}"
ENDPOINT="$BASE_URL/api/booking-v2/best-trains/stream"
DAYS="${DAYS:-5}"
TZ_NAME="${TZ_NAME:-Asia/Kolkata}"

ALL_ROUTES=(
  "NDLS:MMCT"  # Delhi -> Mumbai
  "NDLS:PNBE"  # Delhi -> Patna
  "MMCT:SBC"   # Mumbai -> Bengaluru
  "MAS:SBC"    # Chennai -> Bengaluru
  "HWH:NDLS"   # Kolkata -> Delhi
  "SBC:MAS"    # Bengaluru -> Chennai
  "NDLS:JAT"   # Delhi -> Jammu
  "MMCT:ADI"   # Mumbai -> Ahmedabad
  "NDLS:HWH"   # Delhi -> Kolkata
)

# Optional single-route override for a quick test.
if [ -n "${ONLY:-}" ]; then
  ROUTES=("$ONLY")
else
  ROUTES=("${ALL_ROUTES[@]}")
fi

HAVE_JQ=1
command -v jq >/dev/null 2>&1 || HAVE_JQ=0

date_ahead() {
  local i="$1"
  if date -v+1d >/dev/null 2>&1; then
    TZ="$TZ_NAME" date -v+"${i}"d +%Y-%m-%d          # macOS / BSD
  else
    TZ="$TZ_NAME" date -d "+${i} day" +%Y-%m-%d      # GNU / Linux
  fi
}

total=$(( ${#ROUTES[@]} * (DAYS + 1) ))
n=0
ok=0
empty=0
failed=0

echo "Warming via $ENDPOINT"
echo "Routes: ${#ROUTES[@]}   Dates: today + next $DAYS   (=$total scans)   TZ: $TZ_NAME"
echo "This is slow — each scan is a full multi-train IRCTC probe. Ctrl-C to stop."
echo

for i in $(seq 0 "$DAYS"); do
  DATE="$(date_ahead "$i")"
  for pair in "${ROUTES[@]}"; do
    from="${pair%%:*}"
    to="${pair##*:}"
    n=$((n + 1))
    start=$(date +%s)
    printf '[%d/%d] %s -> %s (%s) ... ' "$n" "$total" "$from" "$to" "$DATE"

    # The endpoint streams NDJSON; grab the whole body, then read the final
    # result line. No `trains` in the body -> the service fetches the list itself.
    body="$(curl -s -m 600 -X POST "$ENDPOINT" \
      -H 'Content-Type: application/json' \
      -d "{\"from\":\"$from\",\"to\":\"$to\",\"date\":\"$DATE\",\"acOnly\":false}" || true)"

    elapsed=$(( $(date +%s) - start ))

    if [ -z "$body" ]; then
      printf 'FAILED (no response, %ss)\n' "$elapsed"
      failed=$((failed + 1))
      continue
    fi

    if [ "$HAVE_JQ" -eq 1 ]; then
      # Last "result" line, if any.
      result_line="$(printf '%s\n' "$body" | jq -c 'select(.type=="result")' 2>/dev/null | tail -n1 || true)"
      err_line="$(printf '%s\n' "$body" | jq -rc 'select(.type=="error") | .message' 2>/dev/null | tail -n1 || true)"
      if [ -n "$err_line" ]; then
        printf 'ERROR: %s (%ss)\n' "$err_line" "$elapsed"
        failed=$((failed + 1))
      elif [ -n "$result_line" ]; then
        count="$(printf '%s' "$result_line" | jq -r '.data.results | length')"
        if [ "$count" -gt 0 ]; then
          top="$(printf '%s' "$result_line" | jq -r '.data.results[0].train.trainNumber + " " + (.data.results[0].train.trainName // "")')"
          printf 'cached top=%s (%d ranked, %ss)\n' "$top" "$count" "$elapsed"
          ok=$((ok + 1))
        else
          printf 'cached (no confirmed train, %ss)\n' "$elapsed"
          empty=$((empty + 1))
        fi
      else
        printf 'done (no result line, %ss)\n' "$elapsed"
        failed=$((failed + 1))
      fi
    else
      case "$body" in
        *'"type":"result"'*) printf 'cached (%ss)\n' "$elapsed"; ok=$((ok + 1)) ;;
        *'"type":"error"'*)  printf 'ERROR (%ss)\n' "$elapsed"; failed=$((failed + 1)) ;;
        *)                   printf 'done (%ss)\n' "$elapsed"; failed=$((failed + 1)) ;;
      esac
    fi
  done
done

echo
printf 'Done: %d cached with train, %d cached empty, %d failed (of %d)\n' \
  "$ok" "$empty" "$failed" "$total"
echo 'Verify with: scripts/check-best-seats-cache.sh'
