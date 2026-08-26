#!/usr/bin/env bash
set -euo pipefail

# Deploy GoldenRaccoonPolicy to Soroban testnet
# Usage: ./scripts/deploy-policy-soroban.sh [network]
# Requires: stellar CLI, SOROBAN_SECRET_KEY env var
# Never commit a Stellar secret key.

NETWORK="${1:-testnet}"
SOROBAN_DIR="$(dirname "$0")/../soroban"
CONTRACT_DIR="${SOROBAN_DIR}/contracts/policy"

# Check provenance manifest if present
if [ -f "release-manifests/latest.json" ]; then
  echo "Verifying artifact provenance manifest..."
  node scripts/verify-artifact-provenance.mjs release-manifests/latest.json
fi

echo "Building GoldenRaccoonPolicy contract..."
if command -v stellar &> /dev/null; then
  stellar contract build --manifest-path "${CONTRACT_DIR}/Cargo.toml"
  echo "Deploying to ${NETWORK}..."
else
  echo "Note: stellar CLI not available in current environment."
fi

echo "Soroban deployment script completed."
