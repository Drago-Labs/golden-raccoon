/**
 * Provider failure runbooks — detection, diagnosis, containment, recovery,
 * and verification steps for each failure scenario.
 *
 * Issue #18: Runbooks for execution provider failures.
 */

export type RunbookStep = {
  phase: "detection" | "diagnosis" | "containment" | "recovery" | "verification";
  action: string;
  detail: string;
  /** Optional command to run or API to call. */
  command?: string;
};

export type Runbook = {
  id: string;
  title: string;
  scenario: string;
  severity: "low" | "medium" | "high" | "critical";
  /** Env var that can disable the affected capability. */
  disableSwitch?: { env: string; value: string; effect: string };
  steps: RunbookStep[];
};

// ── Runbooks ───────────────────────────────────────────────────────

/** RB-001: Quote / Simulation provider outage. */
export const runbookQuoteSimulationOutage: Runbook = {
  id: "RB-001",
  title: "Quote / Simulation Provider Outage",
  scenario:
    "The DEX aggregator or simulation provider (Tenderly, Stellar aggregator) " +
    "is unavailable, returning errors, or timing out. Execution previews fail " +
    "to produce fresh quotes or simulation results.",
  severity: "high",
  disableSwitch: {
    env: "DISABLE_QUOTE_PROVIDER",
    value: "true",
    effect:
      "When set, the execution agent skips live quote/simulation provider calls. " +
      "Preview preparation falls back to planned/placeholder quotes. " +
      "Recommendation-only mode remains fully functional.",
  },
  steps: [
    {
      phase: "detection",
      action: "Check execution metrics and audit events",
      detail:
        "Monitor `executionMetrics.providers.quote.unavailable` and " +
        "`executionMetrics.providers.simulation.failed` in the health endpoint. " +
        "Look for `quote_unavailable` or `simulation_failed` audit events with elevated rates.",
    },
    {
      phase: "diagnosis",
      action: "Verify provider connectivity directly",
      detail:
        "Check the provider status pages: DEX aggregator API, Tenderly dashboard, " +
        "or Stellar RPC health endpoint. Verify API key validity and rate limits.",
      command: "curl -s <PROVIDER_HEALTH_URL> | jq .",
    },
    {
      phase: "containment",
      action: "Enable recommendation-only mode",
      detail:
        "Set DISABLE_QUOTE_PROVIDER=true and/or DISABLE_SIMULATION_PROVIDER=true. " +
        "This prevents execution previews from blocking on unavailable providers. " +
        "Agent analysis, risk scoring, and portfolio review continue unaffected.",
    },
    {
      phase: "recovery",
      action: "Re-enable provider after outage resolves",
      detail:
        "Remove the disable flags once provider status pages show recovery. " +
        "Run a smoke test against the execute/prepare endpoint to verify.",
      command: "npm run smoke",
    },
    {
      phase: "verification",
      action: "Confirm execution metrics return to baseline",
      detail:
        "Visit /api/health and check `executionMetrics.providers.quote.successRate` " +
        "is above 90% and `executionMetrics.providers.simulation.failureRate` is below 5%.",
    },
  ],
};

