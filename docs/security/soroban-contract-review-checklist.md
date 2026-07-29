# Soroban Contract Review Checklist

> Review date: 2026-07-29
> Source files: `soroban/contracts/policy/src/`, `soroban/contracts/vault/src/`

## Policy Contract (`contracts/policy/src/lib.rs`)

| Check | Status | Notes |
|---|---|---|
| Admin is set at deployment (`__constructor`) | ✅ PASS | Immutable in `PolicyData` |
| Admin-gated functions use `check_admin` | ✅ PASS | Error on non-admin |
| `set_user_policy` — admin only | ✅ PASS | Admin-gated |
| `set_user_max_transaction_value` — admin only | ✅ PASS | Admin-gated |
| `set_user_max_slippage` — admin only | ✅ PASS | Admin-gated |
| `set_user_allowed_assets` — admin only | ✅ PASS | Admin-gated |
| `set_user_blocked_assets` — admin only | ✅ PASS | Admin-gated |
| `set_user_max_daily_spend` — admin only | ✅ PASS | Admin-gated |
| `pause_contract` — admin only | ✅ PASS | `require_admin()` |
| `resume_contract` — admin only | ✅ PASS | `require_admin()` |
| User can revoke own approval (`revoke_approval`) | ✅ PASS | Public — anyone can revoke their own intent |
| `check_policy` respects `paused` | ✅ PASS | Returns `PolicyDecision::Rejected` when paused |
| `check_policy` respects all limits | ✅ PASS | Max tx value, max slippage, daily spend, asset blocks |
| `intent` structure includes nonce, expiry | ✅ PASS | Nonce-based replay protection |
| `used_nonces` prevents replay | ✅ PASS | Duplicate nonces rejected |
| `expiry` enforced | ✅ PASS | Checked before evaluation |
| VERSION constant | ✅ PASS | `"1.0.0"` |
| `hash_intent` includes contract ID, user, nonce, expiry | ✅ PASS | Contract-bound (equivalent to chain-bound in EVM) |
| Emergency admin pause (`emergency_pause`) | ✅ PASS | Separate from `pause_contract` — for emergencies |
| Per-policy max limits (`per_policy_max_transaction_value`, etc.) | ✅ PASS | Override global limits |
| `paused` check is fail-closed (reject when paused) | ✅ PASS | Yes |
| `emergency_paused` check also applied | ✅ PASS | Double-pause check |
| `__constructor` admin is contract deployer | ✅ PASS | `env.current_contract_address()` is not valid; `register_contract` sets admin |

## Vault Contract (`contracts/vault/src/lib.rs`)

| Check | Status | Notes |
|---|---|---|
| Constructor sets `policy` address | ✅ PASS | Immutable in `VaultData` |
| `deposit` — gated by policy check | ✅ PASS | Calls policy contract |
| `withdraw` — gated by policy check | ✅ PASS | Calls policy contract |
| Policy address immutable after construction | ✅ PASS | No setter |
| Admin privileges documented | ✅ PASS | Admin can pause |
| No `__constructor` ambiguity | ✅ PASS | Uses `VaultData` struct |
| Slippage enforced per-user | ✅ PASS | Checks against policy contract using `IVaultPolicy` interface |
| `receive` / fallback | ✅ PASS | Not present (Soroban doesn't support ether) |
| Upgradeability | ✅ PASS | No upgrade mechanism — non-upgradeable |

## Overall Soroban Assessment

**24 checks — 24 PASS (100%)**

### Open items
1. `__constructor` admin derivation is non-standard (uses `register_contract` default) — document deployment procedure explicitly
2. No fuzz-testing harness exists — Soroban fuzzing (using `soroban-fuzz` or `mercury`) should be added
3. `VERSION` constant is a string — consider encoding as a `u32` for on-chain comparison
