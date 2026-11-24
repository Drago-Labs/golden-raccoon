# SEP-41 token conformance

This read-only insight compares a Soroban token contract against the SEP-41 Token Interface.

It:

1. Reads the published contract spec and diffs function names, argument types, and return types against the reference.
2. Runs signature-free simulations for `decimals`, `name`, `symbol`, and optional `balance`.
3. Samples recent contract events and checks topic and data shapes for `transfer`, `mint`, `burn`, `approve`, and `clawback`.

Results distinguish missing, mismatched, and extra surface area. The report never mutates state and never asks for authorization.

Reference interface version: `SEP-41/2024-11` (stellar-protocol `ecosystem/sep-0041.md`).
