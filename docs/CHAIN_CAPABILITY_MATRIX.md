# Chain Capability Matrix

This document records the runtime boundary used during the Stellar integration. `frontend/src/server` is the active application server. Existing EVM behavior remains supported while Stellar implementations are added behind chain-family dispatch.

| Capability | EVM-only implementation | Chain-neutral/reusable layer | Stellar implementation target |
| --- | --- | --- | --- |
| Wallet connection | Wagmi, RainbowKit, EVM wallet client | Unified wallet-session interface and explicit user approval | Stellar Wallets Kit and SEP-43 signing |
| Address and transaction identity | `0x` address and hash validation | Chain-family dispatch, canonical identity keys | SDK validation for `G...`, `C...`, issuers and 64-character hashes |
| Portfolio discovery | GoldRush, Alchemy and EVM RPC | Portfolio snapshot, holdings, risk and data-quality models | Stellar RPC plus curated account/trustline data adapter |
| Token input | EVM address and DexScreener resolution | Normalized scan input and identity evidence | XLM, `CODE:ISSUER`, issuer account and contract resolution |
| Onchain analysis | Bytecode, GoPlus, EVM ownership/tax/holder signals | Agent result, findings, sources, confidence and decision orchestration | Issuer controls, trustline state, liquidity and Soroban contract state |
| News and social agents | No chain-specific signing behavior | Token name/symbol research and agent result model | Reuse after collision-safe Stellar asset identity resolution |
| Decision agent | No direct chain calls | Risk aggregation, confidence and recommended-action policy | Reuse Stellar-native specialist results |
| Transaction preparation | EVM transaction preview and confirmation records | Approval-only policy and audit concepts | Soroban simulation, prepared XDR and RPC confirmation |
| Premium x402 | Exact EVM scheme and Base payment | Protected resource, receipt and idempotency concepts | Exact Stellar scheme with SEP-41 USDC |
| Storage/history | Several EVM-shaped address/hash fields | Storage adapter and history APIs | Network-aware canonical addresses, hashes, ledgers and event IDs |
| UI | Some `0x`, gas and EVM-network copy | Shared cards, agent timeline and risk report presentation | Stellar network, issuer, partial valuation and explorer presentation |

## Invariants during integration

1. Chain-neutral modules must not import a wallet signer or silently select a network.
2. EVM providers remain behind the EVM branch; Stellar provider failures never fall back to EVM or mock data.
3. Stellar assets are identified by native identity, code plus issuer, or contract ID, never by symbol alone.
4. Every state-changing operation is prepared and simulated by the server but signed only by the connected user wallet.
5. Existing EVM quality gates must pass after each integration section.


## Stellar wallet capabilities

Wallets exposed through Stellar Wallets Kit differ in what they can do, and code
that assumes one wallet's behaviour breaks on the others. The matrix is declared
in `frontend/src/server/stellar/wallets/capabilities.ts` and enforced by
`npm run test:wallet-capabilities`.

| Wallet | Signs | Reports network | Announces account switch | Hardware |
| --- | --- | --- | --- | --- |
| Freighter | yes | yes | yes | no |
| xBull | yes | yes | yes | no |
| Albedo | yes | **no** | no | no |
| Rabet | yes | yes | no | no |
| LOBSTR | yes | yes | no | no |
| Hana | yes | yes | yes | no |
| HOT | yes | **no** | no | no |
| WalletConnect | yes | yes | no | no |

A wallet this table does not list is still usable. It gets the conservative
profile — it may sign, and nothing else is assumed — because assuming a
capability a wallet lacks ends in a failed signature, while assuming it lacks one
it has only costs a disabled control with an explanation next to it.

### Network mismatch has three outcomes

`match`, `mismatch`, and `unreported`. The third is not a form of the first: a
wallet that cannot report its network is shown as unverified with an instruction
to confirm it. Treating that as a match is how a user signs a pubnet transaction
believing they are on testnet.

A real mismatch blocks signing. An unreported network does not — several wallets
simply cannot answer, and refusing them outright would be worse than asking the
user to check — but it is surfaced every time.

### Sessions are invalidated, not repointed

A session is the claim "this address, on this network, through this wallet".
When the user switches account or disconnects inside the wallet, the session no
longer describes the connected signer, so it is discarded and the reason is
shown. It is never silently repointed at the new address.

Restoring a session is display-only. It repopulates what the user was looking at
and asks the wallet for nothing, so returning to the page can never trigger a
signature prompt on its own; the badge labels such a session
`restored, not verified` until the wallet confirms it.

