#!/usr/bin/env bash
#
# prepopulate-chart-times.sh — bulk-generate the chart-times static pages.
#
# Reads a normalized train list (see irctc-train-list.sh -n) and, for each train
# that isn't yet `completed`, requests its chart-times page with no journey date
# (GET <base>/chart-times/<trainNumber>). That request makes the app fetch the
# schedule + chart times and persist content/chart-times/<n>-<name>-chart-times.json,
# so the static SEO pages get warmed in bulk. Progress is written back to the JSON
# after every train, so the run is resumable — re-running skips completed trains.
# On success it also records the generated `slug` and `canonicalNumber` (the number
# the app actually used, leading zeros dropped) so tracking matches the filenames.
# Transient non-200s (IRCTC flakiness under load) are retried before giving up.
#
# Requires: jq, curl, and the web app running (default http://localhost:3010).
#
# Usage:
#   # 1) build the list (needs a fresh IRCTC cookie):
#   ./scripts/irctc-train-list.sh -n -o scripts/chart-times-trains.json
#   # 2) prepopulate the pages:
#   ./scripts/prepopulate-chart-times.sh
#   ./scripts/prepopulate-chart-times.sh -i scripts/chart-times-trains.json -u http://localhost:3010
#   ./scripts/prepopulate-chart-times.sh -d 2 -l 100   # 2s delay, only 100 this run
#   ./scripts/prepopulate-chart-times.sh --force       # re-warm even completed trains
#   ./scripts/prepopulate-chart-times.sh --fillup      # re-fetch only pages with missing chart times
#
# --fillup mode: instead of the train list, scan already-generated
# content/chart-times/*.json pages, find any with stations whose chart time is
# still unfound (chartTimeLocal == null), and force a fresh regeneration of those
# pages so the +1/-1-date fallback can fill the gaps. Local runs only (it reads
# and rewrites the local content dir, so point -u at a localhost web server).
#
# Options:
#   -i, --input FILE     train list JSON (default scripts/chart-times-trains.json)
#   -u, --base-url URL   web app base URL (default http://localhost:3010 or $BASE_URL)
#   -d, --delay SECONDS  pause between pages (default 1)
#   -l, --limit N        process at most N pages this run (default: all)
#   -r, --retries N      retry a non-200 up to N times (default 2)
#       --force          re-process trains already marked completed
#       --fillup         backfill missing chart times in existing content pages
#   -h, --help           show this help
#
# Exit codes: 0 ok, 1 bad usage/deps, 2 input missing/invalid.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT="$SCRIPT_DIR/chart-times-trains.json"
CONTENT_DIR="$SCRIPT_DIR/../content/chart-times"   # where the app persists pages (local runs)
BASE_URL="${BASE_URL:-http://localhost:3010}"
DELAY=1
LIMIT=0          # 0 => no limit
FORCE=0
FILLUP=0         # 1 => backfill missing chart times in existing content pages
RETRIES=2        # extra attempts on a non-200 (IRCTC schedule fetch is flaky under load)
RETRY_DELAY=4    # seconds between retries
REQ_TIMEOUT=180  # per-page generation can be slow (per-station IRCTC fetches)

usage() { sed -n '2,/^$/p' "$0" | sed 's/^#\{1,\} \{0,1\}//; s/^#$//'; exit "${1:-1}"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--input)    INPUT="${2:-}"; shift 2 ;;
    -u|--base-url) BASE_URL="${2:-}"; shift 2 ;;
    -d|--delay)    DELAY="${2:-1}"; shift 2 ;;
    -l|--limit)    LIMIT="${2:-0}"; shift 2 ;;
    -r|--retries)  RETRIES="${2:-2}"; shift 2 ;;
    --force)       FORCE=1; shift ;;
    --fillup)      FILLUP=1; shift ;;
    -h|--help)     usage 0 ;;
    *) echo "Unknown argument: $1" >&2; usage 1 ;;
  esac
done

command -v jq   >/dev/null 2>&1 || { echo "Error: jq is required." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "Error: curl is required." >&2; exit 1; }
BASE_URL="${BASE_URL%/}"

