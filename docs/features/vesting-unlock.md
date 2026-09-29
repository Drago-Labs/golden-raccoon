# Vesting and unlock workbench

`/insights/vesting-unlock` normalizes supported EVM and Stellar vesting contracts,
plus issuer-published schedules, into dated unlock tranches. It is read-only:
there is no claim, schedule, or submission surface.

## Two refusals

**1. It will not treat a published schedule as onchain enforcement.**

Every tranche carries `sourceType`: `onchain_enforced` or `published_only`. The
UI labels them distinctly. Combining both into one “will unlock” number would
invent a future the evidence does not support.

**2. It will not double-count a cancelled or amended schedule.**

Superseded revisions stay in the report as `state: cancelled` and are excluded
from `coverage.countedFutureBaseUnits`. An unknown beneficiary or unsupported
contract is an evidence gap, never a guessed address or invented tranche.

## States

| State | Meaning |
| --- | --- |
| `released` | Unlock time has passed (or the contract marked it released) |
| `claimable` | Unlocked onchain and waiting for a claim this feature never performs |
| `scheduled` | Still ahead of the observation clock |
| `cancelled` | Superseded or explicitly cancelled; not counted ahead |
| `unknown` | Evidence incomplete (stale ledger, missing beneficiary, decode gap) |

## Exact units and clocks

Amounts are integer base units (`bigint`). Linear plans are split with
remainder on the last segment so no unit is invented or lost. Classification
uses UTC / ledger close time. The request `displayTimeZone` only relabels the
table; it never feeds back into state arithmetic.

## Layout

```
frontend/src/server/research/vesting-unlock/
  schema.ts      contract, limits, VestingReader port
  unitMath.ts    exact base-unit arithmetic
  time.ts        ledger / TZ helpers
  normalize.ts   cliff, linear, fixed tranches, revisions
  coverage.ts    timeline + coverage notes
  reader.ts      fixture / production read port
  service.ts     public entry; shared read budget
frontend/src/components/research/vesting-unlock/
frontend/tests/features/vesting-unlock/
```

## Verification

From `frontend/`:

```bash
npx vitest run tests/features/vesting-unlock
npx tsc --noEmit --project tests/features/vesting-unlock/tsconfig.json
npx eslint src/server/research/vesting-unlock src/components/research/vesting-unlock src/app/api/insights/vesting-unlock src/app/insights/vesting-unlock tests/features/vesting-unlock e2e/specs/vesting-unlock.spec.ts
PORT=3020 NEXT_PUBLIC_APP_URL=http://localhost:3020 npx playwright test e2e/specs/vesting-unlock.spec.ts --project=chromium-desktop --project=chromium-mobile
```

All fixtures intercept provider I/O and require no live account, funds, signing,
or paid service. Arbitrary vesting bytecode remains out of scope.
