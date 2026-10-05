#!/usr/bin/env bash
set -euo pipefail

# Forward Docker container stdout/stderr to Grafana Cloud Loki.
# Usage (env vars):
#   CONTAINER_NAME=<name> LOKI_URL=<url> LOKI_AUTH="Basic <key>" bash docker-logs-to-loki.sh
#
# Idempotent across runs: only ships logs written since the last successful run
# (tracked in /var/log/grafana-logs/<name>.lastread).  Safe to run every N
# minutes via cron or systemd timer.

CONTAINER="${CONTAINER_NAME:?set CONTAINER_NAME env var}"
LOKI_URL="${LOKI_URL:?set LOKI_URL env var}"
LOKI_AUTH="${LOKI_AUTH:-}"
STATE_DIR="/var/log/grafana-logs"
LAST_FILE="$STATE_DIR/$CONTAINER.lastread"
TMP_LOG="$STATE_DIR/$CONTAINER.$(date +%Y%m%d-%H%M%S).log.gz"

mkdir -p "$STATE_DIR"

if [ -f "$LAST_FILE" ]; then
  ELAPSED=$(( $(date +%s) - $(cat "$LAST_FILE") ))
  if [ "$ELAPSED" -le 0 ]; then ELAPSED=3600; fi
else
  ELAPSED=3600
fi

docker logs --since "${ELAPSED}s" --tail 20000 --timestamps "$CONTAINER" 2>/dev/null \
  | gzip > "$TMP_LOG"

if [ -s "$TMP_LOG" ]; then
  curl -s -X POST "$LOKI_URL" \
    ${LOKI_AUTH:+-H "Authorization: $LOKI_AUTH"} \
    -H "Content-Type: application/loki-push-v1" \
    --data-binary @"$TMP_LOG"
  rm -f "$TMP_LOG"
  date +%s > "$LAST_FILE"
fi
