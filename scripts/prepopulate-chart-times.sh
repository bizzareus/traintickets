#!/usr/bin/env bash
#
# prepopulate-chart-times.sh — bulk-generate the chart-times static pages.
#
# Reads a normalized train list (see irctc-train-list.sh -n) and, for each train
# that isn't yet `completed`, requests its chart-times page with no journey date
# (GET <base>/chart-times/<trainNumber>). That request makes the app fetch the
# schedule + chart times and persist content/chart-times/<n>-<name>-chart-times.json,
# so the static SEO pages get warmed in bulk. Progress is journaled and merged into
# the JSON atomically and periodically (and on exit/interrupt), making runs fast
# and resumable — re-running skips completed trains without full-file rewrite thrashing.
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
#   ./scripts/prepopulate-chart-times.sh -c 4          # 4 concurrent workers
#   ./scripts/prepopulate-chart-times.sh --force       # re-warm even completed trains
#   ./scripts/prepopulate-chart-times.sh --fillup      # re-fetch only pages with missing chart times
#   ./scripts/prepopulate-chart-times.sh -t 12952 15674 # (re)populate specific train numbers
#
# --fillup mode: instead of the train list, scan already-generated
# content/chart-times/*.json pages, find any with stations whose chart time is
# still unfound (chartTimeLocal == null), and force a fresh regeneration of those
# pages so the +1/-1-date fallback can fill the gaps. Local runs only (it reads
# and rewrites the local content dir, so point -u at a localhost web server).
#
# Options:
#   -i, --input FILE         train list JSON (default scripts/chart-times-trains.json)
#   -u, --base-url URL       web app base URL (default http://localhost:3010 or $BASE_URL)
#   -d, --delay SECONDS      pause between pages per worker (default 1)
#   -c, --concurrency N      number of concurrent requests (default 1)
#   -l, --limit N            process at most N pages this run (default: all)
#   -r, --retries N          retry a non-200 up to N times (default 2)
#   -t, --train NUMBERS      (re)populate specific train number(s) (space/comma-separated), then exit
#   -p, --prefix PREFIX      prioritize train numbers starting with PREFIX first (default 12)
#       --force              re-process trains already marked completed
#       --fillup             backfill missing chart times in existing content pages
#       --include-spl        also process SPL / Special trains (skipped by default)
#   -h, --help               show this help
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
shopt -s nocasematch

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT="$SCRIPT_DIR/chart-times-trains.json"
CONTENT_DIR="$SCRIPT_DIR/../content/chart-times"   # where the app persists pages (local runs)
BASE_URL="${BASE_URL:-http://localhost:3010}"
DELAY=1
CONCURRENCY=1
LIMIT=0          # 0 => no limit
FORCE=0
FILLUP=0         # 1 => backfill missing chart times in existing content pages
TRAINS=()        # when non-empty, (re)populate only these train numbers and exit
PREFIX="12"      # prioritize train numbers starting with this prefix first
SKIP_SPECIAL=1   # 1 => skip SPL / Special trains (no useful chart data); --include-spl to process them
RETRIES=2        # extra attempts on a non-200 (IRCTC schedule fetch is flaky under load)
RETRY_DELAY=4    # seconds between retries
REQ_TIMEOUT=180  # per-page generation can be slow (per-station IRCTC fetches)
FLUSH_INTERVAL=10 # batch size for merging journal updates into input JSON

