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
#
# Options:
#   -i, --input FILE     train list JSON (default scripts/chart-times-trains.json)
#   -u, --base-url URL   web app base URL (default http://localhost:3010 or $BASE_URL)
#   -d, --delay SECONDS  pause between trains (default 1)
#   -l, --limit N        process at most N trains this run (default: all pending)
#       --force          re-process trains already marked completed
#   -h, --help           show this help
#
# Exit codes: 0 ok, 1 bad usage/deps, 2 input missing/invalid.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT="$SCRIPT_DIR/chart-times-trains.json"
BASE_URL="${BASE_URL:-http://localhost:3010}"
DELAY=1
LIMIT=0          # 0 => no limit
FORCE=0
REQ_TIMEOUT=180  # per-page generation can be slow (per-station IRCTC fetches)

usage() { sed -n '2,/^$/p' "$0" | sed 's/^#\{1,\} \{0,1\}//; s/^#$//'; exit "${1:-1}"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--input)    INPUT="${2:-}"; shift 2 ;;
    -u|--base-url) BASE_URL="${2:-}"; shift 2 ;;
    -d|--delay)    DELAY="${2:-1}"; shift 2 ;;
    -l|--limit)    LIMIT="${2:-0}"; shift 2 ;;
    --force)       FORCE=1; shift ;;
    -h|--help)     usage 0 ;;
    *) echo "Unknown argument: $1" >&2; usage 1 ;;
  esac
done

command -v jq   >/dev/null 2>&1 || { echo "Error: jq is required." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "Error: curl is required." >&2; exit 1; }
BASE_URL="${BASE_URL%/}"

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

  # Warm by train number; the page resolves the schedule + chart times and writes
  # the correctly-named content/chart-times/<num>-<name>-chart-times.json file.
  url="$BASE_URL/chart-times/$num"
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$REQ_TIMEOUT" "$url" || echo 000)"

  processed=$((processed + 1))
  if [[ "$code" == "200" ]]; then
    status="ok"; ok=$((ok + 1))
    jq ".[$i].completed = true | .[$i].httpStatus = 200" "$INPUT" > "$tmp" && mv "$tmp" "$INPUT"
  else
    status="failed($code)"; failed=$((failed + 1))
    jq ".[$i].completed = false | .[$i].httpStatus = ($code | tonumber? // 0)" "$INPUT" > "$tmp" && mv "$tmp" "$INPUT"
  fi
  printf '[%d/%d] %s %-7s %s\n' "$processed" "${#IDX[@]}" "$num" "$status" "$name" >&2

  [[ "$DELAY" != "0" ]] && sleep "$DELAY" || true
done

echo "Done. processed=$processed ok=$ok failed=$failed (progress saved to $INPUT)" >&2
