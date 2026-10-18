#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-47.245.92.187}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/root/apps/ProductExpiryManager}"
REMOTE_PM2_NAME="${REMOTE_PM2_NAME:-expiry}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_ARCHIVE="$(mktemp /tmp/product-expiry-cloud.XXXXXX.tar.gz)"

cleanup() {
  rm -f "${TMP_ARCHIVE}"
}
trap cleanup EXIT

echo "Packing project files..."
tar czf "${TMP_ARCHIVE}" \
  -C "${PROJECT_ROOT}" \
  --exclude='node_modules' \
  --exclude='data' \
  --exclude='.git' \
  --exclude='.cursor' \
  --exclude='*.log' \
  --exclude='page-*.png' \
  .

echo "Uploading archive to ${REMOTE_USER}@${REMOTE_HOST}..."
scp -o StrictHostKeyChecking=no "${TMP_ARCHIVE}" "${REMOTE_USER}@${REMOTE_HOST}:/tmp/product-expiry-cloud.tar.gz"

echo "Deploying on remote server..."
ssh -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}" "
  set -euo pipefail
  mkdir -p '${REMOTE_APP_DIR}'
  cd '${REMOTE_APP_DIR}'
  tar xzf /tmp/product-expiry-cloud.tar.gz
  npm install --no-fund --no-audit
  export PRODUCT_EXPIRY_ROLE=cloud
  export PRODUCT_EXPIRY_MODE=direct
  export HOST=0.0.0.0
  pm2 restart '${REMOTE_PM2_NAME}' --update-env || pm2 start server.js --name '${REMOTE_PM2_NAME}'
  sleep 2
  curl -fsS http://127.0.0.1:3751/api/runtime
"

echo
echo "Cloud deploy complete."
echo "URL: http://${REMOTE_HOST}:3751"
