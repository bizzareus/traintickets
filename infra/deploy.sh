#!/usr/bin/env bash
set -eo pipefail

# ==============================================================================
# LastBerth Multi-Cloud Deployment Script (AWS & GCP)
# ==============================================================================

ACTION="${1:-help}"
CLOUD="${2:-aws}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

color_info() { echo -e "\033[36mℹ $1\033[0m"; }
color_success() { echo -e "\033[32m✔ $1\033[0m"; }
color_err() { echo -e "\033[31m✖ $1\033[0m"; }

cloud_upper() {
  echo "$CLOUD" | tr '[:lower:]' '[:upper:]'
}

check_cloud() {
  if [[ "$CLOUD" != "aws" && "$CLOUD" != "gcp" ]]; then
    color_err "Invalid cloud provider '$CLOUD'. Must be 'aws' or 'gcp'."
    exit 1
  fi
}

cmd_setup() {
  check_cloud
  local c_name
  c_name="$(cloud_upper)"
  color_info "Running Terraform setup for ${c_name}..."
  cd "${SCRIPT_DIR}/terraform/${CLOUD}"
  terraform init
  terraform apply
  color_success "Infrastructure provisioned on ${c_name}."
}

cmd_frontend() {
  check_cloud
  local c_name
  c_name="$(cloud_upper)"
  color_info "Deploying Frontend container to ${c_name} VM..."
  cd "${SCRIPT_DIR}/terraform/${CLOUD}"
  FRONTEND_IP="$(terraform output -raw frontend_public_ip 2>/dev/null || echo "")"

  if [[ -z "$FRONTEND_IP" ]]; then
    color_err "Could not find frontend_public_ip from Terraform outputs. Please run './infra/deploy.sh setup ${CLOUD}' first."
    exit 1
  fi

  color_info "Target Frontend VM IP: ${FRONTEND_IP}"
  color_info "Copying docker-compose & Caddyfile to ${FRONTEND_IP}..."
  
  # Sync frontend source code
  color_info "Syncing frontend source code to ${FRONTEND_IP}..."
  rsync -avz \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude 'backend' \
    --exclude '.git' \
    --exclude '.claude' \
    --exclude '.agents' \
    --exclude '.gemini' \
    --exclude 'tmp' \
    "${ROOT_DIR}/" "ubuntu@${FRONTEND_IP}:/home/ubuntu/app/"

  color_info "Configuring Docker & Caddy on ${FRONTEND_IP}..."
  ssh -o StrictHostKeyChecking=no "ubuntu@${FRONTEND_IP}" "mkdir -p /home/ubuntu/app/infra"
  scp -o StrictHostKeyChecking=no "${SCRIPT_DIR}/docker-compose.frontend.yml" "ubuntu@${FRONTEND_IP}:/home/ubuntu/app/infra/docker-compose.yml"
  scp -o StrictHostKeyChecking=no "${SCRIPT_DIR}/Caddyfile.frontend" "ubuntu@${FRONTEND_IP}:/home/ubuntu/app/infra/Caddyfile.frontend"
  scp -o StrictHostKeyChecking=no "${ROOT_DIR}/Dockerfile.frontend" "ubuntu@${FRONTEND_IP}:/home/ubuntu/app/Dockerfile.frontend"

  # Build & run on remote instance
  color_info "Building & starting Frontend Next.js container on ${FRONTEND_IP}..."
  ssh -o StrictHostKeyChecking=no "ubuntu@${FRONTEND_IP}" "cd /home/ubuntu/app/infra && docker compose up -d --build"
  color_success "Frontend deployed and running on ${c_name} (IP: ${FRONTEND_IP})."
}

cmd_backend() {
  check_cloud
  local c_name
  c_name="$(cloud_upper)"
  color_info "Deploying Backend container to ${c_name} VM..."
  cd "${SCRIPT_DIR}/terraform/${CLOUD}"
  BACKEND_IP="$(terraform output -raw backend_public_ip 2>/dev/null || echo "")"

  if [[ -z "$BACKEND_IP" ]]; then
    color_err "Could not find backend_public_ip from Terraform outputs. Please run './infra/deploy.sh setup ${CLOUD}' first."
    exit 1
  fi

  color_info "Target VM IP: ${BACKEND_IP}"
  color_info "Copying docker-compose & Caddyfile to ${BACKEND_IP}..."
  
  ssh -o StrictHostKeyChecking=no "ubuntu@${BACKEND_IP}" "mkdir -p /home/ubuntu/app/infra /home/ubuntu/app/backend"
  scp -o StrictHostKeyChecking=no "${SCRIPT_DIR}/docker-compose.yml" "${SCRIPT_DIR}/Caddyfile" "ubuntu@${BACKEND_IP}:/home/ubuntu/app/infra/"
  scp -o StrictHostKeyChecking=no "${ROOT_DIR}/backend/.env" "ubuntu@${BACKEND_IP}:/home/ubuntu/app/backend/.env"
  
  # Sync backend source
  rsync -avz --exclude 'node_modules' --exclude 'dist' "${ROOT_DIR}/backend/" "ubuntu@${BACKEND_IP}:/home/ubuntu/app/backend/"

  # Build & run
  ssh -o StrictHostKeyChecking=no "ubuntu@${BACKEND_IP}" "cd /home/ubuntu/app/infra && docker compose up -d --build"
  color_success "Backend deployed and running on ${c_name} (IP: ${BACKEND_IP})."
}

cmd_env() {
  check_cloud
  local c_name
  c_name="$(cloud_upper)"
  color_info "Updating .env on ${c_name} VM..."
  cd "${SCRIPT_DIR}/terraform/${CLOUD}"
  BACKEND_IP="$(terraform output -raw backend_public_ip 2>/dev/null || echo "")"

  if [[ -z "$BACKEND_IP" ]]; then
    color_err "Could not find backend_public_ip. Run './infra/deploy.sh setup ${CLOUD}' first."
    exit 1
  fi

  scp -o StrictHostKeyChecking=no "${ROOT_DIR}/backend/.env" "ubuntu@${BACKEND_IP}:/home/ubuntu/app/backend/.env"
  ssh -o StrictHostKeyChecking=no "ubuntu@${BACKEND_IP}" "cd /home/ubuntu/app/infra && docker compose restart backend"
  color_success ".env updated and backend restarted on ${c_name} (IP: ${BACKEND_IP})."
}

cmd_all() {
  cmd_setup
  cmd_backend
  cmd_frontend
}

case "$ACTION" in
  setup)
    cmd_setup
    ;;
  frontend)
    cmd_frontend
    ;;
  backend)
    cmd_backend
    ;;
  env)
    cmd_env
    ;;
  all)
    cmd_all
    ;;
  *)
    echo "Usage: $0 {setup|frontend|backend|env|all} [aws|gcp]"
    echo ""
    echo "Commands:"
    echo "  setup    [aws|gcp] : Provision cloud infrastructure via Terraform"
    echo "  frontend [aws|gcp] : Build Next.js & upload to S3/GCS + CDN invalidate"
    echo "  backend  [aws|gcp] : Build & run backend container on the cloud VM"
    echo "  env      [aws|gcp] : Push local backend/.env to VM & restart container (instant)"
    echo "  all      [aws|gcp] : Provision and deploy everything"
    exit 1
    ;;
esac
