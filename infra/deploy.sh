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
  color_info "Building Next.js frontend static export..."
  cd "${ROOT_DIR}"
  
  API_URL="https://api-v2.lastberth.com"
  NEXT_PUBLIC_API_URL="${API_URL}" npm run build:web

  if [[ "$CLOUD" == "aws" ]]; then
    color_info "Syncing static assets to AWS S3 & invalidating CloudFront..."
    cd "${SCRIPT_DIR}/terraform/aws"
    BUCKET_NAME="$(terraform output -raw s3_bucket_name 2>/dev/null || echo "lastberth-frontend-static")"
    DIST_ID="$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")"

    PROFILE="${AWS_PROFILE:-lastberth}"
    aws --profile "$PROFILE" s3 sync "${ROOT_DIR}/.next/static" "s3://${BUCKET_NAME}/_next/static" --delete --cache-control "public, max-age=31536000, immutable"
    aws --profile "$PROFILE" s3 sync "${ROOT_DIR}/public" "s3://${BUCKET_NAME}/" --delete

    if [[ -n "$DIST_ID" ]]; then
      color_info "Invalidating CloudFront distribution ${DIST_ID}..."
      aws --profile "$PROFILE" cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
    fi
  elif [[ "$CLOUD" == "gcp" ]]; then
    color_info "Syncing static assets to Google Cloud Storage..."
    cd "${SCRIPT_DIR}/terraform/gcp"
    BUCKET_NAME="$(terraform output -raw gcs_bucket_name 2>/dev/null || echo "lastberth-frontend-static")"
    gcloud storage rsync "${ROOT_DIR}/.next/static" "gs://${BUCKET_NAME}/_next/static" --recursive --delete-unmatched-destination-objects
    gcloud storage rsync "${ROOT_DIR}/public" "gs://${BUCKET_NAME}" --recursive --delete-unmatched-destination-objects
  fi

  color_success "Frontend deployed successfully to ${c_name}."
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
