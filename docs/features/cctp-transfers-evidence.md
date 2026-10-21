# CCTP transfer tracker — sources, limits, and what was verified

## Data sources

- The source chain's own RPC endpoint (`eth_getTransactionReceipt`), for
  the burn step.
- `https://iris-api.circle.com` (mainnet) / `https://iris-api-sandbox.circle.com`
  (testnet) — Circle's CCTP attestation service — for the attestation step.
- The destination chain's own RPC endpoint (EVM `eth_call`) or Stellar's
  Soroban RPC (`simulateTransaction`), for the destination step.
- No other third-party API or database is used.

## Domain coverage

CCTP domain IDs and names are from Circle's `cctp-supported-blockchains`
reference. This tool has a working RPC path for:

| Domain | Chain | Source read | Destination read |
| --- | --- | --- | --- |
| 0 | Ethereum | yes | yes |
| 1 | Avalanche | yes | yes |
| 2 | OP Mainnet | yes | yes |
| 3 | Arbitrum | yes | yes |
| 6 | Base | yes | yes |
| 7 | Polygon PoS | yes | yes |
| 27 | Stellar | no (not a burn source in CCTP V2) | yes |

Every other real CCTP domain (Noble, Solana, Sui, Aptos, Unichain, Linea,
Codex, Sonic, World Chain) is named correctly in `domainMap.ts` but has no
RPC configured here, so a transfer that burns on or mints to one of them
reports that step as `unknown` with a note naming the missing RPC path —
never as a wrong chain name. A domain number outside this entire list is
shown as `Unknown domain N`.

## What was verified before this feature was written

- **Message format.** The CCTP V2 header (148-byte fixed) and
  `BurnMessage` body (228-byte fixed) offsets were read from
  `MessageV2.sol`'s and `BurnMessageV2.sol`'s `*_INDEX` constants in
  `circlefin/evm-cctp-contracts`, then cross-checked by decoding a real
  message returned by Circle's attestation API for a live Sepolia burn.
- **Event signatures.** `DepositForBurn` and `MessageSent` were read
  directly from `TokenMessengerV2.sol` and `MessageTransmitterV2.sol`. A
  docs-page summary of `DepositForBurn`'s parameters disagreed with the
  source (wrong field list, missing `hookData`) — the source is what this
  tool decodes against.
- **`usedNonces`.** `BaseMessageTransmitter.sol` declares
  `mapping(bytes32 => uint256) public usedNonces`. Its auto-generated
  getter (selector `0xfeb61724`) was called against the live mainnet
  `MessageTransmitterV2` contract: the zero nonce returned `1` (the
  contract reserves it at construction) and an arbitrary unused nonce
  returned `0`.
- **Contract addresses.** `TokenMessengerV2`/`MessageTransmitterV2`
  mainnet and testnet addresses are from Circle's `contract-addresses`
  reference and were confirmed to have deployed bytecode on Ethereum
  mainnet and Sepolia before use.
- **A real end-to-end burn.** A genuine Sepolia `DepositForBurn` was found
  on-chain, decoded, and successfully looked up through Circle's live
  `/v2/messages` endpoint, which returned a `complete` status with a
  destination mint transaction hash.
- **Stellar contract IDs** are from Circle's `stellar-contracts`
  reference. `is_nonce_used`'s exact argument shape is **not**
  independently verified against contract source — Circle's Stellar CCTP
  contracts are not published as browsable source — so a wrong assumption
  there fails the simulation and surfaces as `state: "unknown"` with the
  RPC's own error message, never as a false "pending" or "completed".

## Bounds

| Bound | Value |
| --- | --- |
| RPC/attestation fetch timeout | 8,000 ms |
| Max messages read from one attestation response | 1 (the request names a single transfer) |
| Max request body size | 8,192 bytes |

## Amount reconciliation

The minted amount is always `amount - feeExecuted` once a message is
processed — this is a protocol guarantee, not something this tool reads
separately from the destination chain. `feeExecuted` is `0` in the
originally emitted `MessageSent` log and is only populated once Circle
attests the message with its final fee, which is why reconciliation
reports `pending_fee` (not `reconciled` with a fee of zero) until the
attested message is available.
