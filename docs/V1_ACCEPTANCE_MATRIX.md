# V1 Acceptance Matrix

The complete set of cases a V1 release candidate must pass, and how each one is
executed.

Every case has an id. `scripts/acceptance-matrix.mjs` runs the automated half
and writes `docs/acceptance/evidence.json` using these same ids, so the matrix
and the evidence cannot drift apart. The manual half is listed here in full —
including the cases the script cannot run — so a reader always sees the whole
surface rather than only the part a machine happened to cover.

## How to run

```sh
# Automated cases, writing docs/acceptance/evidence.json
node scripts/acceptance-matrix.mjs

# Skip the production build (useful when triaging a build environment)
node scripts/acceptance-matrix.mjs --skip-build

# Smoke suite against a running deployment (case M16)
SMOKE_BASE_URL=https://<deployment-url> npm run smoke
```

Record the commit SHA, deployment URL and provider mode with every run. A
result without them is not evidence: the same suite passing in demo mode says
nothing about live.

## Status vocabulary

| Status | Meaning |
|---|---|
| `pass` | Executed, and it met the pass criterion. |
| `fail` | Executed, and it did not. |
| `not_run` | Not executed. Never a substitute for `pass`. |
| `blocked` | Cannot be executed until a named dependency lands. |

`not_run` is deliberately noisy. A completion report assembled from this matrix
should show its gaps, because declaring coverage that was never exercised is the
one outcome the acceptance process exists to prevent.

---

## A. Automated cases

Run by `scripts/acceptance-matrix.mjs`. Each records its command, exit code,
duration and output tail.

| Id | Case | Command | Pass criterion |
|---|---|---|---|
| A1 | Deploy readiness and secret scan | `npm run deploy:check` | Exit 0. No secret pattern anywhere in the source tree. |
| A2 | Stellar configuration check | `npm run test:stellar-config` | Exit 0. Network passphrases, RPC URLs and asset identity rules are consistent. |
| A3 | Agent fixture and property suite | `npm run test:agents` | Exit 0. Covers all five agents, decision properties, execution policy, x402 guards and storage. |
| A4 | Lint | `npm run lint` | Exit 0, no warnings. |
| A5 | Production build | `npm run build` | Exit 0. |
| A6 | Soroban contract tests | `cargo test --manifest-path soroban/Cargo.toml` | Exit 0. |
| A7 | EVM contract compile | `npx hardhat compile` in `backend/contracts` | Exit 0. |

### Agent DoD covered by A3

A3 is the automated proxy for the roadmap's Agent DoD. It asserts that each
agent returns `score`, `confidence`, `summary`, `findings`, `sources` and
`missingData`; that a critical finding cannot be lost in the final decision;
that low confidence is never read as safe; and that missing data never raises
confidence. It does **not** prove the agents produce good scores against live
provider data — that is M10 and M18.

---

## B. Input flow cases (manual)

The primary report flow, on desktop unless stated. Each needs a browser against
a deployed build.

| Id | Case | Steps | Pass criterion |
|---|---|---|---|
| M1 | Contract-address input | Paste an EVM token contract address, select its network, Analyze. | A report renders with Buy Risk, confidence, verdict, at least three reasons, sources and missing data. |
| M2 | DexScreener link input | Paste a DexScreener pair URL, Analyze. | Token identity resolves to the same token as M1 when the link points at it; the report renders. |
| M3 | Native XLM | Enter `XLM` or `native` on a Stellar network, Analyze. | Identity resolves to native XLM; the report renders without EVM-shaped fields. |
| M4 | Classic Stellar asset | Enter `CODE:ISSUER` for a real classic asset, Analyze. | Identity resolves to `classic:CODE:ISSUER`; the report renders. |
| M5 | Soroban contract asset | Enter a `C…` contract id, Analyze. | Identity resolves to `contract:C…`; the report renders. |

Record for each: the exact input, the resolved identity, the Buy Risk and
confidence shown, and a screenshot.

## C. Wallet state cases (manual)

| Id | Case | Pass criterion |
|---|---|---|
| M6 | EVM wallet connected | Portfolio exposure appears in the report and contributes to Buy Risk. Every transaction still requires a wallet signature. |
| M7 | EVM wallet disconnected | The report renders without portfolio exposure and says so, rather than silently scoring exposure as zero. |
| M8 | Stellar wallet connected | Stellar balances, trustlines and reserves are reflected; network mismatch is surfaced. |
| M9 | Stellar wallet disconnected | As M7, for Stellar. |

The distinction that matters in M7 and M9: *absent* portfolio data must read as
absent. Treating it as zero exposure would understate risk for exactly the users
who did not connect a wallet.

## D. Comprehension and presentation (manual)

| Id | Case | Pass criterion |
|---|---|---|
| M10 | Report comprehension | A reader who is not on the project can state, from the screen alone: the Buy Risk, the confidence, the verdict, the top reasons, which sources were used, what data is missing, and that execution requires their wallet approval. |
| M11 | Mobile viewport | At 375px wide the report is readable, no horizontal scroll, controls are reachable one-handed, and no content is clipped. |

M10 is a judgement call and should be recorded as such, with the reviewer named
and any wording that confused them quoted verbatim.

## E. x402 Deep Scan (manual)

All four states must be recorded, not only the happy path.

| Id | Case | Pass criterion |
|---|---|---|
| M12 | Payment required | An unpaid request to the Deep Scan route returns 402 with a well-formed payment requirement. |
| M13 | Verified payment | A valid payment header is verified and the Deep Scan result is returned exactly once. |
| M14 | Failed payment | A rejected payment yields a clear failure and **no** Deep Scan result. |
| M15 | Duplicate payment | A replayed payment header is recognised as duplicate and does not yield a second paid result. |

## F. Release and data integrity

| Id | Case | Pass criterion | Blocked by |
|---|---|---|---|
| M16 | Smoke suite against the deployment URL | `SMOKE_BASE_URL=… npm run smoke` exits 0. | needs a deployment |
| M17 | Supabase migration on a clean database | `frontend/src/server/storage/schema.sql` applies cleanly and the history page reads from it. | #1 |
| M18 | No production path returns mock data | With live credentials, no response carries a source with `status: "mock"`, and `/api/health` reports `runtimeMode.liveModeUsesMockData: false`. | #1, #4 |

M18 is partially covered by A3, which asserts the *guard* exists
(`assertNoMockSourcesInLive`). Proving the guard is never tripped in production
needs live credentials, so the two are recorded separately.

---

## Recording requirements

Every acceptance run must record:

- Commit SHA, and whether the working tree was clean.
- Deployment URL, if any.
- Provider mode (`APP_MODE`) and which provider credentials were configured.
- Every automated command and its exit code — `scripts/acceptance-matrix.mjs`
  does this.
- For manual cases: who ran it, on what device and browser, with screenshots.
- Known limitations and any manual-review rate observed.
- The rollback procedure in force at the time.

## Maintainer sign-off

Sign-off is a maintainer action. This matrix lists the checkpoints; it does not
record approval, and no contributor may mark these on a maintainer's behalf.

- [ ] Product DoD reviewed against the recorded evidence.
- [ ] Agent DoD reviewed.
- [ ] Execution DoD reviewed.
- [ ] Storage DoD reviewed.
- [ ] Test DoD reviewed.
- [ ] Release DoD reviewed.
- [ ] Known limitations accepted.
- [ ] V1 declared complete.

Signed: _______________  Date: _______________
