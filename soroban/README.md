# Soroban Smart Contracts

## Contracts
- `contracts/policy`: Golden Raccoon policy and risk parameter enforcement contract.

## Reproducible Builds & Artifact Provenance
Soroban contracts target pinned Soroban SDK `=26.0.1` and release profile with `opt-level = "z"`, `lto = true`, `strip = "symbols"`.

To build WASM artifacts and verify provenance:
```bash
npm run build:soroban
npm run provenance:freeze
npm run provenance:verify
```
