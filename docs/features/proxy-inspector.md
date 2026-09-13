# Proxy inspector

The read-only inspector captures bytecode plus ERC-1967 implementation, admin, and beacon slots at one identified block. Beacon implementation calls are bounded, cycles and conflicting slots are explicit, and every conclusion retains its code, slot, or call observation.

An empty admin slot means authority is unknown; it never proves immutability. Empty, partial, unavailable, EOA, unsupported, and successful results remain separate. RPC URLs come only from configured networks, and the feature has no upgrade, signing, or transaction submission action.

Run the focused suite with: npm run test -- --run tests/features/proxy-inspector
