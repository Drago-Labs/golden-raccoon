# Read-only allowance inventory

The allowance inventory at `/insights/allowance-inventory` helps an authenticated EVM wallet review current ERC-20 spender exposure. It cannot prepare, sign, approve, revoke, or submit transactions. The recovery page links to the inventory, and inventory results link back to recovery for a separate manual decision.

## Data model and coverage

The server accepts only a configured network identifier. RPC URLs remain server-controlled. A scan takes a bounded Approval-log range of at most 10,000 blocks plus up to 50 explicit token/spender pairs. Logs only identify candidates. For every candidate, the server reads `allowance(owner, spender)`, token metadata, and `balanceOf(owner)` at the same snapshot block.

The response preserves all integers as decimal strings. Zero is `revoked`, `2^256 - 1` is `maximum`, and other positive values are `finite`. Known balance exposure is `min(allowance, balance)`; unavailable balances and malformed metadata stay visibly unknown.

`complete` means every discovered or supplied candidate was read and the bounded log query completed. It does not mean every historical spender was discovered. Rate limits, skipped calls, malformed responses, an unavailable snapshot, or a changed snapshot block hash produce explicit `partial` or `unavailable` states. A partial result never carries an all-clear message.

Wallet-session ownership is authoritative. The client clears results whenever the wallet or network changes and ignores late responses whose wallet, network, or request generation no longer matches.

## Reproducible verification

From `frontend/`:

```bash
npx vitest run tests/features/allowance-inventory
npx tsc --noEmit --project tests/features/allowance-inventory/tsconfig.json
npx eslint src/server/research/allowance-inventory src/components/research/allowance-inventory src/app/api/insights/allowance-inventory src/app/insights/allowance-inventory tests/features/allowance-inventory e2e/specs/allowance-inventory.spec.ts
npx playwright test e2e/specs/allowance-inventory.spec.ts --project=chromium-desktop --project=chromium-mobile
```

Tests use an in-memory RPC fixture and intercepted browser requests. They need no live wallet, funds, paid API, or public RPC service.
