# Issuance ledger

This page rebuilds outstanding supply for a classic issued asset from issuer-touching operations and compares the running total with the network-reported amount at checkpoints.

## Classification rules

Only the selected `CODE:ISSUER` asset is counted. Amounts are converted to stroops and added with integers.

| Operation | Rule |
|-----------|------|
| `payment`, `path_payment_strict_send`, `path_payment_strict_receive` | Asset leaving the issuer is a **mint** (+). Asset returning to the issuer is a **burn** (−). Same-party or wrong-asset payments are **neutral**. |
| `create_claimable_balance` | When the issuer creates a claimable balance of this asset, outstanding supply rises (**mint**). |
| `clawback`, `clawback_claimable_balance` | Holder balances removed for this asset lower outstanding supply (**burn**). |
| Other issuer operations | Recorded as **neutral** with a zero supply delta when they appear in the window. |

## Running supply and checkpoints

Opening supply is the reconstructed amount just before the first in-window operation (fixtures may set a non-zero opening). Each classified operation updates a running total. At each checkpoint ledger the reconstructed supply is compared with the network-reported amount. The difference is the unreconciled delta. Surrounding operations are listed for every non-zero delta.

Truncated history or a missing network figure makes the report **partial**. Partial history is never called reconciled, even when visible stroops agree.

The page does not assert that an issuer acted improperly, convert prices, or change a risk score.
