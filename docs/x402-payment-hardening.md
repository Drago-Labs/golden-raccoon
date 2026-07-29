# x402 Deep Scan Payment Hardening

## Overview

This implements production-grade x402 payment hardening for the premium Deep Scan
endpoint. Payment success is never inferred from unverified client claims.

## Guards (Payment Verification)

Before premium agents run, the `assertFreshX402Payment` guard verifies:

| Check | Behavior on failure |
|---|---|
| **Missing payment signature** | Returns HTTP 402 |
| **Duplicate/replay** | Returns HTTP 409 with existing receipt ID |
| **Amount mismatch** | Returns HTTP 402 with `payment_amount_mismatch` |
| **Recipient mismatch** | Returns HTTP 402 with `payment_recipient_mismatch` |
| **Network mismatch** | Returns HTTP 402 with `payment_network_mismatch` |
| **Asset mismatch** | Returns HTTP 402 with `payment_asset_mismatch` |
| **Payer identity (chain-family)** | Returns HTTP 402 with `invalid_payer_identity` or `payer_chain_family_mismatch` |
| **Transaction hash format** | Returns HTTP 402 with `invalid_transaction_hash` |
| **Expired settlement** | Returns HTTP 402 with `payment_expired` |
| **Body binding** | Hashed into request ID; mismatch changes the ID (not replayable) |

### Chain-Family-Aware Identity

- **EVM**: Address format `0x[a-fA-F0-9]{40}`, tx hash `0x[a-fA-F0-9]{64}`. Case-insensitive comparison.
- **Stellar**: Address format `G[A-Z2-7]{55}`, tx hash `[a-fA-F0-9]{64}`. Case-sensitive comparison (base32).
- Stellar hashes and accounts are never forced into EVM formats.

### Settlement Trust Model

The guard extracts payment detail headers (`x-payment-amount`, `x-payment-recipient`,
`x-payment-network`, `x-payment-asset`, `x-payment-settled-at`, etc.) that are attached
by the x402 middleware **after** the resource server verifies settlement with the
facilitator. The middleware is the trust boundary — payment success is never inferred
from unverified client claims.

## Receipts

Receipts are persisted with `chainFamily` and `payerIdentity` fields:

```typescript
type X402PaymentReceipt = {
  chainFamily: "evm" | "stellar";
  payerIdentity?: { chainFamily: string; payer?: string; transactionHash?: string };
  paymentExpiry?: string;
  // ... other fields
};
```

A receipt cannot be replayed for another body, resource, or network because
`requestBodyHash` and `protectedResource` are bound into `requestId`.

## Config

### Environment Variables

| Variable | Purpose |
|---|---|
| `X402_PAY_TO` | Recipient address (EVM or Stellar) |
| `X402_NETWORK` | CAIP-2 network (e.g. `eip155:8453`, `stellar:pubnet`) |
| `X402_ASSET` | Payment asset (defaults to `USDC` for EVM, `USDC:stellar` for Stellar) |
| `X402_FACILITATOR_URL` | Facilitator endpoint |
| `X402_PRICE_USD` | Price in `$X.XX` format |
| `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` | Required for CDP facilitator (Base mainnet) |
| `X402_STELLAR_ENABLED` | Set to `"1"` to enable Stellar scheme registration |
| `X402_PAYMENT_EXPIRY_SECONDS` | Max payment age (default: 300) |

### Fails Closed

- Missing or incomplete facilitator settings → `productionReady: false`
- Base mainnet without CDP facilitator → validation fails
- CDP facilitator without credentials → validation fails
- Stellar enabled with non-Stellar pay-to → validation fails
- `X402_STELLAR_ENABLED` not set → Stellar scheme NOT registered

## Scheme Registry

Located in `src/server/x402/schemes.ts`. EVM (Base) is always registered first.
Stellar is only registered when `X402_STELLAR_ENABLED=1` and the network is a
Stellar CAIP-2 network. The Stellar scheme uses a placeholder until `@x402/stellar`
is available.

## Smoke Tests

Added to `scripts/smoke-api.mjs`:

- `x402 premium requires payment` — no signature → 402
- `x402 duplicate payment rejected` — reused signature → 409
- `x402 terms exposes payment config` — `/api/x402/terms` responds with config
- `x402 deep scan premium unlock` — valid payment → 200 with `premium.unlocked: true`

Use `SMOKE_DUPLICATE_X402_ENABLED=1` to enable duplicate testing.
Use `SMOKE_X402_FULL=1` to enable premium unlock testing.

## Fixture Tests

In `frontend/scripts/agent-fixture-check.ts`:
- Config validation (EVM, Stellar, CDP auth, Base mainnet)
- Fresh payment passes guard
- Chain-family on receipts
- Duplicate rejection
- Amount, recipient, network mismatch rejections
- Payment expiry rejection
- EVM payer identity validation
- Stellar config detection and payer identity validation
- Price format validation

## Known Limitations

### Stellar x402 Settlement

The Stellar path has a registered scheme boundary but uses an EVM placeholder.
Full Stellar x402 settlement requires:
1. A Stellar x402 facilitator
2. `@x402/stellar` scheme package
3. Stellar wallet signing on the client

Until these are available, setting `X402_STELLAR_ENABLED=1` registers the boundary
but Stellar payments will not settle through the placeholder.

### In-Memory Storage

Receipts are stored in-memory (`globalThis`). They reset when the server process
restarts. The Supabase schema is updated with chain-family columns, but the adapter
path is not wired. The storage API contract (`createX402PaymentReceipt`,
`getX402PaymentReceiptByHeaderHash`) is API-compatible with a future persistent adapter.

### Settlement Re-Verification

The guard trusts x402 middleware headers for settlement info. The middleware is the
authoritative settlement verifier with the facilitator. The guard does not independently
call the facilitator to re-verify settlement. This is by design — the middleware layer
is the trust boundary.

### Expiry Without Settlement Timestamp

If the x402 middleware does not attach `x-payment-settled-at`, the expiry check is
skipped. This means expired payments could theoretically pass if the middleware
doesn't provide the header. In practice, the facilitator enforces expiry on its side.

## Rollback

To roll back these changes without reverting code:

1. **Disable Stellar**: Remove or unset `X402_STELLAR_ENABLED`
2. **Disable expiry**: Set `X402_PAYMENT_EXPIRY_SECONDS` to a very high value (e.g., `86400`)
3. **Disable detail checks**: The guard skips amount/recipient/network/asset checks
   when the corresponding middleware headers are absent. If the x402 middleware
   stops sending these headers, the checks become no-ops automatically.

## Roadmap Coverage

V1-090, V1-102, V1-103, V1-127; related Stellar x402 readiness.
