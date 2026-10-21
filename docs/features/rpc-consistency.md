# Horizon and Stellar RPC consistency

## Why this exists

The app reads Stellar state from Horizon and from Stellar RPC. Those two
providers can be on different ledgers, or one of them can be down. Schema
checks only say whether a response has the expected shape. This check asks
both providers the same question and says whether the answers match, lag, or
conflict.

## What is compared

For an account (`G…`):

| Field | Horizon | Stellar RPC |
| --- | --- | --- |
| Native balance | `balances[]` entry with `asset_type: native` | Account ledger entry balance, in stroops |
| Sequence | Account `sequence` | Account ledger entry `seqNum` |
| Trustlines | Non-native balances on the account document | `getLedgerEntries` for each trustline key |

For a contract (`C…`):

| Field | Horizon | Stellar RPC |
| --- | --- | --- |
| Contract data | No Horizon endpoint exposes contract storage | `getLedgerEntries` for each requested key |

Horizon stamps the whole account document with one `last_modified_ledger`.
RPC stamps each ledger entry with its own `lastModifiedLedgerSeq`. Those two
numbers are the ledgers recorded on the answer.

## Classification

Canonical values are compared only after amounts are converted to integer
stroops. The conversion does not use floating point. More than seven decimal
places is refused rather than rounded.

| Situation | Class |
| --- | --- |
| Both values present, same ledger, same canonical value | `matched` |
| Both values present, same ledger, different canonical value | `conflicting` |
| Ledgers differ, even if the values also differ | `lagging` |
| A ledger is missing, so the answers are not known to be the same moment | `lagging` |
| Only one provider returned the field | `single_source` |

A conflict keeps both raw values. Lag never does. A different ledger is not a
disagreement about the value.

## Provider window

Each provider reports:

- latest ledger (`history_latest_ledger` on Horizon, `getLatestLedger.sequence` on RPC)
- retention window (Horizon `history_elder_ledger` through latest; RPC `oldestLedger` from `getEvents` when that call succeeds)

An unavailable provider is labelled unavailable. Its latest ledger is left
empty. It is not copied from the provider that answered.

## Networks

A request names `testnet` or `mainnet`. The check talks only to that
network's Horizon and RPC. A passphrase or host from the other network aborts
the check with `network_mismatch`. There is no fallback from one network to
the other.

## What it does not do

It does not submit transactions, score providers, or fail over from one
provider to the other. It does not change existing data clients. Contract
data that Horizon does not expose stays a single-source RPC row, and the
coverage notice says so.

## Layout

```
frontend/src/server/research/rpc-consistency/
  schema.ts            request, report, and observation contract
  networkIdentity.ts   testnet and mainnet hosts and passphrases
  horizonProbe.ts      Horizon root and account document
  rpcProbe.ts          getLatestLedger, getNetwork, getEvents, getLedgerEntries
  normalize.ts         stroops and field pairing
  ledgerAlignment.ts   same ledger versus lag
  classify.ts          matched, lagging, conflicting, single-source
  providerStatus.ts    latest ledger and retention window
  coverage.ts          what the report does not cover
  errors.ts            typed error and provider state
  limits.ts            pagination, timeout, and size bounds
  service.ts           runs both probes and builds the report
  index.ts             public entry
frontend/src/components/research/rpc-consistency/
  ConsistencyWorkbench.tsx
  TargetInput.tsx
  ProviderStatus.tsx
  FieldComparison.tsx
  LagSummary.tsx
  CoverageNotice.tsx
  useWorkbenchState.ts
frontend/src/app/insights/rpc-consistency/page.tsx
frontend/src/app/api/insights/rpc-consistency/route.ts
```

## Verification

```
cd frontend
npx vitest run tests/features/rpc-consistency
```

Fixture tests inject probes. They do not call Horizon or RPC. A manual
testnet check is a separate read of a public account against the public
Horizon and RPC endpoints named in `networkIdentity.ts`.
