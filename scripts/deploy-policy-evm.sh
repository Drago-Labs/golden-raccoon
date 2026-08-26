#!/usr/bin/env bash
set -euo pipefail

# Deploy GoldRaccoonPolicy to EVM testnet
# Usage: ./scripts/deploy-policy-evm.sh [network]
# Requires PRIVATE_KEY env var

NETWORK="${1:-hardhat}"

echo "Deploying GoldRaccoonPolicy to ${NETWORK}..."

# Check provenance manifest if present
if [ -f "release-manifests/latest.json" ]; then
  echo "Verifying artifact provenance manifest..."
  node scripts/verify-artifact-provenance.mjs release-manifests/latest.json
fi

cd "$(dirname "$0")/../backend/contracts"

npx hardhat run scripts/deploy-policy.ts --network "${NETWORK}"

echo "Deployment complete. No secrets in output."
