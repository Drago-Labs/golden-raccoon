#!/usr/bin/env bash
set -euo pipefail

# Reproducible EVM build
# Pinned: Solidity 0.8.24, Hardhat, evm target paris

echo "=== EVM Reproducible Build ==="
echo "Compiler: Solidity 0.8.24 (Hardhat)"
echo "EVM target: paris"
echo ""

cd "$(dirname "$0")/../backend/contracts"

npx hardhat clean
npx hardhat compile

ARTIFACT="artifacts/contracts/GoldRaccoonPolicy.sol/GoldRaccoonPolicy.json"
if [ -f "$ARTIFACT" ]; then
  if command -v sha256sum &> /dev/null; then
    HASH=$(sha256sum "$ARTIFACT" | cut -d' ' -f1)
  elif command -v shasum &> /dev/null; then
    HASH=$(shasum -a 256 "$ARTIFACT" | cut -d' ' -f1)
  else
    HASH="(sha256 tool unavailable)"
  fi
  echo "GoldRaccoonPolicy artifact SHA-256: $HASH"
  echo "EVM build successful."
else
  echo "EVM artifact not found: $ARTIFACT" >&2
  exit 1
fi
