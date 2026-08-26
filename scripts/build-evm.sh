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
  else
    HASH=$(python3 -c "import hashlib; print(hashlib.sha256(open('$ARTIFACT','rb').read()).hexdigest())")
  fi
  echo "=== Build Verification ==="
  echo "GoldRaccoonPolicy artifact hash: $HASH"
  echo ""
  echo "To verify reproducibility:"
  echo "  1. git checkout <commit>"
  echo "  2. ./scripts/build-evm.sh"
  echo "  3. Compare artifact hash with CI/reference build"
  echo ""
  echo "Contracts: GoldRaccoonPolicy, GoldRaccoonPolicyV2, GoldRaccoonVault"
fi

echo "Build complete."
