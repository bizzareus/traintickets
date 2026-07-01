#!/usr/bin/env bash
#
# Warm the best-seats route cache by driving the live "Find best tickets" compute
# endpoint (POST /api/booking-v2/best-trains/stream) for every curated popular
# route across today + the next 5 days. That endpoint persists the top result to
# route_caching on a full non-AC scan, so this does the same work the cron does —
# on demand, from a script.
#
# Resumable: before computing, it checks the cached read endpoint and SKIPS any
# route+date already in the DB, so re-running only fills the gaps (handy after a
# crash/restart). Failed scans are retried a few times with backoff.
#
# This is SLOW and hits IRCTC hard: each miss is a full multi-train scan (~1-3 min).
# Runs sequentially on purpose. After it finishes, run
# scripts/check-best-seats-cache.sh to see the HITs.
#
# Usage:
#   scripts/warm-best-seats-cache.sh
#   BASE_URL=http://localhost:3009 scripts/warm-best-seats-cache.sh
#   DAYS=2 scripts/warm-best-seats-cache.sh          # today + next 2 days only
#   ONLY=NDLS:MMCT scripts/warm-best-seats-cache.sh  # single route, all dates
#   FORCE=1 scripts/warm-best-seats-cache.sh         # re-warm even if cached
#   RETRIES=3 RETRY_SLEEP=10 scripts/warm-best-seats-cache.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3009}"
COMPUTE_ENDPOINT="$BASE_URL/api/booking-v2/best-trains/stream"
READ_ENDPOINT="$BASE_URL/api/booking-v2/best-trains/cached"
DAYS="${DAYS:-5}"
TZ_NAME="${TZ_NAME:-Asia/Kolkata}"
RETRIES="${RETRIES:-2}"       # extra attempts after the first, per route+date
RETRY_SLEEP="${RETRY_SLEEP:-5}"
FORCE="${FORCE:-}"            # set to any value to ignore the already-cached skip

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

# Is this route+date already cached? Echoes "yes" / "no" / "down" (backend
# unreachable). Uses the pure-read endpoint so it never triggers a compute.
is_cached() {
  local from="$1" to="$2" date="$3"
  local resp
  resp="$(curl -s -m 15 "$READ_ENDPOINT?from=$from&to=$to&date=$date" || true)"
  if [ -z "$resp" ]; then echo "down"; return; fi
  if [ "$HAVE_JQ" -eq 1 ]; then
    [ "$(printf '%s' "$resp" | jq -r '.cached // false' 2>/dev/null)" = "true" ] \
      && echo "yes" || echo "no"
  else
    case "$resp" in *'"cached":true'*) echo "yes" ;; *) echo "no" ;; esac
  fi
}

# One compute attempt. Echoes "ok:<train>" / "empty" / "fail:<reason>".
compute_once() {
  local from="$1" to="$2" date="$3"
  local body
  body="$(curl -s -m 600 -X POST "$COMPUTE_ENDPOINT" \
    -H 'Content-Type: application/json' \
    -d "{\"from\":\"$from\",\"to\":\"$to\",\"date\":\"$date\",\"acOnly\":false}" || true)"

  if [ -z "$body" ]; then echo "fail:no response (backend down?)"; return; fi

  if [ "$HAVE_JQ" -eq 1 ]; then
    local err_line result_line count top
    err_line="$(printf '%s\n' "$body" | jq -rc 'select(.type=="error") | .message' 2>/dev/null | tail -n1 || true)"
    result_line="$(printf '%s\n' "$body" | jq -c 'select(.type=="result")' 2>/dev/null | tail -n1 || true)"
    if [ -n "$err_line" ]; then echo "fail:$err_line"; return; fi
    if [ -n "$result_line" ]; then
      count="$(printf '%s' "$result_line" | jq -r '.data.results | length')"
      if [ "$count" -gt 0 ]; then
        top="$(printf '%s' "$result_line" | jq -r '.data.results[0].train.trainNumber + " " + (.data.results[0].train.trainName // "")')"
        echo "ok:$top ($count ranked)"
      else
        echo "empty"
      fi
      return
    fi
    echo "fail:no result line"
  else
    case "$body" in
      *'"type":"result"'*) echo "ok:cached" ;;
      *'"type":"error"'*)  echo "fail:error line" ;;
      *)                   echo "fail:no result line" ;;
    esac
  fi
}

total=$(( ${#ROUTES[@]} * (DAYS + 1) ))
n=0
ok=0
empty=0
failed=0
skipped=0

echo "Compute: $COMPUTE_ENDPOINT"
echo "Skip-if-cached via: $READ_ENDPOINT   (FORCE=1 to ignore)"
echo "Routes: ${#ROUTES[@]}   Dates: today + next $DAYS   (=$total)   retries=$RETRIES   TZ: $TZ_NAME"
echo

for i in $(seq 0 "$DAYS"); do
  DATE="$(date_ahead "$i")"
  for pair in "${ROUTES[@]}"; do
    from="${pair%%:*}"
    to="${pair##*:}"
    n=$((n + 1))
    printf '[%d/%d] %s -> %s (%s) ... ' "$n" "$total" "$from" "$to" "$DATE"

    if [ -z "$FORCE" ]; then
      case "$(is_cached "$from" "$to" "$DATE")" in
        yes) printf 'already cached, skip\n'; skipped=$((skipped + 1)); continue ;;
        down) printf 'SKIP CHECK FAILED (backend down?) — trying compute anyway\n' ;;
      esac
    fi

    attempt=0
    start=$(date +%s)
    while : ; do
      res="$(compute_once "$from" "$to" "$DATE")"
      case "$res" in
        ok:*)    printf 'cached top=%s (%ss)\n' "${res#ok:}" "$(( $(date +%s) - start ))"; ok=$((ok + 1)); break ;;
        empty)   printf 'cached (no confirmed train, %ss)\n' "$(( $(date +%s) - start ))"; empty=$((empty + 1)); break ;;
        fail:*)
          attempt=$((attempt + 1))
          if [ "$attempt" -le "$RETRIES" ]; then
            printf 'retry %d/%d after %ss (%s) ... ' "$attempt" "$RETRIES" "$RETRY_SLEEP" "${res#fail:}"
            sleep "$RETRY_SLEEP"
          else
            printf 'FAILED: %s (%ss, %d attempts)\n' "${res#fail:}" "$(( $(date +%s) - start ))" "$((attempt))"
            failed=$((failed + 1))
            break
          fi
          ;;
      esac
    done
  done
done

echo
printf 'Done: %d cached with train, %d cached empty, %d skipped (already cached), %d failed (of %d)\n' \
  "$ok" "$empty" "$skipped" "$failed" "$total"
echo 'Verify with: scripts/check-best-seats-cache.sh'