/** RB-002: Stellar RPC Lag / Degradation. */
export const runbookStellarRpcLag: Runbook = {
  id: "RB-002",
  title: "Stellar RPC Lag / Degradation",
  scenario:
    "The Stellar Soroban RPC is returning stale ledger data, timing out, " +
    "or reporting degraded health. This affects Stellar swap quotes, trustline " +
    "checks, portfolio valuation, and risk registry contract interactions.",
  severity: "high",
  disableSwitch: {
    env: "DISABLE_STELLAR_SUBMISSION",
    value: "true",
    effect:
      "When set, Stellar transaction submission is disabled. Stellar portfolio " +
      "valuation, risk checks, and trustline analysis still run via data API. " +
      "Only Stellar transactions are blocked; EVM execution is unaffected.",
  },
  steps: [
    {
      phase: "detection",
      action: "Check health endpoint for Stellar RPC status",
      detail:
        "Visit /api/health and look at `productionHealth.providerHealth.stellar`. " +
        "A `degraded` or `unavailable` status triggers an alert via the alert engine.",
    },
    {
      phase: "diagnosis",
      action: "Check Stellar RPC health directly",
      detail:
        "Query the Stellar RPC health endpoint and compare with public Stellar " +
        "network status. Check for known incidents on Stellar Discord.",
      command:
        "curl -s https://soroban-testnet.stellar.org/health | jq .",
    },
    {
      phase: "containment",
      action: "Disable Stellar submission, keep data API active",
      detail:
        "Set DISABLE_STELLAR_SUBMISSION=true. Stellar portfolio valuation and risk " +
        "checks continue via the data API. Only transaction submission is blocked. " +
        "Users see a clear message that Stellar execution is temporarily paused.",
    },
    {
      phase: "recovery",
      action: "Re-enable after ledger catch-up confirmed",
      detail:
        "Wait until the Stellar RPC reports healthy status and the latest ledger " +
        "sequence is within 10 of the public network. Remove DISABLE_STELLAR_SUBMISSION.",
    },
    {
      phase: "verification",
      action: "Verify Stellar quote and submission flow",
      detail:
        "Run a Stellar execution smoke test: request a swap quote, prepare a preview, " +
        "and confirm that submission succeeds. Check audit events for `submission_broadcast` " +
        "with outcome=ok.",
    },
  ],
};

/** RB-003: EVM RPC Failure. */
export const runbookEvmRpcFailure: Runbook = {
  id: "RB-003",
  title: "EVM RPC Failure",
  scenario:
    "The EVM RPC provider (GOAT Network RPC or fallback) is unreachable, " +
    "returning errors, or failing to return block data. This affects " +
    "transaction submission, confirmation polling, and portfolio balance checks.",
  severity: "critical",
  disableSwitch: {
    env: "DISABLE_EVM_SUBMISSION",
    value: "true",
    effect:
      "When set, EVM transaction submission is disabled. Onchain analysis, " +
      "token scanning, and risk scoring still run via cached data and " +
      "secondary providers. Only EVM transactions are blocked.",
  },
  steps: [
    {
      phase: "detection",
      action: "Check health endpoint for EVM RPC status",
      detail:
        "Visit /api/health and check `productionHealth.providerHealth.evm`. " +
        "Elevated `provider_failure_rate` in metrics also indicates EVM RPC issues. " +
        "Alert engine fires on `rpc_degradation` observations.",
    },
    {
      phase: "diagnosis",
      action: "Verify RPC connectivity and block production",
      detail:
        "Test the RPC URL directly. Check if the chain is producing blocks " +
        "(compare latest block number against a public explorer). Verify the " +
        "RPC URL is still valid and the provider hasn't changed endpoints.",
      command:
        "curl -s -X POST <RPC_URL> -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_blockNumber\",\"params\":[],\"id\":1}'",
    },
    {
      phase: "containment",
      action: "Enable recommendation-only mode for EVM",
      detail:
        "Set DISABLE_EVM_SUBMISSION=true. All agent analysis continues. " +
        "Token scanning uses cached/fallback data. Users see execution is paused. " +
        "Set RECOMMENDATION_ONLY_MODE=true for full provider-agnostic safe mode.",
    },
    {
      phase: "recovery",
      action: "Re-enable after RPC health confirmed",
      detail:
        "Verify the RPC returns healthy block data. Remove DISABLE_EVM_SUBMISSION. " +
        "Monitor submission success rate for 5 minutes before declaring resolved.",
    },
    {
      phase: "verification",
      action: "Confirm EVM transaction submission works",
      detail:
        "Run a full execution flow smoke test. Check that `submission_broadcast` " +
        "audit events show outcome=ok. Verify confirmation polling produces terminal states.",
    },
  ],
};

