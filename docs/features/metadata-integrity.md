# Metadata integrity inspector

## Why this exists

An issuer's home domain and asset metadata can change after a user first sees
an asset. The identity resolver can obtain SEP-1 metadata, but it does not
explain whether the declaration still matches the issuer or what changed over
time. This feature answers those questions as **observations**.

## The rules that shape the output

**1. A TOML file is not proof of domain ownership.**

Fetching `https://{home_domain}/.well-known/stellar.toml` and finding a
matching `[[CURRENCIES]]` entry means the document named that asset code and
issuer together. It does not mean the domain is controlled by that issuer.
Every report carries `domainOwnershipClaimed: false`.

**2. A metadata change is an observation, not fraud.**

Diffs between snapshots are labelled changes. They are never scored as risk and
never turned into a legitimacy verdict. Every report carries
`changeIsObservationNotFraud: true` and `legitimacyVerdict: null`.

## What it inspects

| Input | Evidence |
| --- | --- |
| Issuer account | Horizon `home_domain`, sequence, last-modified ledger, exact account URL |
| SEP-1 TOML | Bounded HTTPS fetch with explicit TLS / redirect / size / private-IP / timeout outcomes |
| Currency match | Asset **code + issuer** together against `[[CURRENCIES]]` |
| History | Caller-supplied prior observations, filtered to the same network-scoped identity |

## Declaration statuses

| Status | Meaning |
| --- | --- |
| `matched` | Code and issuer appear together; status is not retired |
| `absent` | TOML fetched, but no matching currency pair |
| `conflicting` | Same code, different issuer declared |
| `expired` | Matching pair present but marked dead / retired |
| `unreachable` | Fetch failed or no home domain — comparison impossible |

## Identity scoping

Identity keys are `stellar:{testnet\|pubnet}:{CODE}:{ISSUER}`.

- The same symbol on testnet and pubnet stays distinct.
- Two issuers of the same code on one network stay distinct.
- Prior observations from another identity are ignored, not merged.

## Safe fetch bounds

Published in `METADATA_LIMITS`:

| Bound | Value |
| --- | --- |
| `maxTomlBytes` | 250,000 |
| `maxRedirects` | 3 |
| `fetchTimeoutMs` | 5,000 |
| `maxPriorObservations` | 50 |
| `maxRequestBytes` | 524,288 |

Private hosts, non-HTTPS URLs, oversized bodies, redirect storms, DNS failures
to private addresses, and timeouts all fail closed with an explicit
`TomlFetchOutcome`. They never invent a `matched` declaration.

## Observations and diffs

Each observation records:

- timestamp
- content hash (SHA-256 of the normalized snapshot)
- issuer ledger references
- exact TOML / org / image links
- declaration and fetch outcomes

The timeline is sorted by time. Consecutive snapshots produce a field diff
table for name, description, official URLs, status, code, issuer, home domain,
and TOML URL.

## What it does not do

- Edit issuer metadata
- Change risk scores
- Decide whether an asset is legitimate
- Claim domain ownership from TOML alone

## Verification

```bash
cd frontend
npm run test:metadata-integrity
```

Deterministic fixtures cover matching / conflicting / absent / expired
declarations, historical drift, URL safety probes, API error paths, and
accessible UI labelling.
