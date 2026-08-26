# Contract Artifact Provenance & Reproducible Builds

## Overview
Golden Raccoon enforces cryptographic provenance verification for all deployable EVM bytecode and Soroban WASM release artifacts. Every release candidate is accompanied by a canonical hash-freeze build manifest generated prior to deployment.

## Deterministic Toolchains
- **EVM Compiler**: Solidity `0.8.24` via Hardhat with `viaIR: true`, `optimizer: { enabled: true, runs: 200 }`, `evmVersion: "paris"`.
- **Soroban SDK**: `=26.0.1` (pinned in `soroban/Cargo.toml`) with release profile `opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = "symbols"`.

## Provenance Manifest Schema
Manifests are stored in `release-manifests/` and record:
- Source git commit hash (`commit`)
- Dirty working tree indicator (`isDirty`)
- Timestamp (`timestamp`)
- Compiler and toolchain settings (`compiler`)
- Canonical input file checksums (`inputs`)
- Compiled artifact SHA-256 checksums (`artifacts`)

## Offline Verification
To verify that compiled artifacts on disk match the release manifest:
```bash
npm run provenance:verify [path-to-manifest]
```

## Security Invariants
- Manifests MUST NEVER contain secrets, private keys, signed transactions, user paths, or credential-bearing URLs.
- Dirty working trees or mismatched compiler settings are rejected for release manifests.
- Tampering with source files or bytecode artifacts is detected offline by SHA-256 recalculation.
