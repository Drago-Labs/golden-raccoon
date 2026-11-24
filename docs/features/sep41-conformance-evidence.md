# SEP-41 conformance evidence and limits

## Sources

- Contract function surface: Soroban RPC `getContractSpec` when available, or a recorded fixture in tests.
- Read probes: signature-free simulations for `decimals`, `name`, `symbol`, and `balance`. No write or auth-gated entry points are called.
- Events: a single bounded `getEvents` page filtered to the contract id.

## Limits

- At most 50 event samples are retained.
- Request bodies larger than 16 KiB are rejected.
- Missing events are not treated as failures; only sampled events are shape-checked.
- A complete result means the sampled surface matched; it does not prove every historical event was conforming.
- Extra functions outside SEP-41 are reported but do not alone mark the token unusable.