# Warm a chart-times URL, retrying transient non-200s; echoes the final HTTP code.
warm() {
  local url="$1" code=000 attempt=0
  while :; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$REQ_TIMEOUT" "$url" || echo 000)"
    [[ "$code" == "200" ]] && break
    [[ "$attempt" -ge "$RETRIES" ]] && break
    attempt=$((attempt + 1))
    sleep "$RETRY_DELAY"
  done
  printf '%s' "$code"
}

# Resolve the generated content file for a (possibly zero-padded) train number.
find_content_file() {
  local num="$1" bare cand f
  bare="$(printf '%s' "$num" | sed 's/^0\{1,\}//')"
  for cand in "$num" "$bare"; do
    f="$(ls "$CONTENT_DIR/${cand}-"*-chart-times.json 2>/dev/null | head -n1 || true)"
    [[ -n "$f" ]] && { printf '%s' "$f"; return 0; }
  done
  return 1
}

# --fillup: re-fetch only pages that still have unfound chart times.
if [[ "$FILLUP" -eq 1 ]]; then
  [[ -d "$CONTENT_DIR" ]] || { echo "Error: no content dir at $CONTENT_DIR" >&2; exit 2; }
  echo "Fillup: scanning $CONTENT_DIR for pages with missing chart times… (target $BASE_URL, delay ${DELAY}s)" >&2
  incomplete=0 improved=0 filled=0 still=0
  shopt -s nullglob
  for f in "$CONTENT_DIR"/*-chart-times.json; do
    missing="$(jq '[.stations[]? | select(.chartTimeLocal == null)] | length' "$f" 2>/dev/null || echo 0)"
    [[ "$missing" =~ ^[0-9]+$ ]] || continue
    [[ "$missing" -eq 0 ]] && continue   # already complete — skip
    incomplete=$((incomplete + 1))
    if [[ "$LIMIT" -gt 0 && "$incomplete" -gt "$LIMIT" ]]; then
      echo "Reached limit of $LIMIT pages; stopping (resumable)." >&2
      incomplete=$((incomplete - 1)); break
    fi
    before="$(jq '.knownChartCount // 0' "$f")"
    num="$(jq -r '.trainNumber // ""' "$f")"
    if ! [[ "$num" =~ ^[0-9]{3,6}$ ]]; then
      echo "[fillup] skip $(basename "$f") (no train number)" >&2
      continue
    fi
    # Force a fresh regeneration so the +1/-1-date fallback can find chart times
    # the original run missed — but NON-DESTRUCTIVELY: back the page up first and
    # only keep the regenerated version if it is not worse (guards against the
    # backend being down/flaky, which would otherwise wipe good data).
    bak="${f}.fillup.bak"
    mv "$f" "$bak"
    code="$(warm "$BASE_URL/chart-times/$num")"
    newf="$(find_content_file "$num" || true)"
    after=0; nowmissing="?"
    if [[ -n "$newf" ]]; then
      after="$(jq '.knownChartCount // 0' "$newf")"
      nowmissing="$(jq '[.stations[]? | select(.chartTimeLocal == null)] | length' "$newf")"
    fi
    if [[ "$after" =~ ^[0-9]+$ && "$after" -ge "$before" && ("$after" -gt 0 || "$before" -eq 0) ]]; then
      # Keep the regenerated page (same or better); drop the backup.
      rm -f "$bak"
      [[ "$after" -gt "$before" ]] && improved=$((improved + 1))
      if [[ "$nowmissing" == "0" ]]; then filled=$((filled + 1)); else still=$((still + 1)); fi
      printf '[fillup] %s  known %s->%s, missing %s->%s (HTTP %s) kept\n' "$num" "$before" "$after" "$missing" "$nowmissing" "$code" >&2
    else
      # Regeneration was worse/empty — revert to the original page.
      [[ -n "$newf" && "$newf" != "$bak" ]] && rm -f "$newf"
      mv "$bak" "$f"
      still=$((still + 1))
      printf '[fillup] %s  known %s (regen %s) — reverted, kept original (HTTP %s)\n' "$num" "$before" "$after" "$code" >&2
    fi
    [[ "$DELAY" != "0" ]] && sleep "$DELAY" || true
  done
  shopt -u nullglob
  echo "Fillup done. incomplete_pages=$incomplete improved=$improved fully_filled=$filled still_missing=$still" >&2
  exit 0
fi

[[ -f "$INPUT" ]] || { echo "Error: input not found: $INPUT" >&2; echo "Build it first: ./scripts/irctc-train-list.sh -n -o $INPUT" >&2; exit 2; }
jq -e 'type == "array"' "$INPUT" >/dev/null 2>&1 || { echo "Error: $INPUT is not a JSON array." >&2; exit 2; }

total="$(jq 'length' "$INPUT")"
already="$(jq '[.[] | select(.completed == true)] | length' "$INPUT")"
echo "Input: $INPUT ($total trains, $already already completed)" >&2
echo "Target: $BASE_URL/chart-times/<trainNumber>  (delay ${DELAY}s, limit ${LIMIT:-all}, force=$FORCE)" >&2

# Indices to process this run (read into an array portably; macOS bash 3.2 has no mapfile).
IDX=()
if [[ "$FORCE" -eq 1 ]]; then
  JQ_SELECT='to_entries[].key'
else
  JQ_SELECT='to_entries[] | select(.value.completed != true) | .key'
fi
while IFS= read -r _key; do
  [[ -n "$_key" ]] && IDX+=("$_key")
done < <(jq -r "$JQ_SELECT" "$INPUT")

if [[ "${#IDX[@]}" -eq 0 ]]; then
  echo "Nothing to do — all trains already completed (use --force to re-run)." >&2
  exit 0
fi

processed=0 ok=0 failed=0
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT

for i in "${IDX[@]}"; do
  if [[ "$LIMIT" -gt 0 && "$processed" -ge "$LIMIT" ]]; then
    echo "Reached limit of $LIMIT; stopping (resumable)." >&2
    break
  fi
  num="$(jq -r ".[$i].trainNumber" "$INPUT")"
  name="$(jq -r ".[$i].trainName // \"\"" "$INPUT")"
  [[ "$num" =~ ^[0-9]{3,6}$ ]] || { echo "skip[$i]: bad trainNumber '$num'" >&2; continue; }

  # Warm by the train number from the list (the IRCTC schedule lookup may need the
  # zero-padded form, so we don't strip it). The page resolves schedule + chart
  # times and writes content/chart-times/<canonical>-<name>-chart-times.json, where
  # <canonical> is the number the API returns (often without leading zeros).
  # The IRCTC schedule fetch is flaky under load, so retry a non-200 a few times.
  code="$(warm "$BASE_URL/chart-times/$num")"

  processed=$((processed + 1))
  if [[ "$code" == "200" ]]; then
    status="ok"; ok=$((ok + 1))
    # Find the file the app actually wrote so tracking lines up with the filename,
    # even when the canonical number drops leading zeros (00961 -> 961-...json).
    f="$(find_content_file "$num" || true)"
    slug=""
    [[ -n "$f" ]] && slug="$(basename "$f" .json)"
    if [[ -n "$slug" ]]; then
      canonical="${slug%%-*}"
      jq --arg s "$slug" --arg c "$canonical" \
        ".[$i].completed = true | .[$i].httpStatus = 200 | .[$i].slug = \$s | .[$i].canonicalNumber = \$c" \
        "$INPUT" > "$tmp" && mv "$tmp" "$INPUT"
    else
      jq ".[$i].completed = true | .[$i].httpStatus = 200" "$INPUT" > "$tmp" && mv "$tmp" "$INPUT"
    fi
  else
    status="failed($code)"; failed=$((failed + 1))
    jq ".[$i].completed = false | .[$i].httpStatus = ($code | tonumber? // 0)" "$INPUT" > "$tmp" && mv "$tmp" "$INPUT"
  fi
  printf '[%d/%d] %s %-7s %s\n' "$processed" "${#IDX[@]}" "$num" "$status" "$name" >&2

  [[ "$DELAY" != "0" ]] && sleep "$DELAY" || true
done

echo "Done. processed=$processed ok=$ok failed=$failed (progress saved to $INPUT)" >&2
