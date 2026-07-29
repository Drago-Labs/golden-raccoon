# Route coverage

Maps every HTTP route under `frontend/src/app/api/**/route.ts` to its
OpenAPI `operationId` in `docs/openapi/v1/openapi.json` and its conformance
test coverage. Regenerate/verify this table's accuracy by running
`npm run test:openapi` (frontend), which fails if any route/method pair is
undocumented or if the spec documents a route/method that no longer exists.

Error shape legend:

- **Legacy** — route returns `LegacyErrorEnvelope` (`{ error, detail? }`) on error.
- **Migrated** — route returns `MigratedErrorEnvelope` (stable `code`/`message`/`retryable`/`requestId` fields alongside the legacy fields), via `frontend/src/server/api/errors.ts`.

| Route file | Method | Path | operationId | Error shape | Test coverage |
|---|---|---|---|---|---|
| `agent/analyze/route.ts` | POST | `/agent/analyze` | `postAgentAnalyze` | Legacy | `openapi-check.ts` (coverage) |
| `agent/decision/route.ts` | POST | `/agent/decision` | `postAgentDecisionLegacy` | Legacy | `openapi-check.ts` (coverage) |
| `agents/decision/route.ts` | POST | `/agents/decision` | `postAgentsDecision` | Legacy | `agent-fixture-check.ts` (`runDecisionChecks`), `openapi-check.ts` |
| `agents/execution/route.ts` | POST | `/agents/execution` | `postAgentsExecution` | Legacy | `agent-fixture-check.ts` (`runExecutionChecks`), `openapi-check.ts` |
| `agents/news/route.ts` | POST | `/agents/news` | `postAgentsNews` | Legacy | `agent-fixture-check.ts` (`runNewsChecks`), `openapi-check.ts` |
| `agents/onchain/route.ts` | POST | `/agents/onchain` | `postAgentsOnchain` | **Migrated** | `agent-fixture-check.ts` (`runOnchainChecks`), `openapi-conformance-check.ts` (`AgentResult`, `Error`) |
| `agents/portfolio/route.ts` | POST | `/agents/portfolio` | `postAgentsPortfolio` | Legacy | `openapi-check.ts` (coverage) |
| `agents/social/route.ts` | POST | `/agents/social` | `postAgentsSocial` | Legacy | `agent-fixture-check.ts` (`runSocialChecks`), `openapi-check.ts` |
| `alerts/alerts/route.ts` | GET | `/alerts/alerts` | `getAlerts` | Legacy | `openapi-check.ts` (coverage) |
| `alerts/alerts/[id]/acknowledge/route.ts` | POST | `/alerts/alerts/{id}/acknowledge` | `postAlertAcknowledge` | Legacy | `openapi-check.ts` (coverage) |
| `alerts/deliveries/route.ts` | GET | `/alerts/deliveries` | `getAlertDeliveries` | Legacy | `openapi-check.ts` (coverage) |
| `alerts/observations/route.ts` | GET | `/alerts/observations` | `getAlertObservations` | Legacy | `openapi-check.ts` (coverage) |
| `alerts/observations/[id]/route.ts` | GET | `/alerts/observations/{id}` | `getAlertObservation` | Legacy | `openapi-check.ts` (coverage) |
| `alerts/route.ts` | GET | `/alerts` | `getDiscoveryAlerts` | Legacy | `openapi-check.ts` (coverage) |
| `alerts/route.ts` | POST | `/alerts` | `postDiscoveryAlertAcknowledge` | Legacy | `openapi-check.ts` (coverage) |
| `alerts/rules/route.ts` | GET | `/alerts/rules` | `getAlertRules` | Legacy | `openapi-check.ts` (coverage) |
| `alerts/rules/route.ts` | POST | `/alerts/rules` | `postAlertRule` | Legacy | `openapi-check.ts` (coverage) |
| `alerts/rules/route.ts` | DELETE | `/alerts/rules` | `deleteAlertRule` | Legacy | `openapi-check.ts` (coverage) |
| `auto-mode/route.ts` | GET | `/auto-mode` | `getAutoMode` | Legacy | `openapi-check.ts` (coverage) |
| `auto-mode/route.ts` | PUT | `/auto-mode` | `putAutoMode` | Legacy | `openapi-check.ts` (coverage) |
| `auto-mode/authorization/route.ts` | POST | `/auto-mode/authorization` | `postAutoModeAuthorization` | Legacy | `openapi-check.ts` (coverage) |
| `discovery/candidates/route.ts` | POST | `/discovery/candidates` | `postDiscoveryCandidates` | Legacy | `openapi-check.ts` (coverage) |
| `discovery/classify/route.ts` | POST | `/discovery/classify` | `postDiscoveryClassify` | Legacy | `openapi-check.ts` (coverage) |
| `discovery/scan/route.ts` | POST | `/discovery/scan` | `postDiscoveryScan` | Legacy | `openapi-check.ts` (coverage) |
| `execute/confirm/route.ts` | POST | `/execute/confirm` | `postExecuteConfirm` | Legacy | `agent-fixture-check.ts` (`runTransactionLifecycleChecks`) |
| `execute/prepare/route.ts` | POST | `/execute/prepare` | `postExecutePrepare` | Legacy | `agent-fixture-check.ts` (`runTransactionLifecycleChecks`) |
| `execute/reject/route.ts` | POST | `/execute/reject` | `postExecuteReject` | Legacy | `agent-fixture-check.ts` (`runTransactionLifecycleChecks`) |
| `execute/submit/route.ts` | POST | `/execute/submit` | `postExecuteSubmit` | Legacy | `agent-fixture-check.ts` (`runTransactionLifecycleChecks`) |
| `execute/transactions/[hash]/route.ts` | GET | `/execute/transactions/{hash}` | `getExecuteTransaction` | Legacy | `agent-fixture-check.ts` (`runTransactionLifecycleChecks`) |
| `health/route.ts` | GET | `/health` | `getHealth` | n/a (no error path) | `openapi-check.ts` (coverage) |
| `history/agent-runs/route.ts` | GET | `/history/agent-runs` | `getAgentRuns` | n/a | `openapi-check.ts` (coverage) |
| `history/agent-runs/route.ts` | POST | `/history/agent-runs` | `postAgentRun` | Legacy | `openapi-check.ts` (coverage) |
| `history/agent-runs/[id]/route.ts` | GET | `/history/agent-runs/{id}` | `getAgentRun` | Legacy | `openapi-check.ts` (coverage) |
| `history/approvals/route.ts` | GET | `/history/approvals` | `getApprovals` | n/a | `openapi-check.ts` (coverage) |
| `history/approvals/[id]/route.ts` | PATCH | `/history/approvals/{id}` | `patchApproval` | Legacy | `openapi-check.ts` (coverage) |
| `history/recommendations/route.ts` | GET | `/history/recommendations` | `getRecommendations` | n/a | `openapi-check.ts` (coverage) |
| `history/transactions/route.ts` | GET | `/history/transactions` | `getHistoryTransactions` | n/a | `agent-fixture-check.ts` (`runTransactionLifecycleChecks`) |
| `portfolio/route.ts` | GET | `/portfolio` | `getPortfolio` | Legacy | `openapi-check.ts` (coverage) |
| `portfolio/health/route.ts` | GET | `/portfolio/health` | `getPortfolioHealth` | n/a | `openapi-check.ts` (coverage) |
| `rules/route.ts` | GET | `/rules` | `getRules` | n/a | `openapi-check.ts` (coverage) |
| `rules/route.ts` | POST | `/rules` | `postRules` | Legacy | `openapi-check.ts` (coverage) |
| `scan/token/route.ts` | POST | `/scan/token` | `postScanToken` | **Migrated** | `openapi-conformance-check.ts` (`Error`), `openapi-check.ts` |
| `stellar/registry/prepare/route.ts` | POST | `/stellar/registry/prepare` | `postStellarRegistryPrepare` | Legacy | `openapi-check.ts` (coverage) |
| `stellar/registry/record/route.ts` | GET | `/stellar/registry/record` | `getStellarRegistryRecord` | Legacy | `openapi-check.ts` (coverage) |
| `stellar/registry/status/route.ts` | GET | `/stellar/registry/status` | `getStellarRegistryStatus` | Legacy | `openapi-check.ts` (coverage) |
| `stellar/registry/submit/route.ts` | POST | `/stellar/registry/submit` | `postStellarRegistrySubmit` | Legacy | `openapi-check.ts` (coverage) |
| `transactions/route.ts` | GET | `/transactions` | `getTransactions` | n/a | `openapi-check.ts` (coverage) |
| `wallet-session/route.ts` | GET | `/wallet-session` | `getWalletSession` | n/a | `openapi-check.ts` (coverage) |
| `wallet-session/route.ts` | POST | `/wallet-session` | `postWalletSession` | **Migrated** | `openapi-conformance-check.ts` (`Error`) |
| `wallet-session/route.ts` | DELETE | `/wallet-session` | `deleteWalletSession` | n/a | `openapi-check.ts` (coverage) |
| `wallet-session/nonce/route.ts` | POST | `/wallet-session/nonce` | `postWalletSessionNonce` | Legacy | `openapi-check.ts` (coverage) |
| `watchlist/route.ts` | GET | `/watchlist` | `getWatchlist` | Legacy | `openapi-check.ts` (coverage) |
| `watchlist/route.ts` | POST | `/watchlist` | `postWatchlist` | Legacy | `openapi-check.ts` (coverage) |
| `watchlist/[id]/rescan/route.ts` | GET | `/watchlist/{id}/rescan` | `getWatchlistHistory` | Legacy | `openapi-check.ts` (coverage) |
| `watchlist/[id]/rescan/route.ts` | POST | `/watchlist/{id}/rescan` | `postWatchlistRescan` | Legacy | `openapi-check.ts` (coverage) |
| `x402/deep-scan/route.ts` | GET | `/x402/deep-scan` | `getX402DeepScan` | Legacy | `agent-fixture-check.ts` (`runX402Checks`) |
| `x402/terms/route.ts` | GET | `/x402/terms` | `getX402Terms` | n/a | `openapi-check.ts` (coverage) |

## Notes

- "Test coverage" lists the existing fixture scripts that already exercise a
  route's behavior (unchanged by this OpenAPI work) plus the new
  `test:openapi` scripts, which validate spec shape/schema conformance
  rather than route business logic.
- `openapi-check.ts` fails the build for **every** row in this table if the
  route file's exported methods drift from what is documented here, so this
  table (and the underlying spec) cannot silently go stale.
