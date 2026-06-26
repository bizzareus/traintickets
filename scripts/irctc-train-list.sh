#!/usr/bin/env bash
#
# irctc-train-list.sh — fetch the IRCTC online-charts trainList endpoint and emit JSON.
#
# The endpoint sits behind Akamai bot protection (the bm_*, _abck, ak_bmsc cookies),
# so you MUST supply a fresh Cookie header copied from a logged-in browser session
# on https://www.irctc.co.in/online-charts/ — those cookies expire within minutes.
#
# Cookie resolution order (first non-empty wins):
#   1. -c / --cookie argument
#   2. $IRCTC_COOKIE / $IRCTC_COOKIES in the environment
#   3. IRCTC_COOKIE= / IRCTC_COOKIES= in backend/.env (relative to repo root)
#
# Usage:
#   ./irctc-train-list.sh                       # cookie auto-loaded from backend/.env
#   IRCTC_COOKIE='...' ./irctc-train-list.sh
#   ./irctc-train-list.sh -c '<cookie string>'  # cookie passed inline
#   ./irctc-train-list.sh -c "$(cat cookie.txt)" -o trains.json
#   ./irctc-train-list.sh -e path/to/.env       # custom .env location
#
# Exit codes: 0 ok, 1 bad usage, 2 missing cookie, 3 HTTP/transport error.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL='https://www.irctc.co.in/eticketing/trainList'
COOKIE=""
ENV_FILE="$SCRIPT_DIR/../backend/.env"   # default: backend/.env at repo root
OUTPUT=""       # empty => stdout
RAW=0           # 1 => skip jq pretty-printing

# Read KEY=value from an env file without sourcing it (cookie values contain
# ';', '=', '+' that would break shell evaluation). Strips surrounding quotes.
read_env_var() {
  local file="$1" key="$2" line val
  [[ -f "$file" ]] || return 1
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1)" || return 1
  [[ -n "$line" ]] || return 1
  val="${line#*=}"
  # strip a single layer of matching surrounding quotes
  if [[ "$val" == \"*\" ]]; then val="${val%\"}"; val="${val#\"}";
  elif [[ "$val" == \'*\' ]]; then val="${val%\'}"; val="${val#\'}"; fi
  printf '%s' "$val"
}

usage() {
  # print the leading comment block (skip the shebang), stripping '# '
  sed -n '2,/^$/p' "$0" | sed 's/^#\{1,\} \{0,1\}//; s/^#$//'
  exit "${1:-1}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--cookie) COOKIE="${2:-}"; shift 2 ;;
    -e|--env)    ENV_FILE="${2:-}"; shift 2 ;;
    -o|--output) OUTPUT="${2:-}"; shift 2 ;;
    -r|--raw)    RAW=1; shift ;;
    -h|--help)   usage 0 ;;
    *) echo "Unknown argument: $1" >&2; usage 1 ;;
  esac
done

# Resolve cookie: CLI arg > environment > backend/.env (IRCTC_COOKIE or IRCTC_COOKIES).
if [[ -z "$COOKIE" ]]; then
  COOKIE="${IRCTC_COOKIE:-${IRCTC_COOKIES:-}}"
fi
if [[ -z "$COOKIE" ]]; then
  COOKIE="$(read_env_var "$ENV_FILE" IRCTC_COOKIE  || true)"
  [[ -n "$COOKIE" ]] || COOKIE="$(read_env_var "$ENV_FILE" IRCTC_COOKIES || true)"
fi

if [[ -z "$COOKIE" ]]; then
  echo "Error: no cookie found." >&2
  echo "Looked in: -c arg, \$IRCTC_COOKIE(S), and $ENV_FILE" >&2
  echo "Copy a fresh Cookie header from your browser's request on" >&2
  echo "https://www.irctc.co.in/online-charts/ (cookies expire within minutes)." >&2
  exit 2
fi

# Capture body and HTTP status in one request.
tmp_body="$(mktemp)"
trap 'rm -f "$tmp_body"' EXIT

http_code="$(curl -sS "$URL" \
  -w '%{http_code}' \
  -o "$tmp_body" \
  -H 'accept: application/json' \
  -H 'accept-language: en-US,en;q=0.9' \
  -H 'dnt: 1' \
  -H 'priority: u=1, i' \
  -H 'referer: https://www.irctc.co.in/online-charts/' \
  -H 'sec-ch-ua: "Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"' \
  -H 'sec-fetch-dest: empty' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-site: same-origin' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36' \
  -b "$COOKIE")" || {
    echo "Error: curl failed to reach $URL" >&2
    exit 3
  }

if [[ "$http_code" -ge 400 ]]; then
  echo "Error: server returned HTTP $http_code (cookies likely expired or bot-blocked)." >&2
  head -c 500 "$tmp_body" >&2 || true
  echo >&2
  exit 3
fi

emit() {
  if [[ -n "$OUTPUT" ]]; then cat > "$OUTPUT"; echo "Wrote $OUTPUT" >&2;
  else cat; fi
}

if [[ "$RAW" -eq 0 ]] && command -v jq >/dev/null 2>&1; then
  # Pretty-print; fall back to raw if the response isn't valid JSON.
  if jq . "$tmp_body" 2>/dev/null | emit; then :; else
    echo "Warning: response was not valid JSON; emitting raw." >&2
    emit < "$tmp_body"
  fi
else
  emit < "$tmp_body"
fi
