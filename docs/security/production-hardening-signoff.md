# Production Hardening Sign-Off

> **Note**: This is a template document. Complete and archive before each mainnet deployment.

## Release Information

| Field | Value |
|---|---|
| **Release version** | v1.0.0 |
| **Build hash (frontend)** | `<hash from hash-freeze-build.mjs>` |
| **EVM Policy contract address** | `<address>` |
| **EVM Vault contract address** | `<address>` |
| **EVM RiskRegistry contract address** | `<address>` |
| **Soroban Policy contract ID** | `<contract_id>` |
| **Soroban Vault contract ID** | `<contract_id>` |
| **Target chain(s)/network(s)** | e.g., Ethereum Mainnet, Stellar Mainnet |
| **Date** | YYYY-MM-DD |

## Threat Model Review

| Item | Status | Notes |
|---|---|---|
| Wallet connection compromise | `[ ]` | Must implement SIWE/Stellar Auth before mainnet (gap) |
| XDR/calldata substitution | `[ ]` | Low risk in approval-only mode |
| SEP-1 SSRF | `[ ]` | N/A — SEP-1 not enabled |
| Contract impersonation | `[ ]` | Medium risk — address verification not in UI |
| Stale simulation | `[ ]` | Low risk for high-risk trades |
| Event spoofing | `[ ]` | Low risk — no event listener deployed |
| x402 failure | `[ ]` | Medium risk — no circuit breaker |
| Agent auth abuse | `[ ]` | High risk — no authentication on agent endpoints |
| Automation abuse | `[ ]` | N/A — V3 automation not enabled |

**Authentication gaps are the most critical remaining risk. Do not proceed to mainnet until all HIGH and MEDIUM gaps are addressed.**

## Dependency Review

| Item | Status | Notes |
|---|---|---|
| Frontend npm audit | `[ ]` | 66 vulnerabilities (1 critical — protobufjs, 16 high) |
| Backend npm audit | `[ ]` | 38 vulnerabilities (18 high — hardhat transitive) |
| Soroban cargo audit | `[ ]` | Not yet configured (add to CI) |
| Next.js upgrade | `[ ]` | Upgraded to 16.2.12 |
| High-severity fixes applied | `[ ]` | List applied fixes |

## Contract Review

| Item | Status | Notes |
|---|---|---|
| EVM Policy review (39 checks) | `[ ]` | All pass |
| EVM Vault review | `[ ]` | All pass |
| EVM RiskRegistry review | `[ ]` | All pass |
| Soroban Policy review (24 checks) | `[ ]` | All pass |
| Soroban Vault review | `[ ]` | All pass |

## Test Results

| Item | Status | Notes |
|---|---|---|
| Unit tests pass | `[ ]` | |
| Integration tests pass | `[ ]` | |
| Soak test (48h, testnet) | `[ ]` | Error rate < 2%, P95 latency < 3s |
| Load test (simulation, 200 req @ 10 concurrency) | `[ ]` | |
| Load test (execution, 50 req @ 5 concurrency) | `[ ]` | |
| Low-value smoke test | `[ ]` | |

## Runbook Verification

| Item | Status | Notes |
|---|---|---|
| Deploy procedure tested on testnet | `[ ]` | |
| Rollback procedure tested on testnet | `[ ]` | < 15 minutes |
| Emergency pause tested on testnet | `[ ]` | < 2 minutes |
| Hash freeze manifest generated | `[ ]` | |
| Monitoring dashboards verified | `[ ]` | |
| Alerting configured and tested | `[ ]` | |

## Signatures

| Role | Name | Date | Signature |
|---|---|---|---|
| Lead Maintainer | | | |
| Security Reviewer | | | |
| (Optional) External Auditor | | | |

## Final declaration

> I confirm that all items in this sign-off have been reviewed and the system
> is ready for mainnet deployment. Any unfilled items are documented as
> known risks with mitigation plans in place.

**Date of sign-off**: YYYY-MM-DD
