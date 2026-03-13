#!/usr/bin/env bash
# Railway deployment script for Railchart monorepo (web + api).
# Requires: Railway CLI installed and logged in (railway login).
#
# Setup (one-time):
#   1. Create a Railway project and add PostgreSQL (for API).
#   2. Create two services: "web" (root = .) and "api" (root = backend).
#   3. Link this repo: railway link
#   4. Set variables (see RAILWAY.md or below).
#
# Usage:
#   ./scripts/railway-deploy.sh           # deploy current service (railway link context)
#   ./scripts/railway-deploy.sh web       # deploy web service
#   ./scripts/railway-deploy.sh api       # deploy api service
#   ./scripts/railway-deploy.sh all       # deploy both (requires jq or manual service switch)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

deploy_service() {
  local name="$1"
  echo "Deploying $name..."
  railway up --service "$name" 2>/dev/null || railway up
  echo "Deploy triggered for $name."
}

# No args: deploy whatever service is currently linked
if [[ -z "$1" ]]; then
  railway up
  exit 0
fi

case "$1" in
  web)
    deploy_service "web"
    ;;
  api)
    deploy_service "api"
    ;;
  all)
    deploy_service "web"
    deploy_service "api"
    ;;
  *)
    echo "Usage: $0 [web|api|all]" >&2
    echo "  No args: deploy current linked service (railway link)" >&2
    exit 1
    ;;
esac
