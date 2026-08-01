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
#   ./scripts/prepopulate-chart-times.sh -t 12952      # (re)populate only train 12952
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
#   -t, --train NUMBER   (re)populate only this train number, then exit
#   -p, --prefix PREFIX  prioritize train numbers starting with PREFIX first (default 12)
#       --force          re-process trains already marked completed
#       --fillup         backfill missing chart times in existing content pages
#       --include-spl    also process SPL / Special trains (skipped by default)
#   -h, --help           show this help
#
# By default SPL / Special trains (name contains "SPL" or "Special") are skipped —
# they have no useful chart vacancy data. Pass --include-spl to process them.
#
# Pruning: in the normal (list) mode, trains that are skipped for being special,
# have an invalid train number, or fail to generate (non-200 after retries) are
# REMOVED from the input JSON, so the list shrinks to only real, working trains.
# (Does not apply to --fillup or --train modes.)
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
TRAIN=""         # when set, (re)populate only this train number and exit
PREFIX="12"      # prioritize train numbers starting with this prefix first
SKIP_SPECIAL=1   # 1 => skip SPL / Special trains (no useful chart data); --include-spl to process them
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
    -t|--train)    TRAIN="${2:-}"; shift 2 ;;
    -p|--prefix)   PREFIX="${2:-12}"; shift 2 ;;
    --force)       FORCE=1; shift ;;
    --fillup)      FILLUP=1; shift ;;
    --include-spl) SKIP_SPECIAL=0; shift ;;
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

# True (0) when a train name marks a special train (SPL / Special) — these have
# no useful chart vacancy data, so we skip them unless --include-spl is passed.
is_special() {
  local lc
  lc="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$lc" in
    *spl*|*special*) return 0 ;;
    *) return 1 ;;
  esac
}

# --train: (re)populate only one train, then exit. Force-regenerates the page
# (back up + restore-if-worse, so a down/flaky backend can't wipe good data).
# Bypasses the train list and the SPL/Special skip (the train was named explicitly).
if [[ -n "$TRAIN" ]]; then
  [[ "$TRAIN" =~ ^[0-9]{3,6}$ ]] || { echo "Error: --train must be a 3-6 digit number" >&2; exit 1; }
  echo "Repopulating chart-times for train $TRAIN (target $BASE_URL)…" >&2
  existing="$(find_content_file "$TRAIN" || true)"
  before=0
  bak=""
  if [[ -n "$existing" ]]; then
    before="$(jq '.knownChartCount // 0' "$existing")"
    bak="${existing}.repop.bak"
    mv "$existing" "$bak"
  fi
  code="$(warm "$BASE_URL/chart-times/$TRAIN")"
  newf="$(find_content_file "$TRAIN" || true)"
  after=0
  [[ -n "$newf" ]] && after="$(jq '.knownChartCount // 0' "$newf")"
  if [[ "$code" == "200" && "$after" =~ ^[0-9]+$ && "$after" -ge "$before" ]]; then
    [[ -n "$bak" ]] && rm -f "$bak"
    echo "Done. train=$TRAIN known ${before}->${after} (HTTP $code) -> ${newf:-<no file written>}" >&2
    exit 0
  fi
  # Regeneration was worse/empty/failed — restore the original page if we had one.
  [[ -n "$newf" && -n "$bak" && "$newf" != "$bak" ]] && rm -f "$newf"
  [[ -n "$bak" ]] && mv "$bak" "$existing"
  echo "Kept original for train=$TRAIN (regen known=$after vs before=$before, HTTP $code)" >&2
  exit 0
fi

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
    fname="$(jq -r '.trainName // ""' "$f")"
    if ! [[ "$num" =~ ^[0-9]{3,6}$ ]]; then
      echo "[fillup] skip $(basename "$f") (no train number)" >&2
      continue
    fi
    if [[ "$SKIP_SPECIAL" -eq 1 ]] && is_special "$fname"; then
      incomplete=$((incomplete - 1))
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
echo "Input: $INPUT ($total trains in list, $already marked completed in JSON)" >&2
echo "Target: $BASE_URL/chart-times/<trainNumber>  (delay ${DELAY}s, limit ${LIMIT:-all}, force=$FORCE, prefix=$PREFIX)" >&2

