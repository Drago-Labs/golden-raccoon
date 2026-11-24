# Wasm Source Metadata Evidence

## Data sources

### Deployed Wasm

- **Source**: Soroban RPC (network-specific endpoint)
- **Use**: Raw Wasm bytes and optional Wasm hash
- **Limit**: 2 MB per module; 30 s timeout

### Custom sections

- **Sections**: `contractmetav0`, `contractenvmetav0`, `contractspecv0`
- **Method**: Binary Wasm section walk (no execution)
- **Limit**: 64 custom sections; 128 meta entries

### Published references

- **Sources**: Request `declaredSources`, README / release notes / configured source list
- **Citation**: Every comparison row that has a declared value includes `referenceSource`
- **Limit**: 32 declared sources per request

## What metadata can prove

- That a custom section key/value was embedded in the deployed Wasm
- That a published reference agrees with, conflicts with, or is missing relative to Wasm fields
- That env / SDK version strings are present for an advisory compatibility note

## What metadata cannot prove

- That the published repository builds this exact Wasm
- That the commit hash was the only input to the build
- That the contract is safe to call
- Runtime behavior beyond the static custom-section payload

## Coverage gaps

- Missing `contractmetav0` → fields reported as absent
- Provider failure → state `unavailable` (not a mismatch)
- Partial section set → state `partial` with an explicit coverage notice