/** RB-004: Stuck Transactions. */
export const runbookStuckTransactions: Runbook = {
  id: "RB-004",
  title: "Stuck Transactions",
  scenario:
    "Transactions remain in `submitted` or `pending` state for longer than " +
    "the submission TTL (5 minutes). This can happen due to low gas, network " +
    "congestion, nonce conflicts, or RPC provider issues.",
  severity: "medium",
  steps: [
    {
      phase: "detection",
      action: "Check for elevated expired transaction counts",
      detail:
        "Visit /api/health and check `executionMetrics.confirmation.failureRate`. " +
        "Look for `lifecycle_expired` audit events. The health endpoint reports " +
        "`executionConfirmFailureHigh` when failure rate exceeds threshold.",
    },
    {
      phase: "diagnosis",
      action: "Check transaction lifecycle events",
      detail:
        "Query the transaction records endpoint for transactions in `pending` or " +
        "`submitted` state. Check explorer URLs for onchain status. Verify gas " +
        "prices haven't spiked beyond the transaction's gas limit.",
      command:
        "curl -s <HEALTH_URL> | jq '.executionMetrics.confirmation'",
    },
    {
      phase: "containment",
      action: "Warn users about pending transactions",
      detail:
        "The lifecycle manager automatically expires transactions after TTL. " +
        "No server-side action needed — users can re-submit with higher gas if needed. " +
        "If systemic, set DISABLE_CONFIRMATION_POLLING=true to stop polling overhead.",
    },
    {
      phase: "recovery",
      action: "Wait for TTL expiry or manual user replacement",
      detail:
        "Transactions expire automatically after 5 minutes. Users can submit " +
        "replacement transactions. If congestion is resolved, remaining transactions " +
        "will confirm naturally.",
    },
    {
      phase: "verification",
      action: "Confirm no stale transactions remain",
      detail:
        "Check transaction records: all should be in terminal states " +
        "(confirmed, failed, replaced, expired). Confirmation failure rate " +
        "should return to baseline (<5%).",
    },
  ],
};

/** RB-005: Supabase / Storage Failure. */
export const runbookSupabaseFailure: Runbook = {
  id: "RB-005",
  title: "Supabase / Storage Failure",
  scenario:
    "The Supabase Postgres database is unreachable, returning connection " +
    "errors, or failing writes. The in-memory store continues to serve reads " +
    "but persistence is lost on restart.",
  severity: "critical",
  disableSwitch: {
    env: "DISABLE_SUPABASE_WRITES",
    value: "true",
    effect:
      "When set, mirror writes to Supabase are skipped. The in-memory store " +
      "remains the sole source of truth. All agent runs, alert rules, and " +
      "observations persist only for the lifetime of the server process.",
  },
  steps: [
    {
      phase: "detection",
      action: "Check storage health",
      detail:
        "Visit /api/health and check `storage.persistent` and `storage.detail`. " +
        "The health endpoint reports when the Postgres adapter is disconnected or " +
        "mirror writes are failing. `supabaseWriteFailureHigh` fires when write " +
        "failure rate exceeds 1%.",
    },
    {
      phase: "diagnosis",
      action: "Check Supabase project status and connection",
      detail:
        "Log into Supabase dashboard and check project health. Verify the " +
        "DATABASE_URL/SUPABASE_DB_URL/POSTGRES_URL connection string is correct. " +
        "Check IP allowlist and network connectivity from the deployment environment.",
      command:
        "psql <DATABASE_URL> -c 'SELECT 1'",
    },
    {
      phase: "containment",
      action: "Enable in-memory-only mode",
      detail:
        "Set DISABLE_SUPABASE_WRITES=true to stop mirror write attempts. " +
        "The server continues operating with the in-memory store. " +
        "Alert engine and agent analysis continue unaffected.",
    },
    {
      phase: "recovery",
      action: "Restore database connectivity",
      detail:
        "Fix the connection issue (network, credentials, Supabase project status). " +
        "Remove DISABLE_SUPABASE_WRITES. The next server restart will hydrate from " +
        "existing Supabase data. Mirror writes resume immediately.",
    },
    {
      phase: "verification",
      action: "Confirm persistence is working",
      detail:
        "Check that `storage.persistent` is true in the health endpoint. " +
        "Trigger an agent run and verify the run record persists across a " +
        "server restart. Check `storageCounts` match expected values.",
    },
  ],
};