# Identify train numbers that ALREADY have fully valid chart times in content dir
complete_nums=""
if [[ -d "$CONTENT_DIR" ]]; then
  shopt -s nullglob
  files=("$CONTENT_DIR"/*-chart-times.json)
  shopt -u nullglob
  if [[ ${#files[@]} -gt 0 ]]; then
    complete_nums="$(jq -r 'select((.knownChartCount // 0) > 0 and ([.stations[]? | select(.chartTimeLocal == null)] | length) == 0) | (.trainNumber|tostring)' "${files[@]}" 2>/dev/null || true)"
  fi
fi

# Snapshot the candidate trains to process this run into parallel arrays (number + name).
# Candidates are filtered for missing chart times (unless --force) and sorted so that
# train numbers starting with $PREFIX (default 12) are processed FIRST.
# We iterate the snapshot — not live array indices — because special/failed
# trains get REMOVED from $INPUT mid-loop, which would shift positional indices.
NUMS=(); NAMES=()
if [[ "$FORCE" -eq 1 ]]; then
  JQ_FILTER='
    .[] |
    (.trainNumber | tostring) as $num |
    ($num | sub("^0+"; "")) as $bare |
    (if ($num | startswith($prefix)) or ($bare | startswith($prefix)) then 0 else 1 end) as $prio |
    {num: $num, name: (.trainName // ""), prio: $prio}
  '
else
  JQ_FILTER='
    ($complete | split("\n") | map(select(length > 0)) | map({key: ., value: true}) | from_entries) as $complete_set |
    .[] |
    (.trainNumber | tostring) as $num |
    ($num | sub("^0+"; "")) as $bare |
    (($complete_set | has($num)) or ($complete_set | has($bare))) as $is_complete |
    select(($is_complete | not) or (.completed != true)) |
    (if ($num | startswith($prefix)) or ($bare | startswith($prefix)) then 0 else 1 end) as $prio |
    {num: $num, name: (.trainName // ""), prio: $prio}
  '
fi

while IFS=$'\t' read -r _num _name; do
  [[ -n "$_num" ]] && { NUMS+=("$_num"); NAMES+=("$_name"); }
done < <(jq -r --arg prefix "$PREFIX" --arg complete "$complete_nums" "$JQ_FILTER" "$INPUT" | jq -r -s 'sort_by(.prio) | .[] | [(.num|tostring), (.name // "")] | @tsv')

if [[ "${#NUMS[@]}" -eq 0 ]]; then
  echo "Nothing to do — all trains already have chart times added (use --force to re-run)." >&2
  exit 0
fi
echo "Found ${#NUMS[@]} candidate trains missing complete chart times (prioritizing prefix '$PREFIX' first)." >&2

tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT

# Drop every entry with this train number from the input list (in place, resumable).
remove_train() {
  jq --arg n "$1" 'map(select((.trainNumber|tostring) != $n))' "$INPUT" > "$tmp" && mv "$tmp" "$INPUT"
}

processed=0 ok=0 failed=0 removed=0 special=0 bad=0
count="${#NUMS[@]}"

for ((j = 0; j < count; j++)); do
  if [[ "$LIMIT" -gt 0 && "$processed" -ge "$LIMIT" ]]; then
    echo "Reached limit of $LIMIT; stopping (resumable)." >&2
    break
  fi
  num="${NUMS[$j]}"; name="${NAMES[$j]}"

  # Invalid train number — junk that can never generate a page; drop it.
  if ! [[ "$num" =~ ^[0-9]{3,6}$ ]]; then
    echo "[$num] removed (bad trainNumber)" >&2
    remove_train "$num"; removed=$((removed + 1)); bad=$((bad + 1)); continue
  fi
  # Special train (no useful chart data) — remove it (unless --include-spl).
  if [[ "$SKIP_SPECIAL" -eq 1 ]] && is_special "$name"; then
    echo "[$num] removed (special train '$name')" >&2
    remove_train "$num"; removed=$((removed + 1)); special=$((special + 1)); continue
  fi

  # Warm by the train number from the list (the IRCTC schedule lookup may need the
  # zero-padded form, so we don't strip it). The page resolves schedule + chart
  # times and writes content/chart-times/<canonical>-<name>-chart-times.json, where
  # <canonical> is the number the API returns (often without leading zeros).
  # The IRCTC schedule fetch is flaky under load, so retry a non-200 a few times.
  code="$(warm "$BASE_URL/chart-times/$num")"
  processed=$((processed + 1))

  if [[ "$code" == "200" ]]; then
    ok=$((ok + 1))
    # Find the file the app actually wrote so tracking lines up with the filename,
    # even when the canonical number drops leading zeros (00961 -> 961-...json).
    f="$(find_content_file "$num" || true)"
    slug=""
    [[ -n "$f" ]] && slug="$(basename "$f" .json)"
    if [[ -n "$slug" ]]; then
      canonical="${slug%%-*}"
      jq --arg n "$num" --arg s "$slug" --arg c "$canonical" \
        'map(if (.trainNumber|tostring) == $n then .completed = true | .httpStatus = 200 | .slug = $s | .canonicalNumber = $c else . end)' \
        "$INPUT" > "$tmp" && mv "$tmp" "$INPUT"
    else
      jq --arg n "$num" \
        'map(if (.trainNumber|tostring) == $n then .completed = true | .httpStatus = 200 else . end)' \
        "$INPUT" > "$tmp" && mv "$tmp" "$INPUT"
    fi
    printf '[%d/%d] %s ok             %s\n' "$processed" "$count" "$num" "$name" >&2
  else
    # Failed after retries — remove from the list per request.
    remove_train "$num"; failed=$((failed + 1)); removed=$((removed + 1))
    printf '[%d/%d] %s removed(failed %s) %s\n' "$processed" "$count" "$num" "$code" "$name" >&2
  fi

  [[ "$DELAY" != "0" ]] && sleep "$DELAY" || true
done

echo "Done. processed=$processed ok=$ok removed=$removed (special=$special, failed=$failed, bad=$bad) — saved to $INPUT" >&2