usage() { sed -n '2,/^$/p' "$0" | sed 's/^#\{1,\} \{0,1\}//; s/^#$//'; exit "${1:-1}"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--input)       INPUT="${2:-}"; shift 2 ;;
    -u|--base-url)    BASE_URL="${2:-}"; shift 2 ;;
    -d|--delay)       DELAY="${2:-1}"; shift 2 ;;
    -c|--concurrency) CONCURRENCY="${2:-1}"; shift 2 ;;
    -l|--limit)       LIMIT="${2:-0}"; shift 2 ;;
    -r|--retries)     RETRIES="${2:-2}"; shift 2 ;;
    -t|--train)
      shift
      local_found=0
      while [[ $# -gt 0 && ! "$1" =~ ^- ]]; do
        IFS=',' read -ra split_trains <<< "$1"
        for tr in "${split_trains[@]}"; do
          [[ -n "$tr" ]] && TRAINS+=("$tr") && local_found=1
        done
        shift
      done
      [[ "$local_found" -eq 1 ]] || { echo "Error: -t/--train requires at least one train number" >&2; exit 1; }
      ;;
    -p|--prefix)      PREFIX="${2:-12}"; shift 2 ;;
    --force)          FORCE=1; shift ;;
    --fillup)         FILLUP=1; shift ;;
    --include-spl)    SKIP_SPECIAL=0; shift ;;
    -h|--help)        usage 0 ;;
    *) echo "Unknown argument: $1" >&2; usage 1 ;;
  esac
done

command -v jq   >/dev/null 2>&1 || { echo "Error: jq is required." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "Error: curl is required." >&2; exit 1; }
[[ "$CONCURRENCY" =~ ^[1-9][0-9]*$ ]] || { echo "Error: --concurrency must be a positive integer." >&2; exit 1; }
BASE_URL="${BASE_URL%/}"

# Warm a chart-times URL, retrying transient non-200s; echoes the final HTTP code.
warm() {
  local url="$1" code="000" attempt=0
  while :; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --compressed --connect-timeout 10 --max-time "$REQ_TIMEOUT" "$url" 2>/dev/null || echo 000)"
    [[ "$code" == "200" ]] && break
    [[ "$attempt" -ge "$RETRIES" ]] && break
    attempt=$((attempt + 1))
    sleep "$RETRY_DELAY"
  done
  printf '%s' "$code"
}

# Resolve the generated content file for a (possibly zero-padded) train number (pure bash, 0 forks).
find_content_file() {
  local num="$1" cand f
  local bare="${num#"${num%%[!0]*}"}"
  [[ -z "$bare" ]] && bare="0"

  for cand in "$num" "$bare"; do
    for f in "$CONTENT_DIR/${cand}-"*-chart-times.json "$CONTENT_DIR/${cand}-chart-times.json"; do
      if [[ -f "$f" ]]; then
        printf '%s' "$f"
        return 0
      fi
    done
  done
  return 1
}

# True (0) when a train name marks a special train (SPL / Special) — pure bash, 0 forks.
is_special() {
  local name="$1"
  [[ "$name" == *spl* || "$name" == *special* ]]
}

# --train: (re)populate specified train number(s), then exit. Force-regenerates pages
# (back up + restore-if-worse, so a down/flaky backend can't wipe good data).
# Bypasses the train list and the SPL/Special skip (the trains were named explicitly).
if [[ "${#TRAINS[@]}" -gt 0 ]]; then
  total_trains="${#TRAINS[@]}"
  echo "Repopulating chart-times for $total_trains train(s): ${TRAINS[*]} (target $BASE_URL)…" >&2
  idx=0
  for tr in "${TRAINS[@]}"; do
    idx=$((idx + 1))
    if ! [[ "$tr" =~ ^[0-9]{3,6}$ ]]; then
      echo "[$idx/$total_trains] Error: '$tr' is not a valid 3-6 digit train number" >&2
      continue
    fi
    existing="$(find_content_file "$tr" || true)"
    before=0
    bak=""
    if [[ -n "$existing" ]]; then
      before="$(jq '.knownChartCount // 0' "$existing" 2>/dev/null || echo 0)"
      bak="${existing}.repop.bak"
      mv "$existing" "$bak"
    fi
    code="$(warm "$BASE_URL/chart-times/$tr")"
    newf="$(find_content_file "$tr" || true)"
    after=0
    [[ -n "$newf" && -f "$newf" ]] && after="$(jq '.knownChartCount // 0' "$newf" 2>/dev/null || echo 0)"
    if [[ "$code" == "200" && "$after" =~ ^[0-9]+$ && "$after" -ge "$before" ]]; then
      [[ -n "$bak" ]] && rm -f "$bak"
      echo "[$idx/$total_trains] Done. train=$tr known ${before}->${after} (HTTP $code) -> ${newf:-<no file written>}" >&2
    else
      # Regeneration was worse/empty/failed — restore the original page if we had one.
      [[ -n "$newf" && -n "$bak" && "$newf" != "$bak" ]] && rm -f "$newf"
      [[ -n "$bak" ]] && mv "$bak" "$existing"
      echo "[$idx/$total_trains] Kept original for train=$tr (regen known=$after vs before=$before, HTTP $code)" >&2
    fi
    if [[ "$idx" -lt "$total_trains" && "$DELAY" != "0" ]]; then
      sleep "$DELAY" || true
    fi
  done
  exit 0
