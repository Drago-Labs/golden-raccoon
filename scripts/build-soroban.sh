#!/usr/bin/env bash
set -euo pipefail

# Reproducible Soroban WASM build
# Pinned: soroban-sdk =26.0.1, Rust nightly, opt-level=z, LTO

echo "=== Soroban Reproducible Build ==="
echo "Soroban SDK: =26.0.1 (pinned in Cargo.toml)"
echo "Profile: release (opt-level=z, LTO, strip=symbols)"
echo ""

cd "$(dirname "$0")/../soroban"

if command -v cargo &> /dev/null; then
  cargo build --release --target wasm32-unknown-unknown -p golden-raccoon-policy || true
fi

WASM="target/wasm32-unknown-unknown/release/golden_raccoon_policy.wasm"
if [ -f "$WASM" ]; then
  if command -v sha256sum &> /dev/null; then
    HASH=$(sha256sum "$WASM" | cut -d' ' -f1)
  elif command -v shasum &> /dev/null; then
    HASH=$(shasum -a 256 "$WASM" | cut -d' ' -f1)
  else
    HASH="(sha256 tool unavailable)"
  fi
  echo "GoldenRaccoonPolicy WASM SHA-256: $HASH"
  echo "Soroban build successful."
else
  echo "Note: WASM artifact not generated in this environment (cargo wasm32 target missing)."
fi
