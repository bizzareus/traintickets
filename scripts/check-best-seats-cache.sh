#!/usr/bin/env bash
#
# Probe the best-seats route cache for all curated popular routes across
# today + the next 5 days (the set the cron keeps warm) and report HIT/MISS.
#
# Pure reads — this never populates the cache, it only inspects it.
#
# Usage:
#   scripts/check-best-seats-cache.sh
#   BASE_URL=http://localhost:3009 scripts/check-best-seats-cache.sh
#   DAYS=5 TZ_NAME=Asia/Kolkata scripts/check-best-seats-cache.sh
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3009}"
ENDPOINT="$BASE_URL/api/booking-v2/best-trains/cached"
# How many days ahead to check, in addition to today (0..DAYS => DAYS+1 dates).
DAYS="${DAYS:-5}"
# Timezone used to derive the dates — the cron keys dates in IST.
TZ_NAME="${TZ_NAME:-Asia/Kolkata}"

# from:to pairs, mirrored from lib/seo/routes-db.ts (getTopRoutes + STATIONS).
ROUTES=(
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

HAVE_JQ=1
command -v jq >/dev/null 2>&1 || HAVE_JQ=0

# Compute a YYYY-MM-DD date `i` days ahead. Supports macOS (date -v) and GNU date.
date_ahead() {
  local i="$1"
  if date -v+1d >/dev/null 2>&1; then
    TZ="$TZ_NAME" date -v+"${i}"d +%Y-%m-%d          # macOS / BSD
  else
    TZ="$TZ_NAME" date -d "+${i} day" +%Y-%m-%d      # GNU / Linux
  fi
}

hits=0
misses=0
errors=0

printf 'Probing %s\n' "$ENDPOINT"
printf 'Routes: %d   Dates: today + next %d   TZ: %s\n\n' "${#ROUTES[@]}" "$DAYS" "$TZ_NAME"

for i in $(seq 0 "$DAYS"); do
  DATE="$(date_ahead "$i")"
  printf '====== %s ======\n' "$DATE"
  for pair in "${ROUTES[@]}"; do
    from="${pair%%:*}"
    to="${pair##*:}"
    resp="$(curl -s -m 15 "$ENDPOINT?from=$from&to=$to&date=$DATE" || true)"

    if [ -z "$resp" ]; then
      printf '  %-5s -> %-5s  ERROR (no response)\n' "$from" "$to"
      errors=$((errors + 1))
      continue
    fi

    if [ "$HAVE_JQ" -eq 1 ]; then
      cached="$(printf '%s' "$resp" | jq -r '.cached // "err"' 2>/dev/null || echo err)"
    else
      # crude fallback without jq
      case "$resp" in
        *'"cached":true'*)  cached=true ;;
        *'"cached":false'*) cached=false ;;
        *)                  cached=err ;;
      esac
    fi

    case "$cached" in
      true)
        if [ "$HAVE_JQ" -eq 1 ]; then
          train="$(printf '%s' "$resp" | jq -r '.best.train.trainNumber + " " + (.best.train.trainName // "")')"
          fare="$(printf '%s' "$resp" | jq -r '.best.totalFare // "-"')"
          when="$(printf '%s' "$resp" | jq -r '.cachedAt')"
          printf '  %-5s -> %-5s  HIT  train %s  fare %s  (cachedAt %s)\n' "$from" "$to" "$train" "$fare" "$when"
        else
          printf '  %-5s -> %-5s  HIT\n' "$from" "$to"
        fi
        hits=$((hits + 1))
        ;;
      false)
        printf '  %-5s -> %-5s  miss\n' "$from" "$to"
        misses=$((misses + 1))
        ;;
      *)
        printf '  %-5s -> %-5s  ERROR: %s\n' "$from" "$to" "$resp"
        errors=$((errors + 1))
        ;;
    esac
  done
  echo
done

printf 'Summary: %d hit, %d miss, %d error (of %d)\n' \
  "$hits" "$misses" "$errors" "$(( ${#ROUTES[@]} * (DAYS + 1) ))"
