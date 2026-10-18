#!/usr/bin/env bash
set -euo pipefail

LOCAL_BASE="${LOCAL_BASE:-http://127.0.0.1:3751}"
CLOUD_BASE="${CLOUD_BASE:-http://47.245.92.187:3751}"

TMP_DIR="$(mktemp -d /tmp/product-expiry-parity.XXXXXX)"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "Checking local/cloud parity..."
echo "local: ${LOCAL_BASE}"
echo "cloud: ${CLOUD_BASE}"
echo

curl -fsS "${LOCAL_BASE}/api/runtime" > "${TMP_DIR}/local_runtime.json"
curl -fsS "${CLOUD_BASE}/api/runtime" > "${TMP_DIR}/cloud_runtime.json"
curl -fsS "${LOCAL_BASE}/api/stats" > "${TMP_DIR}/local_stats.json"
curl -fsS "${CLOUD_BASE}/api/stats" > "${TMP_DIR}/cloud_stats.json"
curl -fsS "${LOCAL_BASE}/api/products?page=1&limit=5" > "${TMP_DIR}/local_products.json"
curl -fsS "${CLOUD_BASE}/api/products?page=1&limit=5" > "${TMP_DIR}/cloud_products.json"
curl -fsS "${LOCAL_BASE}/" > "${TMP_DIR}/local_index.html"
curl -fsS "${CLOUD_BASE}/" > "${TMP_DIR}/cloud_index.html"

node - "${TMP_DIR}" <<'EOF'
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
}

function readText(name) {
  return fs.readFileSync(path.join(dir, name), 'utf8');
}

function scriptRef(html) {
  const tailwind = (html.match(/tailwindcss-cdn\.js\?v=[^"' ]+/) || [null])[0];
  const app = (html.match(/redesign-app\.jsx\?v=[^"' ]+/) || [null])[0];
  return { tailwind, app };
}

const localRuntime = readJson('local_runtime.json').runtime || {};
const cloudRuntime = readJson('cloud_runtime.json').runtime || {};
const localStats = readJson('local_stats.json').stats || {};
const cloudStats = readJson('cloud_stats.json').stats || {};
const localProducts = readJson('local_products.json');
const cloudProducts = readJson('cloud_products.json');
const localRefs = scriptRef(readText('local_index.html'));
const cloudRefs = scriptRef(readText('cloud_index.html'));

const summary = {
  runtime: {
    local: `${localRuntime.role || '?'}:${localRuntime.mode || '?'}`,
    cloud: `${cloudRuntime.role || '?'}:${cloudRuntime.mode || '?'}`,
  },
  stats_match: JSON.stringify(localStats) === JSON.stringify(cloudStats),
  products_total_match: (localProducts.pagination || {}).total === (cloudProducts.pagination || {}).total,
  first_page_match: JSON.stringify(localProducts.data || []) === JSON.stringify(cloudProducts.data || []),
  assets_match: JSON.stringify(localRefs) === JSON.stringify(cloudRefs),
  refs: {
    local: localRefs,
    cloud: cloudRefs,
  },
};

console.log(JSON.stringify(summary, null, 2));

if (summary.runtime.local !== 'local:direct') process.exit(1);
if (summary.runtime.cloud !== 'cloud:direct') process.exit(1);
if (!summary.stats_match) process.exit(1);
if (!summary.products_total_match) process.exit(1);
if (!summary.first_page_match) process.exit(1);
if (!summary.assets_match) process.exit(1);
EOF

echo
echo "Parity check passed."
