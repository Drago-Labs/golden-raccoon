# Offline signing payload and permission inspector

## Why this exists

A wallet prompt is the worst possible place to read a transaction for the
first time. It appears at the moment of commitment, it is small, and its
summary is often written by the site asking for the signature. Users needed
somewhere to look at an unsigned payload *before* that prompt appears.

This feature decodes what a payload requests. It runs entirely offline: no
RPC, no token metadata lookup, no simulation, no chain of any kind.

## The rule that shapes the output

**Decoding is not approval.**

That a payload's bytes are readable says nothing about whether signing it is a
good idea. The decoder can tell you a spender will be able to move your entire
balance; it cannot tell you whether that spender is a router you meant to use
or an address a phishing page substituted. The report carries
`decodingIsNotApproval: true` as *data*, and the workspace renders the caveat
next to every result, so no code path can turn a successful decode into a
green checkmark.

The second rule follows from the first: **an unrecognized selector stays
unrecognized.** There is no ABI discovery and no signature-database lookup. A
wrong guess about what `0xdeadbeef` does is worse than no guess, because the
user would act on it. Unknown selectors, undeclared message fields, trailing
bytes and uninterpreted Stellar operations are all listed in full, never
dropped and never collapsed into a count.

## What it decodes

| Payload | Decoded | Not decoded |
| --- | --- | --- |
| EVM calldata | `transfer`, `approve`, `transferFrom`, `increaseAllowance`, `decreaseAllowance` | every other selector — shown raw |
| EIP-712 typed data | ERC-2612 `Permit`, when the declared type really has ERC-2612's five fields in order | other primary types — fields listed, not interpreted |
| Stellar envelope | source, fee, sequence, memo, preconditions, `payment`, `createAccount`, `changeTrust`, `setOptions`, `accountMerge`, path payments | other operations — preserved with `supported: false` |

A document whose primary type is *named* `Permit` but declares different fields
is reported as an unrecognized structure. Trusting the name would be trusting
the attacker's label.

## Context binding, in three states

A payload is only safe relative to an intention, so the report compares it
against the account, chain and contract the user says they expect. The third
state is the one that matters:

- **`match` / `mismatch`** — the payload declares this field, and it does or
  does not agree with the expectation.
- **`not_bound`** — the payload declares nothing to compare against.

Raw calldata carries no chain id. A Stellar envelope carries **no network
identifier at all** — the network only enters when the signature is made, by
hashing the passphrase together with the envelope. Reporting that as `match`
would be a lie; reporting it as `mismatch` would be alarmism. It is reported as
`not_bound`, with the reason spelled out.

For the same reason, the workspace sends the user's chosen Stellar network as
an *expectation only* and never echoes it back onto the payload. A comparison
between the user's choice and the user's choice would always be green and
always be meaningless.

## Bounds, enforced before parsing

Published in `SIGNING_LIMITS`:

| Bound | Value |
| --- | --- |
| `maxRequestBytes` | 262,144 |
| `maxPayloadChars` | 65,536 |
| `maxTypedDataDepth` | 8 |
| `maxTypedDataNodes` | 2,048 |
| `maxTypedDataTypes` | 64 |
| `maxOperations` | 100 |

Shape measurement is iterative rather than recursive, so a deeply nested
document is refused by the depth check rather than by a stack overflow, and
cyclic structures are detected explicitly.

## Determinism

Expiry is compared against a caller-supplied `evaluatedAt`, never a server
clock. The same payload with the same evaluation time always produces the same
report, which is what makes the fixtures meaningful.

## Nothing is retained

The payload exists in the request body and in the workspace's own React state.
The endpoint writes nothing, caches nothing (`cache-control: no-store`) and
holds nothing between calls. The workspace session is keyed by account and
network, so switching either remounts it and discards the payload with it.

There is no signer in this feature and no field that could accept a private
key or seed phrase — the form says so, and there is nothing for such a value
to be typed into.

## Layout

```
frontend/src/server/research/signing-inspector/
  schema.ts          contract, limits, selector allowlist
  payloadLimits.ts   size, depth, node and cycle checks, before parsing
  evmCalldata.ts     allowlisted selectors; unknown stays unknown
  typedData.ts       EIP-712 walked from its own declared type table
  stellarEnvelope.ts envelope fields via the installed SDK
  operations.ts      operations interpreted where possible, preserved where not
  permissions.ts     ordering: the permission that grants most comes first
  contextBinding.ts  match / mismatch / not_bound
  service.ts         public entry; pure and stateless
frontend/src/components/research/signing-inspector/
  SigningInspector.tsx    workspace; session keyed by account and network
  PayloadInput.tsx        payload plus the context the user expects
  PermissionSummary.tsx   consequence first, raw provenance alongside
  OperationList.tsx       every operation, interpreted or not
  UnknownFieldsPanel.tsx  what the decoder would not guess at
frontend/tests/features/signing-inspector/
  typedArrayRealm.ts      test-only fix for the jsdom typed-array realm
```

Entry point: `frontend/src/components/TransactionPreview.tsx`.

## A note on `typedArrayRealm.ts`

Under vitest's jsdom environment the global `Uint8Array` comes from the jsdom
realm while `Buffer` still comes from Node's, so a `Buffer` is not
`instanceof Uint8Array` and the XDR codec inside `@stellar/stellar-sdk`
asserts on exactly that check. The module restores the invariant for this
feature's tests only; production code never loads it, and the Node server the
route runs on never had the problem.

## Verification

```
cd frontend
npm run test:signing-inspector    # or: npx vitest run tests/features/signing-inspector
npx playwright test e2e/specs/signing-inspector.spec.ts
```

The focused suite runs on every pull request through
`.github/workflows/feature-signing-inspector.yml`. Every fixture is built in
process: calldata is assembled from its selector and argument words, and
Stellar envelopes are built with the installed SDK from a fixed seed, so the
XDR strings are reproduced by running the file rather than pasted from a
chain. No funds, keys or paid services are involved.
