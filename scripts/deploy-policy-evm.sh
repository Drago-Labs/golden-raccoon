#!/usr/bin/env bash
set -euo pipefail

# Deploy GoldRaccoonPolicy to EVM testnet
# Usage: ./scripts/deploy-policy-evm.sh [network]
# Requires PRIVATE_KEY env var

NETWORK="${1:-hardhat}"

echo "Deploying GoldRaccoonPolicy to ${NETWORK}..."

cd "$(dirname "$0")/../backend/contracts"

npx hardhat run scripts/deploy-policy.ts --network "${NETWORK}"

echo "Deployment complete. No secrets in output."
