# Soroban Spec-Aware Contract Event Decoder

## Matching & Decoding Rules

1. **Spec Matching**: Matches emitted events by their signature symbol (`topics[0]`), topic arity, and each field's `ScVal` type against the contract's Wasm spec event definitions.
2. **Exact 128-bit Decoding**: Combines `hi` and `lo` 64-bit parts of `i128` / `u128` values using `BigInt` (`hi * 2^64 + lo`) without precision loss.
3. **Fallback**: Events that do not match any declared spec definition are shown with their raw `ScVal` topics/data and the exact reason the match failed.
