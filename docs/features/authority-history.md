# Contract authority history

The authority-history insight at `/insights/authority-history` traces read-only
Ownable and AccessControl changes for one EVM contract over an explicit block
range. ERC-1967 proxy administration is kept as a separate authority family.
The feature cannot grant, revoke, upgrade, or alert.

## Two refusals

**1. Missing history never proves that no authority exists.**

An empty timeline inside a bounded window is a coverage statement. Custom
access models that do not emit the standard topics are labelled unsupported
rather than assumed absent.

**2. Reconstructed holders are published only from a complete indexed range.**

Grants, revokes, owner transfers, and admin changes compose into a role matrix
only when every event block hash still matches and the scan was not truncated.
A reorg or a missing block hash invalidates reconstructed state while leaving
raw event evidence available.

## Event surface

| Event | Family |
| --- | --- |
| `OwnershipTransferred` | application |
| `RoleGranted` / `RoleRevoked` / `RoleAdminChanged` | application |
| ERC-1967 `AdminChanged` | proxy_admin |

Role IDs and addresses remain exact, lowercase, and chain-scoped. Transaction
links use the configured explorer for the selected network.

## Layout

```
frontend/src/server/research/authority-history/
  schema.ts            contract, limits, report types
  rpc.ts               read-only block / log port
  topics.ts            standard event topics
  logDecoder.ts        typed decode + chronological sort
  reconstruction.ts    holders / admins / owners; family split
  coverage.ts          complete / partial / empty / unavailable
  service.ts           public entry; reorg and gap handling
frontend/src/components/research/authority-history/
  AuthorityHistory.tsx workspace keyed by wallet + network
  ScanRangeForm.tsx    contract and bounded block range
  AuthorityTimeline.tsx chronological evidence list
  RoleMatrix.tsx       reconstructed holders when valid
  CoverageNotice.tsx   range, reorg, gap labels
  EvidenceDrawer.tsx   accessible block-hash / tx detail
frontend/tests/features/authority-history/
```

Entry point: `/insights/authority-history`.

## Verification

```
cd frontend
npm run test:authority-history
npx tsc --noEmit --project tests/features/authority-history/tsconfig.json
npx playwright test e2e/specs/authority-history.spec.ts --project=chromium-desktop
```

Fixtures use an in-memory RPC. No live wallet, funds, paid API, or public RPC
service is required. The focused suite runs on pull requests through
`.github/workflows/feature-authority-history.yml`.
