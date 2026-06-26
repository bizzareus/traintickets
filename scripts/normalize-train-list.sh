#!/usr/bin/env bash
#
# normalize-train-list.sh — repair a raw/partial IRCTC train list into proper JSON.
#
# Accepts any of:
#   * a valid JSON array of "12952 - NAME" strings or {trainNumber,trainName} objects
#   * a BARE comma-separated list of "12952 - NAME" strings (missing the [ ] wrapper)
#   * those wrapped under .trainList / .data.trainList
#
# Emits a normalized array ready for prepopulate-chart-times.sh:
#   [ { "trainNumber": "12952", "trainName": "MUMBAI RAJDHANI", "completed": false }, ... ]
#
# If the input objects already carry `completed` / `httpStatus`, those are
# PRESERVED, so re-normalizing a partially-processed list keeps its progress.
# Dedupes by train number and drops anything without a 3-6 digit number.
#
# Usage:
#   ./scripts/normalize-train-list.sh                         # in place on scripts/chart-times-trains.json
#   ./scripts/normalize-train-list.sh -i raw.json -o out.json
#   ./scripts/normalize-train-list.sh -i raw.json             # in place on raw.json
#
# Exit codes: 0 ok, 1 bad usage/deps, 2 input missing/unrepairable.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT="$SCRIPT_DIR/chart-times-trains.json"
OUTPUT=""   # empty => overwrite INPUT in place

usage() { sed -n '2,/^$/p' "$0" | sed 's/^#\{1,\} \{0,1\}//; s/^#$//'; exit "${1:-1}"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--input)  INPUT="${2:-}"; shift 2 ;;
    -o|--output) OUTPUT="${2:-}"; shift 2 ;;
    -h|--help)   usage 0 ;;
    *) echo "Unknown argument: $1" >&2; usage 1 ;;
  esac
done

command -v jq >/dev/null 2>&1 || { echo "Error: jq is required." >&2; exit 1; }
[[ -f "$INPUT" ]] || { echo "Error: input not found: $INPUT" >&2; exit 2; }
[[ -n "$OUTPUT" ]] || OUTPUT="$INPUT"

# Produce valid JSON text in $json: use the file as-is if it already parses,
# otherwise strip a trailing comma/whitespace and wrap it in [ ] and retry.
if jq -e . "$INPUT" >/dev/null 2>&1; then
  json="$(cat "$INPUT")"
else
  trimmed="$(sed -e 's/[[:space:],]*$//' "$INPUT")"
  json="[${trimmed}]"
  if ! printf '%s' "$json" | jq -e . >/dev/null 2>&1; then
    echo "Error: could not repair $INPUT into valid JSON (not a JSON array and not a bare comma-separated list)." >&2
    exit 2
  fi
  echo "Note: input was a bare comma-separated list — wrapped it in [ ] to repair." >&2
fi

NORMALIZE_JQ='
def to_entry:
  if type == "string" then
    (capture("^\\s*(?<num>\\d{3,6})\\s*[-:]?\\s*(?<name>.*)$") // {num:"", name:.})
    | { trainNumber: .num, trainName: (.name | gsub("^\\s+|\\s+$";"")), completed: false }
  elif type == "object" then
    ( { trainNumber: ((.trainNumber // .trainNo // .train_no // .number // "") | tostring),
        trainName:   ((.trainName  // .name   // .train_name // "") | tostring),
        completed:   (.completed // false) }
      + (if (.httpStatus // null) != null then { httpStatus: .httpStatus } else {} end) )
  else empty end;
(.trainList? // .data?.trainList? // .)
| (if type == "array" then . else [.] end)
| map(to_entry)
| map(select(.trainNumber | test("^[0-9]{3,6}$")))
| unique_by(.trainNumber)
'

tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
printf '%s' "$json" | jq "$NORMALIZE_JQ" > "$tmp"
count="$(jq 'length' "$tmp")"
mv "$tmp" "$OUTPUT"
echo "Wrote $count trains to $OUTPUT" >&2
