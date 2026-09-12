# Shared exposure map

An allocation can look diversified while several positions depend on the same
issuer, protocol or underlying asset. This map shows those shared dependencies
and, just as clearly, the portion it could not resolve.

## The rule the feature is built on

**A relationship exists only if someone declared it, with a stated source.**

There is deliberately no `inferred` provenance. Two holdings sharing a symbol,
a name, or even an issuer address are never merged on that basis alone:

- A declaration addressed by a bare symbol that matches more than one holding is
  reported as **unmatched**, not applied to all of them. Applying it would be an
  inference about common ownership.
- The asset identity key is code *and* issuer for classic Stellar assets, so one
  issuer's several assets stay separate nodes.
- Node keys are network-scoped, so `Centre Consortium` on pubnet and on Ethereum
  are two nodes with two totals.

## Modules

Feature logic lives in `frontend/src/server/research/exposure-map/`:

| Module | Responsibility |
| --- | --- |
| `schema.ts` | Versioned types, request validation, bounds, micro-USD conversion. |
| `holdingsAdapter.ts` | Network-scoped canonical keys and the alias set a declaration may address a holding by. |
| `relationshipInput.ts` | Resolves declarations to holdings or previously declared nodes via a fixed point, so nested chains are expressible; reports ambiguous and unmatched declarations. |
| `graphBuilder.ts` | Builds the directed graph and collapses duplicate edges before traversal. |
| `cycleGuard.ts` | Bounded depth-first traversal per holding with explicit cycle detection. |
| `allocation.ts` | Attributes holding value to reached nodes, once per node, in integer micro-USD. |
| `concentration.ts` | Grouped view, shares against the known-value base, overlap counting. |
| `coverage.ts` | Unresolved holdings and the complete / partial / empty determination. |
| `service.ts` | `buildExposureMap(request)` — the only public entry point. |

Presentation lives in `frontend/src/components/research/exposure-map/`:
`ExposureMap`, `ExposureGraph`, `DependencyTable`, `ConcentrationPanel`,
`CoveragePanel`.

## Arithmetic

All value arithmetic is integer **micro-USD** (`toMicroUsd` / `fromMicroUsd`),
so grouping many small positions cannot drift the way repeated float addition
does. Fixture totals are asserted as exact integers, not approximations.

A holding contributes its full value to every node it reaches, **once per
node**. The map answers "how much of this portfolio touches this issuer", which
is not a partition — an asset belongs to both its issuer and its protocol. The
grouped table's caption and the coverage note both say so, and
`overlappingGroupCount` quantifies it.

Shares are expressed against the **known-value base** — the sum of holdings with
a usable price — never against an assumed portfolio total. With unpriced
holdings present, a share of the whole portfolio would be a number nobody can
justify.

## Cycles, nesting and bounds

Traversal is per holding, depth-first, with a per-path visited set:

- An edge that would revisit a node already on the current path is recorded as
  `dropped_cycle` and never followed. It still appears in the dependency table,
  labelled "Cycle — not counted", so the cycle is visible without being counted.
- A path reaching `maxTraversalDepth` (8) records `dropped_depth`.
- An identical declaration is collapsed to `dropped_duplicate` before traversal.

Bounds: 500 holdings, 1 000 relationships, 2 000 nodes, 512 KB body. The route
rate-limits to 30 requests per minute.

## Entry points

- Page: `/insights/exposure-map`
- API: `POST /api/insights/exposure-map`
- Link: "Map shared issuer and protocol exposure" on `WalletPortfolioCard`.

## Accessibility

The dependency **table is the canonical view** and carries every relationship
the diagram draws, including the dropped ones. The SVG is `aria-hidden` and
purely decorative; nothing is reachable only by looking at the picture. The
view toggle is a labelled button group using `aria-pressed`.

## Data handling

`buildExposureMap` is pure: it reads its request and returns a map. It performs
no write, makes no outbound request, and calls no stress, cost-basis or
execution service. Responses are `no-store`. The session component is keyed on
wallet and network, so a switch remounts it and a generation guard discards any
response that resolves afterwards.

## Verification

```bash
npm ci --prefix frontend
npx --prefix frontend vitest run tests/features/exposure-map
npx --prefix frontend playwright test e2e/specs/exposure-map.spec.ts
npm run quality:gate
```

CI runs the focused suite in `.github/workflows/feature-exposure-map.yml`.

## Fixture assumptions

`frontend/tests/features/exposure-map/fixtures.ts` uses values chosen so every
expected total is an exact integer in micro-USD. Fixtures cover
shared-issuer-mixed-chain (including a same-symbol asset from a different issuer
and the same symbol on another chain), nested-cycle-with-duplicate-edge,
partial-prices-with-an-unmapped-holding, a valid empty portfolio, and an
ambiguous bare-symbol declaration. Nothing touches a network, a wallet, or a
paid provider.

## Out of scope

Scenario stress testing, PnL, automatic bridge provenance discovery, risk-score
mutation and rebalancing.
