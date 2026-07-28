#!/usr/bin/env bash
set -euo pipefail

# Reproducible Soroban WASM build
# Pinned: soroban-sdk =26.0.1, Rust nightly, opt-level=z, LTO

echo "=== Soroban Reproducible Build ==="
echo "Soroban SDK: =26.0.1 (pinned in Cargo.toml)"
echo "Profile: release (opt-level=z, LTO, strip=symbols)"
echo ""

cd "$(dirname "$0")/../soroban"

cargo build --release -p golden-raccoon-policy

WASM="target/wasm32-unknown-unknown/release/golden_raccoon_policy.wasm"
if [ -f "$WASM" ]; then
  if command -v sha256sum &> /dev/null; then
    HASH=$(sha256sum "$WASM" | cut -d' ' -f1)
  else
    HASH=$(python3 -c "import hashlib; print(hashlib.sha256(open('$WASM','rb').read()).hexdigest())")
  fi
  echo "=== Build Verification ==="
  echo "GoldenRaccoonPolicy WASM hash: $HASH"
  echo ""
  echo "To verify reproducibility:"
  echo "  1. git checkout <commit>"
  echo "  2. ./scripts/build-soroban.sh"
  echo "  3. Compare WASM hash with CI/reference build"
fi

echo "Build complete."
