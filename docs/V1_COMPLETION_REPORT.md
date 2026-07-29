# V1 Completion Report

**Status: not complete. V1 cannot be declared done from this run.**

This report records an execution of `docs/V1_ACCEPTANCE_MATRIX.md`. It contains
what was observed and nothing else. Where a case was not executed it says so and
why, because a completion report that fills its gaps with assumptions is worse
than no report — it converts an unknown into a false claim.

## Verdict

| | |
|---|---|
| Automated cases passed | 6 of 7 |
| Automated cases failed | 1 (A5, production build) |
| Cases not run | 18 of 25 |
| Blocking issues open | #1, #2, #3, #4 |

The matrix cannot be completed until #1 through #4 land, because most of the
remaining cases test behaviour those issues implement. This report is therefore
a **baseline**: it establishes what already passes, so a later run has something
to compare against.

## Run environment

| Field | Value |
|---|---|
| Commit | recorded in `docs/acceptance/evidence.json` |
| Branch | `issue-5-v1-acceptance-matrix` |
| Deployment URL | **none** — no release candidate was deployed for this run |
| Provider mode (`APP_MODE`) | unset, defaults to `live` |
| Provider credentials configured | none |
| Platform | linux x64 (WSL2) |
| Node | v24.18.0 |
| Rust / Cargo | 1.85.0 |
| Stellar CLI | not installed |

The absence of a deployment URL and provider credentials is the single largest
limitation of this run and the reason so many cases are `not_run`.

## Automated results

Machine-readable evidence, including every command, exit code, duration and
output tail: `docs/acceptance/evidence.json`.

| Id | Case | Result |
|---|---|---|
| A1 | Deploy readiness and secret scan | **pass** |
| A2 | Stellar configuration check | **pass** |
| A3 | Agent fixture and property suite | **pass** |
| A4 | Lint | **pass** |
| A5 | Production build | **fail** |
| A6 | Soroban contract tests | **pass** |
| A7 | EVM contract compile | **pass** |

### A5 — production build failure

```
> next build
Bus error (core dumped)
exit code 135
```

`SIGBUS` is a native crash, not a compile error: `next build` produced no
diagnostics before dying. The same failure reproduces on unmodified `main` in
this environment, so it is **not** caused by any branch under review.

It is reported as `fail` rather than explained away because this runner records
outcomes, not theories. What is known:

- It reproduces on a clean checkout of `main`.
- `npx tsc --noEmit` type-checks the project without error, so the TypeScript is
  sound.
- The most likely cause is the WSL2 environment rather than the repository.

**This must be re-run in CI or on a supported platform before V1 is declared
complete.** A green build elsewhere would resolve A5; nothing in this report
should be read as evidence that the build is broken for everyone.

## Cases not run

Nothing below was executed. None of it may be reported as passing.

### Needs a deployed release candidate and a browser

| Id | Case |
|---|---|
| M1 | Contract-address input flow, desktop |
| M2 | DexScreener link input flow, desktop |
| M3 | Native XLM input |
| M4 | Classic Stellar asset input |
| M5 | Soroban contract asset input |
| M7 | EVM wallet disconnected |
| M9 | Stellar wallet disconnected |
| M10 | Report comprehension review |
| M11 | Mobile viewport acceptance |
| M16 | Smoke suite against the deployment URL |

### Needs a real wallet and user signatures

| Id | Case |
|---|---|
| M6 | EVM wallet connected |
| M8 | Stellar wallet connected |

### Needs the x402 route deployed with a facilitator

| Id | Case |
|---|---|
| M12 | Payment required (402) |
| M13 | Verified payment |
| M14 | Failed payment |
| M15 | Duplicate payment |

M13 additionally needs a funded wallet on the payment network. All four states
are required by the acceptance criteria; recording only M12 and M13 would
misrepresent coverage.

### Blocked by open issues

| Id | Case | Blocked by |
|---|---|---|
| M17 | Supabase migration on a clean database | #1 |
| M18 | No production path returns mock data | #1, #4 |

On M18: A3 proves the guard exists — `assertNoMockSourcesInLive` throws when a
live response carries a mock source. It does **not** prove the guard is never
tripped in production, which needs live credentials. The two claims are recorded
separately on purpose.

## Definition of Done coverage

Against the V1 Definition of Done in `PROJECT_ROADMAP.md`:

| Section | Covered by this run |
|---|---|
| Product DoD | none — every item needs the UI on a deployed build |
| Agent DoD | structurally, via A3; not against live provider data |
| Execution DoD | structurally, via A3 (auto-execute off, no quote means no executable trade, duplicate tx hash and wallet mismatch rejected); not end to end through a wallet |
| Storage DoD | none — the production adapter is #1 |
| Test DoD | partially: unit/fixture tests, lint and contract compile pass; build fails (A5); smoke not run; migration not applied |
| Release DoD | none — no production environment, no provider keys, no deployment |

## Known limitations

1. No release candidate was deployed, so no user-facing behaviour was observed.
2. No provider credentials were configured; every agent result in this
   environment comes from the no-provider path.
3. The production build could not be verified (A5).
4. The Stellar CLI is not installed, so no WASM artifact was built or hashed.
5. The storage adapter is in-memory on `main`; persistence claims are untested.
6. **Manual-review rate: not measured.** It needs a live run over a real token
   sample and must not be estimated.

## Rollback procedure

Recorded for completeness; not exercised in this run.

1. Vercel keeps prior production deployments. Roll back by promoting the last
   known-good deployment from the dashboard.
2. The contracts under `soroban/` and `backend/contracts/` are not upgradeable
   and are not on the V1 critical path — the app functions with them absent.
3. Storage is in-memory on `main`; there is no data migration to reverse. Once
   #1 lands, this section must be rewritten against the real schema.
4. After any rollback, re-run `SMOKE_BASE_URL=… npm run smoke` (M16) and record
   the result here.

## Maintainer sign-off

Not signed, and not signable from this run. The checkpoints below are listed so
the remaining work is explicit; a contributor must not mark any of them.

- [ ] Product DoD reviewed against recorded evidence
- [ ] Agent DoD reviewed
- [ ] Execution DoD reviewed
- [ ] Storage DoD reviewed
- [ ] Test DoD reviewed
- [ ] Release DoD reviewed
- [ ] Known limitations accepted
- [ ] V1 declared complete

Signed: _______________  Date: _______________

## What has to happen next

1. Land #1, #2, #3 and #4.
2. Resolve A5 on a supported platform or in CI.
3. Deploy a release candidate and record its URL and commit SHA.
4. Configure provider credentials and confirm live mode returns no mock data.
5. Re-run `node scripts/acceptance-matrix.mjs`, then work the manual cases on
   desktop and mobile with screenshots.
6. Run all four x402 states against the deployed route.
7. Measure the manual-review rate over a real token sample.
8. Update this report from that run and take it to a maintainer for sign-off.
