# Wasm Source Metadata

## Overview

Read-only check that parses Soroban Wasm custom sections and compares declared source references with what the project publishes.

## Method

### Input

- **Contract ID**: Stellar contract address (`C…`)
- **Network**: `stellar-testnet` or `stellar-pubnet`
- **Declared sources** (optional): repository, commit, SDK, rust, and build-tool values with a citation source

### Steps

1. Fetch deployed Wasm bytes for the contract (read-only RPC)
2. Parse custom sections without instantiating or executing the module
3. Decode `contractmetav0`, `contractenvmetav0`, and `contractspecv0` when present
4. Resolve published references (request body or configured source list)
5. Compare each field and report `agreement`, `conflict`, or `absent`
6. Assess advisory protocol / SDK compatibility with the selected network

### Comparison rules

- Missing Wasm metadata → **absent** (never treated as a mismatch)
- Present on both sides and equal (normalized) → **agreement**
- Present on both sides and different → **conflict**
- Each comparison row cites the reference source when a declared value exists

## Limitations

- Does not build contracts from source
- Does not prove that published source produces the deployed Wasm
- Interface / SDK compatibility is advisory only