fi

# --fillup: re-fetch only pages that still have unfound chart times (single-pass scan).
if [[ "$FILLUP" -eq 1 ]]; then
  [[ -d "$CONTENT_DIR" ]] || { echo "Error: no content dir at $CONTENT_DIR" >&2; exit 2; }
  echo "Fillup: scanning $CONTENT_DIR for pages with missing chart times… (target $BASE_URL, delay ${DELAY}s)" >&2

  shopt -s nullglob
  files=("$CONTENT_DIR"/*-chart-times.json)
  shopt -u nullglob
  [[ ${#files[@]} -eq 0 ]] && { echo "No chart-times JSON files found in $CONTENT_DIR." >&2; exit 0; }

  # Single-pass scan to find all incomplete pages in <1s across thousands of files
  raw_candidates="$(jq -r '
    select(
      (.trainNumber != null) and
      ((.knownChartCount // 0) == 0 or ([.stations[]? | select(.chartTimeLocal == null)] | length) > 0)
    ) |
    [
      (.trainNumber|tostring),
      (.trainName // ""),
      ((.knownChartCount // 0)|tostring),
      (([.stations[]? | select(.chartTimeLocal == null)] | length)|tostring),
      input_filename
    ] | @tsv
  ' "${files[@]}" 2>/dev/null || true)"

  if [[ -z "$raw_candidates" ]]; then
    echo "Fillup done: all existing chart-times pages are already complete!" >&2
    exit 0
  fi

  incomplete=0 improved=0 filled=0 still=0

  while IFS=$'\t' read -r num fname before missing f; do
    [[ -z "$num" ]] && continue
    if ! [[ "$num" =~ ^[0-9]{3,6}$ ]]; then
      echo "[fillup] skip $(basename "$f") (invalid train number '$num')" >&2
      continue
    fi
    if [[ "$SKIP_SPECIAL" -eq 1 ]] && is_special "$fname"; then
      continue
    fi

    incomplete=$((incomplete + 1))
    if [[ "$LIMIT" -gt 0 && "$incomplete" -gt "$LIMIT" ]]; then
      echo "Reached limit of $LIMIT pages; stopping (resumable)." >&2
      incomplete=$((incomplete - 1))
      break
    fi

    # Non-destructive regeneration with backup
    bak="${f}.fillup.bak"
    mv "$f" "$bak"
    code="$(warm "$BASE_URL/chart-times/$num")"
    newf="$(find_content_file "$num" || true)"
    after=0; nowmissing="?"
    if [[ -n "$newf" && -f "$newf" ]]; then
      after="$(jq '.knownChartCount // 0' "$newf" 2>/dev/null || echo 0)"
      nowmissing="$(jq '[.stations[]? | select(.chartTimeLocal == null)] | length' "$newf" 2>/dev/null || echo "?")"
    fi

    if [[ "$after" =~ ^[0-9]+$ && "$after" -ge "$before" && ("$after" -gt 0 || "$before" -eq 0) ]]; then
      rm -f "$bak"
      [[ "$after" -gt "$before" ]] && improved=$((improved + 1))
      if [[ "$nowmissing" == "0" ]]; then filled=$((filled + 1)); else still=$((still + 1)); fi
      printf '[fillup] %s  known %s->%s, missing %s->%s (HTTP %s) kept\n' "$num" "$before" "$after" "$missing" "$nowmissing" "$code" >&2
    else
      [[ -n "$newf" && "$newf" != "$bak" ]] && rm -f "$newf"
      mv "$bak" "$f"
      still=$((still + 1))
      printf '[fillup] %s  known %s (regen %s) — reverted, kept original (HTTP %s)\n' "$num" "$before" "$after" "$code" >&2
    fi

    [[ "$DELAY" != "0" ]] && sleep "$DELAY" || true
  done <<< "$raw_candidates"

  echo "Fillup done. incomplete_pages=$incomplete improved=$improved fully_filled=$filled still_missing=$still" >&2
  exit 0
fi

# ==============================================================================
# Normal (list) mode: process train list with batched atomic journaling
# ==============================================================================

[[ -f "$INPUT" ]] || { echo "Error: input not found: $INPUT" >&2; echo "Build it first: ./scripts/irctc-train-list.sh -n -o $INPUT" >&2; exit 2; }
jq -e 'type == "array"' "$INPUT" >/dev/null 2>&1 || { echo "Error: $INPUT is not a JSON array." >&2; exit 2; }

JOURNAL_FILE="${INPUT}.journal"
unflushed=0

# Flush transaction journal updates back into $INPUT in a single batch
flush_journal() {
  if [[ ! -f "$JOURNAL_FILE" ]] || [[ ! -s "$JOURNAL_FILE" ]]; then
    rm -f "$JOURNAL_FILE"
    return 0
  fi

  local journal_raw tmp
  journal_raw="$(cat "$JOURNAL_FILE")"
  [[ -z "$journal_raw" ]] && { rm -f "$JOURNAL_FILE"; return 0; }

  tmp="$(mktemp "${INPUT}.tmp.XXXXXX")"
  if jq --arg journal "$journal_raw" '
    ($journal | split("\n") | map(select(length > 0) | split("\t") | {status: .[0], num: .[1], canonical: .[2], slug: .[3]}) | reduce .[] as $j ({}; .[$j.num] = $j)) as $updates |
    map(
      ($updates[(.trainNumber|tostring)]) as $up |
      if $up == null then
        .
      elif $up.status == "OK" then
        .completed = true |
        .httpStatus = 200 |
        (if ($up.slug // "") != "" then .slug = $up.slug else . end) |
        (if ($up.canonical // "") != "" then .canonicalNumber = $up.canonical else . end)
      else
        empty
      end
    )
  ' "$INPUT" > "$tmp"; then
    mv "$tmp" "$INPUT"
    rm -f "$JOURNAL_FILE"
    unflushed=0
  else
    rm -f "$tmp"
    echo "Warning: failed to flush journal into $INPUT" >&2
  fi
}

trap flush_journal EXIT INT TERM

# If an unmerged journal exists from an interrupted run, merge it upfront
if [[ -s "$JOURNAL_FILE" ]]; then
  echo "Found unmerged journal from previous run — recovering state into $INPUT…" >&2
  flush_journal
fi

# Step 1: Upfront pruning of invalid train numbers & special trains in one pass
total="$(jq 'length' "$INPUT")"
if [[ "$SKIP_SPECIAL" -eq 1 ]]; then
  prune_filter='map(select((.trainNumber | tostring | test("^[0-9]{3,6}$")) and ((.trainName // "") | test("(?i)spl|special") | not)))'
else
  prune_filter='map(select(.trainNumber | tostring | test("^[0-9]{3,6}$")))'
fi

tmp_prune="$(mktemp "${INPUT}.tmp.XXXXXX")"
if jq "$prune_filter" "$INPUT" > "$tmp_prune"; then
  new_total="$(jq 'length' "$tmp_prune")"
  pruned_count=$(( total - new_total ))
  mv "$tmp_prune" "$INPUT"
  total="$new_total"
  if [[ "$pruned_count" -gt 0 ]]; then
    echo "Pruned $pruned_count invalid/special train(s) from $INPUT upfront." >&2
  fi
else
  rm -f "$tmp_prune"
fi

already="$(jq '[.[] | select(.completed == true)] | length' "$INPUT")"
echo "Input: $INPUT ($total trains in list, $already marked completed in JSON)" >&2
echo "Target: $BASE_URL/chart-times/<trainNumber>  (concurrency $CONCURRENCY, delay ${DELAY}s, limit ${LIMIT:-all}, force=$FORCE, prefix=$PREFIX)" >&2

# Step 2: Identify train numbers that ALREADY have fully valid chart times in content dir
complete_nums=""
if [[ -d "$CONTENT_DIR" ]]; then
  shopt -s nullglob
  files=("$CONTENT_DIR"/*-chart-times.json)
  shopt -u nullglob
  if [[ ${#files[@]} -gt 0 ]]; then
    complete_nums="$(jq -r 'select((.knownChartCount // 0) > 0 and ([.stations[]? | select(.chartTimeLocal == null)] | length) == 0) | (.trainNumber|tostring)' "${files[@]}" 2>/dev/null || true)"
  fi
fi

# Step 3: Snapshot candidates sorted by priority prefix
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

count="${#NUMS[@]}"
if [[ "$count" -eq 0 ]]; then
  echo "Nothing to do — all trains already have chart times added (use --force to re-run)." >&2
  exit 0
fi
echo "Found $count candidate trains missing complete chart times (prioritizing prefix '$PREFIX' first)." >&2

if [[ "$LIMIT" -gt 0 && "$count" -gt "$LIMIT" ]]; then
  count="$LIMIT"
fi

# Process a single train candidate
process_train() {
  local idx="$1" total="$2" num="$3" name="$4"
  local code slug="" canonical="" f

  code="$(warm "$BASE_URL/chart-times/$num")"

  if [[ "$code" == "200" ]]; then
    f="$(find_content_file "$num" || true)"
    if [[ -n "$f" ]]; then
      slug="$(basename "$f" .json)"
      canonical="${slug%%-*}"
    fi
    printf 'OK\t%s\t%s\t%s\n' "$num" "$canonical" "$slug" >> "$JOURNAL_FILE"
    printf '[%d/%d] %s ok             %s\n' "$idx" "$total" "$num" "$name" >&2
    return 0
  else
    printf 'FAIL\t%s\n' "$num" >> "$JOURNAL_FILE"
    printf '[%d/%d] %s removed(failed %s) %s\n' "$idx" "$total" "$num" "$code" "$name" >&2
    return 1
  fi
}

processed=0 ok=0 failed=0

if [[ "$CONCURRENCY" -le 1 ]]; then
  # Synchronous single-worker loop
  for ((j = 0; j < count; j++)); do
    num="${NUMS[$j]}"; name="${NAMES[$j]}"
    idx=$((j + 1))
    if process_train "$idx" "$count" "$num" "$name"; then
      ok=$((ok + 1))
    else
      failed=$((failed + 1))
    fi
    processed=$((processed + 1))
    unflushed=$((unflushed + 1))
    if [[ "$unflushed" -ge "$FLUSH_INTERVAL" ]]; then
      flush_journal
    fi
    [[ "$DELAY" != "0" && "$idx" -lt "$count" ]] && sleep "$DELAY" || true
  done
else
  # Multi-worker parallel pool using portable POSIX named-pipe token bucket
  FIFO="$(mktemp -u "${TMPDIR:-/tmp}/prepopulate_pool.XXXXXX")"
  mkfifo "$FIFO"
  exec 3<>"$FIFO"
  rm -f "$FIFO"

  for ((i = 0; i < CONCURRENCY; i++)); do
    echo >&3
  done

  for ((j = 0; j < count; j++)); do
    num="${NUMS[$j]}"; name="${NAMES[$j]}"
    idx=$((j + 1))
    read -u 3
    (
      process_train "$idx" "$count" "$num" "$name" || true
      [[ "$DELAY" != "0" ]] && sleep "$DELAY" || true
      echo >&3
    ) &
    processed=$((processed + 1))
  done

  wait
  exec 3>&-
fi

flush_journal
echo "Done. processed=$processed candidate_total=$count — saved to $INPUT" >&2
