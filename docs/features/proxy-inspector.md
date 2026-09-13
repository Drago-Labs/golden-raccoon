# Proxy implementation and upgrade authority inspection

## Why this exists

A token address is frequently not where the token's code lives. A proxy holds
an implementation address and forwards every call to it, which means the code
audited last month can be replaced by different code tomorrow without the
address changing. The dashboard's contract risk view could say nothing about
this, so a reader had no way to tell a fixed contract from one whose behavior
is one transaction away from being different.

This feature answers two questions from observations, and refuses to answer a
third from guesswork:

1. **Where does this contract's code actually come from?** Read from
   standardized storage slots, following supported indirection.
2. **What upgrade authority can be observed?** Read from the admin slot and,
   for beacons, from `owner()`.
3. **Who can upgrade this contract?** — *Not answered.* Authorization for a
   UUPS proxy lives inside the implementation's code, which this feature does
   not read. It reports what it observed and names the gap.

## The rule that shapes the output

**Absence of evidence is never reported as evidence of absence.**

A contract with no admin slot value is not immutable. It is a contract whose
authority was not observable from storage. Every code path that could be
tempted into an immutability claim instead produces `not_observed` with an
explicit limitation, and the `authority-not-observed` finding repeats it:

> This is the strongest statement the observations support. It is not a finding
> that the contract is immutable, and it must not be read as one.

The same rule governs a zero implementation slot, a dirty (non-address) slot
word, a reverting beacon and a failed read. Each has its own outcome and none
of them collapses into "no proxy".

## What it reads

| Slot | Standard | Purpose |
| --- | --- | --- |
| `0x360894…82bbc` | ERC-1967 | implementation |
| `0xa3f0ad…33d50` | ERC-1967 | beacon |
| `0xb53127…d6103` | ERC-1967 | admin |
| `0x7050c9…3f8c3` | OpenZeppelin legacy | implementation |
| `0xc5f16f…2bcf7` | EIP-1822 | proxiable |

Plus `eth_getCode` at each visited address, `implementation()` on a beacon, and
`owner()` on a beacon.

## Bounds

Both bounds are published in `PROXY_LIMITS` and echoed in every report, so a
caller can rely on them rather than discover them:

- **`maxDepth: 6`** — hops of indirection followed. A longer chain is reported
  as truncated, with the final implementation explicitly not named.
- **`maxRpcCalls: 48`** — reads per inspection, enforced by one budget shared
  across every module. Exhausting it degrades the report to `partial`; it never
  throws the completed observations away.

Cycles are detected by a visited set, so a proxy pointing at itself — or a pair
pointing at each other — is reported as `cyclic_indirection` at the moment the
cycle closes, rather than walked until the depth bound hides it.

## Read-only by construction

The service is handed a `ChainReader`, whose four methods are `getBlockNumber`,
`getCode`, `getStorageAt` and `call`. There is no `sendTransaction`, no signer
and no writable capability anywhere in the type. The guarantee that this
feature cannot upgrade a contract, change an admin or submit a transaction is
therefore enforced by the type system, not by review.

The RPC endpoint is resolved server-side from `frontend/src/lib/evm/config.ts`
and never from the request body, so a caller cannot aim the handler at an
arbitrary outbound host.

## One block, not "now"

`latest` is resolved to a concrete block number before the first read, and every
subsequent read uses it. A report therefore describes one consistent moment
rather than a smear across several, and `checkedAtBlock` lets a reader repeat
the same reads.

## States

| Coverage | Meaning |
| --- | --- |
| `complete` | Every planned read completed. |
| `partial` | Some reads failed; conclusions come only from those that did. |
| `empty` | The address holds no code. A successful result, not a failure. |
| `unavailable` | The target's own code read failed; nothing is claimed. |

## Layout

```
frontend/src/server/research/proxy-inspector/
  schema.ts              contract, limits, slot table, ChainReader port
  standardSlots.ts       slot word decoding; refuses to truncate dirty words
  codeReader.ts          code reads as three-state evidence
  storageReader.ts       per-slot reads; one failure does not erase the rest
  beaconResolver.ts      implementation() with revert handling
  implementationGraph.ts bounded walk with cycle detection
  authorityEvidence.ts   observed authority, never inferred control
  classification.ts      observations to label, summary, findings, coverage
  service.ts             public entry; enforces the shared read budget
  rpc.ts                 production JSON-RPC reader
frontend/src/components/research/proxy-inspector/
  ProxyInspector.tsx     workspace; session keyed by account and network
  ContractInput.tsx      address and explicit network choice
  ImplementationGraph.tsx path as an accessible ordered list
  AuthorityTable.tsx     each row carries its own limitation
  ProxyEvidence.tsx      the raw reads behind every statement
frontend/tests/features/proxy-inspector/
```

Entry point: `frontend/src/components/RiskBreakdownCard.tsx`.

## Verification

```
cd frontend
npm run test:proxy-inspector      # or: npx vitest run tests/features/proxy-inspector
npx playwright test e2e/specs/proxy-inspector.spec.ts
```

The focused suite runs on every pull request through
`.github/workflows/feature-proxy-inspector.yml`. No test contacts a chain: the
whole feature reads through one port, and the fixtures in
`tests/features/proxy-inspector/fixtures.ts` are plain objects describing what
each address would have returned. No funds, keys or paid services are involved.
