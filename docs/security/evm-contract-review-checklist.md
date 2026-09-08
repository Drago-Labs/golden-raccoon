# EVM Contract Review Checklist

> Review date: 2026-09-08
> Source files: `backend/contracts/contracts/`

## GoldRaccoonPolicy.sol

| Check | Status | Notes |
|---|---|---|
| `address public owner` — gated with `onlyOwner` | PASS | All privileged functions use modifier |
| `mapping(address => UserPolicy) public userPolicies` — user isolation | PASS | Policies are per-address |
| `uint256 public maxTransactionValue` — global hard cap | PASS | Enforced in `checkPolicy` |
| `setUserPolicy` — only owner | PASS | Owner-gated |
| `setUserMaxTransactionValue` — only owner | PASS | Owner-gated |
| `setUserMaxSlippage` — only owner | PASS | Owner-gated |
| `setUserAllowedAssets` — only owner | PASS | Owner-gated |
| `setUserBlockedAssets` — only owner | PASS | Owner-gated |
| `setUserMaxDailySpend` — only owner | PASS | Owner-gated |
| No selfdestruct / delegatecall | PASS | Not present |
| Solidity version pragma fixed | PASS | Uses `0.8.24` |
| Reentrancy guards on external calls | PASS | Uses OpenZeppelin `ReentrancyGuard` |
| `emergencyPause()` — only owner | PASS | Owner-gated |
| User revoke (`revokeApproval`) — user-callable | PASS | Public, permissionless for own intents |
| Nonce reuse prevented | PASS | `usedNonces` mapping with duplicate check |
| `expiryWindow` enforced | PASS | Checked before policy evaluation |
| VERSION string set | PASS | `"1.0.0"` |
| `perPolicyMaxTransactionValue` override | PASS | Per-policy override of global max |
| `hashPolicyDecision` includes chainId | PASS | Chain-bound |
| `hashIntent` includes user, intentAddress, nonce, expiry | PASS | Intent-bound |
| Invariant suite: daily spend bound | PASS | Covered by `test/invariant/Policy.invariant.test.ts` |
| Fuzz suite: slippage and amount bounds | PASS | Covered by `test/fuzz/PolicyLimits.fuzz.test.ts` |
| Access control regression gate | PASS | Covered by `test/security/AccessControl.test.ts` |
| Emergency pause isolation gate | PASS | Covered by `test/security/Pause.test.ts` |

## GoldRaccoonVault.sol

| Check | Status | Notes |
|---|---|---|
| Constructor sets `policy` address | PASS | Immutable after construction |
| `deposit` — nonReentrant token receipt | PASS | OpenZeppelin `ReentrancyGuard` |
| `withdraw` — nonReentrant token release | PASS | OpenZeppelin `ReentrancyGuard` |
| Policy address cannot be changed | PASS | Immutable policy validator reference |
| Non-agent withdrawal rejection | PASS | Reverts with `"Vault: not agent"` |
| `receive()` / `fallback()` | PASS | Absent — no ether trap |
| Upgradeability | PASS | Non-upgradeable core vault |
| Events emitted for all state changes | PASS | Deposited and Withdrawn events emitted |
| No unsafe arithmetic | PASS | Solidity 0.8.24 checked arithmetic |
| Invariant suite: vault solvency | PASS | Covered by `test/invariant/Vault.invariant.test.ts` |
| Fuzz suite: arbitrary amounts | PASS | Covered by `test/fuzz/VaultAmounts.fuzz.test.ts` |
| Fuzz suite: non-18 decimal tokens | PASS | Covered by `test/fuzz/Decimals.fuzz.test.ts` |
| Security suite: reentrancy rejection | PASS | Covered by `test/security/Reentrancy.test.ts` |

## GoldenRaccoonAudit.sol

| Check | Status | Notes |
|---|---|---|
| Strictly non-custodial (zero balance) | PASS | No payable functions, rejects ether transfer |
| Agent authorization window bounded | PASS | Bounded authorization and expiry enforcement |
| Intent replay resistance | PASS | Single-use intentId checked via `IntentReplayed()` |
| Policy hash commitment binding | PASS | Rejects operations if user replaces policy |
| User scoped emergency pause | PASS | User can pause own operations independently |
| Invariant suite: non-custodial and replay | PASS | Covered by `test/invariant/Audit.invariant.test.ts` |

## Storage Layout and Gas Regression Gates

| Check | Status | Notes |
|---|---|---|
| GoldRaccoonPolicy storage layout baseline | PASS | Verified against `snapshots/storage-layout.json` |
| GoldRaccoonPolicyV2 storage compatibility | PASS | Verified in `test/upgrade/StorageLayout.test.ts` |
| Hot path gas consumption baseline | PASS | Verified against `snapshots/gas.json` in `test/gas/GasSnapshot.test.ts` |

## Overall EVM Assessment

All contract security checks, invariant suites, fuzz testing harnesses, storage layout compatibility gates, and gas benchmarks are integrated and passing in CI.
