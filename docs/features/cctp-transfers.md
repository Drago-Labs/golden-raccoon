# CCTP transfer tracker

## Why this exists

A Circle CCTP V2 USDC transfer crosses two chains and an off-chain
attestation service. When funds do not arrive, a user has no way to tell
which step stalled: the burn, Circle's attestation, or the destination
receipt. This tool answers that question with evidence, never with a
verdict on whether funds are safe or lost.

## The rule that shapes the output

**Every step is reported on its own — completed, pending, failed, or
unknown — never collapsed into one answer.** `transferVerdict` is
hard-coded to `null`. A transfer that is still pending attestation is not
"stuck" and a transfer whose destination check could not run is not
"failed" — it is `unknown`, and the step's `issues` say why.

## What it inspects

| Step | Evidence |
| --- | --- |
| Source burn | The `DepositForBurn`/`MessageSent` logs on the source chain's `TokenMessengerV2`/`MessageTransmitterV2`, decoded independently from the raw message bytes |
| Attestation | Circle's `/v2/messages` endpoint: status, the attested message (with the final destination fee), and the destination mint transaction hash Circle reports |
| Destination receipt | A single `usedNonces`/`is_nonce_used` read on the destination chain's `MessageTransmitterV2` — including Stellar (domain 27) via its forwarder — independent of what Circle reported |
| Amount | Burned amount minus the attested destination fee, computed from the two already-decoded numbers |

## Verified before writing any decoder

The CCTP V2 message header and `BurnMessage` body byte offsets, the
`DepositForBurn`/`MessageSent` event signatures, and the `usedNonces`
function selector were all confirmed against
`circlefin/evm-cctp-contracts`' actual Solidity source and a live mainnet
contract call — not from a docs page summary, which gave a different
(wrong) `DepositForBurn` parameter list than the source. A real, recent
Sepolia testnet burn was decoded end to end, including a successful
`/v2/messages` attestation lookup, before this feature's code was
written. See `cctp-transfers-evidence.md` for what was checked.

## Independent verification, not Circle's word alone

Circle's attestation response can report a `destinationMintTxHash` once a
transfer completes. This tool surfaces that field as-is
(`attestation.destinationMintTxHashReported`) but never treats it as the
authority on completion — `destination.nonceUsed` is checked directly
against the destination chain's own contract state, so a transfer this
tool reports as `completed` on the destination step is one it verified
itself, not one it took Circle's word for.

## Why no destination log scan

An earlier design considered scanning the destination chain for a
`MessageReceived` event. `usedNonces(bytes32) -> uint256` (EVM) is a
single bounded read with no block-range search needed, and was preferred
because it never risks missing an old transfer outside a scanned window —
see `cctp-transfers-evidence.md` for the exact call this makes.

## Only the chains this app can reach are checked end to end

Real CCTP domains the app has no RPC path for are still named correctly
(`describeDomain`), never shown as "unknown" when they are in fact known
— only a domain outside Circle's own published list is shown as
`Unknown domain N`. See `cctp-transfers-evidence.md` for exactly which
chains this tool can read.