/** RB-006: x402 Settlement Failure. */
export const runbookX402SettlementFailure: Runbook = {
  id: "RB-006",
  title: "x402 Payment Settlement Failure",
  scenario:
    "x402 payment verification or settlement is failing. This affects " +
    "premium deep-scan access but does not impact free-tier functionality.",
  severity: "medium",
  disableSwitch: {
    env: "DISABLE_X402_SETTLEMENT",
    value: "true",
    effect:
      "When set, x402 payment-required endpoints return 402 Payment Required " +
      "without attempting settlement. Premium features are unavailable but " +
      "all free-tier features remain fully functional.",
  },
  steps: [
    {
      phase: "detection",
      action: "Check x402 payment receipt status",
      detail:
        "Look for elevated `verification_status=failed` or `verification_status=duplicate` " +
        "in payment receipts. Check the x402 facilitator status and payment network health.",
    },
    {
      phase: "diagnosis",
      action: "Verify facilitator and payment network",
      detail:
        "Check the x402 facilitator URL is reachable. Verify the payment network " +
        "(GOAT Network) is producing blocks. Check that the facilitator hasn't changed " +
        "its API or payment address.",
    },
    {
      phase: "containment",
      action: "Disable x402 settlement",
      detail:
        "Set DISABLE_X402_SETTLEMENT=true. Premium endpoints return 402 with a " +
        "clear message. Free-tier features (standard scan, portfolio review, " +
        "alerts) are completely unaffected.",
    },
    {
      phase: "recovery",
      action: "Re-enable after facilitator confirmed healthy",
      detail:
        "Verify the facilitator is accepting payments. Clear any stuck payment " +
        "receipts in the database. Remove DISABLE_X402_SETTLEMENT.",
    },
    {
      phase: "verification",
      action: "Verify x402 payment flow end-to-end",
      detail:
        "Run an x402 smoke test. Verify that payment-required responses include " +
        "valid payment headers. Confirm settlements succeed and receipts show " +
        "verification_status=verified.",
      command: "npm run smoke",
    },
  ],
};

// ── Registry ───────────────────────────────────────────────────────

/** All runbooks indexed by id for programmatic lookup. */
export const runbooks: Record<string, Runbook> = {
  "RB-001": runbookQuoteSimulationOutage,
  "RB-002": runbookStellarRpcLag,
  "RB-003": runbookEvmRpcFailure,
  "RB-004": runbookStuckTransactions,
  "RB-005": runbookSupabaseFailure,
  "RB-006": runbookX402SettlementFailure,
};

export function listRunbooks(): Runbook[] {
  return Object.values(runbooks);
}

export function getRunbook(id: string): Runbook | undefined {
  return runbooks[id];
}

/**
 * Map a runbook to a release-readiness check entry so the operations
 * page and health endpoint can reference runbooks inline.
 */
export function runbookToReadinessCheck(runbook: Runbook) {
  return {
    title: `${runbook.id}: ${runbook.title}`,
    detail: `${runbook.scenario} Severity: ${runbook.severity}. ${runbook.disableSwitch ? `Disable: ${runbook.disableSwitch.env}=${runbook.disableSwitch.value}.` : ""}`,
    runbookId: runbook.id,
    severity: runbook.severity,
    disableSwitch: runbook.disableSwitch,
  };
}
