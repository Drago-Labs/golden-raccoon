# Governance queue

Read-only inspection of the Soroban governance `get_pending_queue` result. Failed
RPC or decode paths return an explicit `provider_error` / `malformed` state and
never an empty-success list. Timelock readiness is derived from the observed
clock only and does not imply authorization or safe execution.

Simulation returns decoded values for the configured network; it is not a
guarantee the ledger still matches after a later close. Prefer comparing a known
testnet proposal against contract state and indexed events when available.

Run: `npx vitest run tests/features/governance-queue`
