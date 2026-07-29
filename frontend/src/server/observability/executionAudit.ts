/**
 * Execution audit events — structured, correlation-ID-linked events for every
 * execution lifecycle stage. Events carry no sensitive payload (signed XDR,
 * calldata, raw credentials are stripped at emission time). Consumers include
 * structured logging, metrics pipelines, and the in-memory audit store.
 *
 * Issue #18: V2 Execution Observability & Audit Logs.
 */

/** Every audit event carries one correlationId (the orchestration runId). */
export type ExecutionAuditEvent = {
  /** Stable event id for deduplication in external systems. */
  id: string;
  /** The orchestration runId that links decision → quote → execution. */
  correlationId: string;
  /** The decision id (optional, provided when available). */
  decisionId?: string;
  /** The event kind. */
  kind: ExecutionAuditEventKind;
  /** ISO-8601 timestamp of the event. */
  occurredAt: string;
  /** Provider label (e.g. "stellar_aggregator", "tenderly", "evm_rpc"). */
  provider?: string;
  /** Provider URL — redacted to hostname only when a key/token is present. */
  providerUrl?: string;
  /** Outcome: "ok" | "blocked" | "failed" | "unavailable" | "stale" | "rejected". */
  outcome: AuditOutcome;
  /** Latency in milliseconds, if measurable. */
  latencyMs?: number;
  /** Error code from normalized provider errors, when applicable. */
  errorCode?: string;
  /** Short redacted detail (no signed payloads, no raw calldata). */
  detail: string;
  /** Chain family hint for routing diagnostics. */
  chainFamily?: "evm" | "stellar";
  /** Network name (e.g. "goat", "stellar-testnet"). */
  network?: string;
  /** Transaction hash, when known — truncated to first 10 chars for audit. */
  txHashHint?: string;
};

export type AuditOutcome =
  | "ok"
  | "blocked"
  | "failed"
  | "unavailable"
  | "stale"
  | "rejected"
  | "expired"
  | "duplicate";

export type ExecutionAuditEventKind =
  | "quote_requested"
  | "quote_received"
  | "quote_stale"
  | "quote_unavailable"
  | "simulation_requested"
  | "simulation_passed"
  | "simulation_failed"
  | "policy_evaluated"
  | "policy_blocked"
  | "approval_requested"
  | "approval_granted"
  | "approval_rejected"
  | "submission_initiated"
  | "submission_broadcast"
  | "submission_failed"
  | "confirmation_polled"
  | "confirmation_terminal"
  | "persistence_written"
  | "persistence_failed"
  | "contract_audit_started"
  | "contract_audit_completed"
  | "contract_audit_failed"
  | "provider_health_check"
  | "provider_degraded"
  | "lifecycle_expired";

// ── In-memory audit store ──────────────────────────────────────────

const auditEvents: ExecutionAuditEvent[] = [];

export function recordAuditEvent(event: ExecutionAuditEvent): void {
  auditEvents.unshift(event);
  // Cap the in-memory store at 5000 events to prevent unbounded growth.
  if (auditEvents.length > 5_000) {
    auditEvents.length = 5_000;
  }
}

export function listAuditEvents(filter?: {
  correlationId?: string;
  kind?: ExecutionAuditEventKind;
  limit?: number;
}): ExecutionAuditEvent[] {
  let results = [...auditEvents];
  if (filter?.correlationId) {
    results = results.filter((e) => e.correlationId === filter.correlationId);
  }
  if (filter?.kind) {
    results = results.filter((e) => e.kind === filter.kind);
  }
  return results.slice(0, filter?.limit ?? 200);
}

export function clearAuditEvents(): void {
  auditEvents.length = 0;
}

// ── Audit event builders ───────────────────────────────────────────

let eventCounter = 0;

function createEvent(overrides: Omit<ExecutionAuditEvent, "id" | "occurredAt">): ExecutionAuditEvent {
  eventCounter += 1;
  return {
    id: `audit_${Date.now().toString(36)}_${eventCounter.toString(36)}`,
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Redaction helpers ──────────────────────────────────────────────

/** Strip bearer tokens and API keys from URLs. Returns hostname-only if key found. */
export function redactProviderUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.searchParams.has("api_key") || parsed.searchParams.has("apikey")) {
      return parsed.hostname;
    }
    return url;
  } catch {
    return undefined;
  }
}

/** Truncate a transaction hash to first 10 chars for audit safety. */
export function redactTxHash(hash?: string): string | undefined {
  if (!hash) return undefined;
  return hash.length > 10 ? `${hash.slice(0, 10)}…` : hash;
}

// ── Event factories ────────────────────────────────────────────────

export function auditQuoteRequested(params: {
  correlationId: string;
  decisionId?: string;
  provider: string;
  providerUrl?: string;
  chainFamily?: "evm" | "stellar";
  network?: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "quote_requested",
    provider: params.provider,
    providerUrl: redactProviderUrl(params.providerUrl),
    outcome: "ok",
    chainFamily: params.chainFamily,
    network: params.network,
    detail: `Quote requested from ${params.provider} on ${params.network ?? "unknown"} network.`,
  });
}

export function auditQuoteReceived(params: {
  correlationId: string;
  decisionId?: string;
  provider: string;
  providerUrl?: string;
  latencyMs: number;
  chainFamily?: "evm" | "stellar";
  network?: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "quote_received",
    provider: params.provider,
    providerUrl: redactProviderUrl(params.providerUrl),
    outcome: "ok",
    latencyMs: params.latencyMs,
    chainFamily: params.chainFamily,
    network: params.network,
    detail: `Quote received from ${params.provider} in ${params.latencyMs}ms.`,
  });
}

export function auditQuoteStale(params: {
  correlationId: string;
  decisionId?: string;
  provider: string;
  chainFamily?: "evm" | "stellar";
  network?: string;
  reason: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "quote_stale",
    provider: params.provider,
    outcome: "stale",
    chainFamily: params.chainFamily,
    network: params.network,
    detail: params.reason,
  });
}

export function auditQuoteUnavailable(params: {
  correlationId: string;
  decisionId?: string;
  provider: string;
  providerUrl?: string;
  errorCode?: string;
  chainFamily?: "evm" | "stellar";
  network?: string;
  reason: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "quote_unavailable",
    provider: params.provider,
    providerUrl: redactProviderUrl(params.providerUrl),
    outcome: "unavailable",
    errorCode: params.errorCode,
    chainFamily: params.chainFamily,
    network: params.network,
    detail: params.reason,
  });
}

export function auditSimulationRequested(params: {
  correlationId: string;
  decisionId?: string;
  provider: string;
  providerUrl?: string;
  chainFamily?: "evm" | "stellar";
  network?: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "simulation_requested",
    provider: params.provider,
    providerUrl: redactProviderUrl(params.providerUrl),
    outcome: "ok",
    chainFamily: params.chainFamily,
    network: params.network,
    detail: `Simulation requested from ${params.provider}.`,
  });
}

export function auditSimulationPassed(params: {
  correlationId: string;
  decisionId?: string;
  provider: string;
  providerUrl?: string;
  latencyMs: number;
  chainFamily?: "evm" | "stellar";
  network?: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "simulation_passed",
    provider: params.provider,
    providerUrl: redactProviderUrl(params.providerUrl),
    outcome: "ok",
    latencyMs: params.latencyMs,
    chainFamily: params.chainFamily,
    network: params.network,
    detail: `Simulation passed in ${params.latencyMs}ms.`,
  });
}

export function auditSimulationFailed(params: {
  correlationId: string;
  decisionId?: string;
  provider: string;
  providerUrl?: string;
  latencyMs: number;
  revertReason?: string;
  chainFamily?: "evm" | "stellar";
  network?: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "simulation_failed",
    provider: params.provider,
    providerUrl: redactProviderUrl(params.providerUrl),
    outcome: "failed",
    latencyMs: params.latencyMs,
    chainFamily: params.chainFamily,
    network: params.network,
    detail: `Simulation failed${params.revertReason ? `: ${params.revertReason}` : "."}`,
  });
}

export function auditPolicyEvaluated(params: {
  correlationId: string;
  decisionId?: string;
  allowed: boolean;
  violations: string[];
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "policy_evaluated",
    outcome: params.allowed ? "ok" : "blocked",
    detail: params.allowed
      ? "Execution policy passed all checks."
      : `Execution policy blocked: ${params.violations.join("; ")}`,
  });
}

export function auditPolicyBlocked(params: {
  correlationId: string;
  decisionId?: string;
  reason: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "policy_blocked",
    outcome: "blocked",
    detail: params.reason,
  });
}

export function auditApprovalRequested(params: {
  correlationId: string;
  decisionId?: string;
  chainFamily?: "evm" | "stellar";
  network?: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "approval_requested",
    outcome: "ok",
    chainFamily: params.chainFamily,
    network: params.network,
    detail: "User wallet approval requested for transaction.",
  });
}

export function auditApprovalGranted(params: {
  correlationId: string;
  decisionId?: string;
  chainFamily?: "evm" | "stellar";
  network?: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "approval_granted",
    outcome: "ok",
    chainFamily: params.chainFamily,
    network: params.network,
    detail: "User approved wallet transaction.",
  });
}

export function auditApprovalRejected(params: {
  correlationId: string;
  decisionId?: string;
  chainFamily?: "evm" | "stellar";
  network?: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "approval_rejected",
    outcome: "rejected",
    chainFamily: params.chainFamily,
    network: params.network,
    detail: "User rejected wallet transaction.",
  });
}

export function auditSubmissionInitiated(params: {
  correlationId: string;
  decisionId?: string;
  chainFamily: "evm" | "stellar";
  network: string;
  providerUrl?: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "submission_initiated",
    provider: params.chainFamily === "stellar" ? "stellar_rpc" : "evm_rpc",
    providerUrl: redactProviderUrl(params.providerUrl),
    outcome: "ok",
    chainFamily: params.chainFamily,
    network: params.network,
    detail: `Transaction submission initiated to ${params.chainFamily} network.`,
  });
}

export function auditSubmissionBroadcast(params: {
  correlationId: string;
  decisionId?: string;
  txHash?: string;
  chainFamily: "evm" | "stellar";
  network: string;
  providerUrl?: string;
  latencyMs: number;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "submission_broadcast",
    provider: params.chainFamily === "stellar" ? "stellar_rpc" : "evm_rpc",
    providerUrl: redactProviderUrl(params.providerUrl),
    outcome: "ok",
    latencyMs: params.latencyMs,
    chainFamily: params.chainFamily,
    network: params.network,
    txHashHint: redactTxHash(params.txHash),
    detail: `Transaction broadcast accepted by ${params.chainFamily} RPC in ${params.latencyMs}ms.`,
  });
}

export function auditSubmissionFailed(params: {
  correlationId: string;
  decisionId?: string;
  chainFamily: "evm" | "stellar";
  network: string;
  providerUrl?: string;
  errorCode?: string;
  reason: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "submission_failed",
    provider: params.chainFamily === "stellar" ? "stellar_rpc" : "evm_rpc",
    providerUrl: redactProviderUrl(params.providerUrl),
    outcome: "failed",
    errorCode: params.errorCode,
    chainFamily: params.chainFamily,
    network: params.network,
    detail: params.reason,
  });
}

export function auditConfirmationPolled(params: {
  correlationId: string;
  decisionId?: string;
  txHash?: string;
  chainFamily: "evm" | "stellar";
  network: string;
  providerUrl?: string;
  status: string;
  latencyMs: number;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "confirmation_polled",
    provider: params.chainFamily === "stellar" ? "stellar_rpc" : "evm_rpc",
    providerUrl: redactProviderUrl(params.providerUrl),
    outcome: params.status === "confirmed" ? "ok" : params.status === "failed" ? "failed" : "ok",
    latencyMs: params.latencyMs,
    chainFamily: params.chainFamily,
    network: params.network,
    txHashHint: redactTxHash(params.txHash),
    detail: `Confirmation poll returned status: ${params.status}.`,
  });
}

export function auditConfirmationTerminal(params: {
  correlationId: string;
  decisionId?: string;
  txHash?: string;
  chainFamily: "evm" | "stellar";
  network: string;
  endState: "confirmed" | "failed" | "replaced" | "expired";
  confirmationTimeMs: number;
  revertReason?: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "confirmation_terminal",
    outcome: params.endState === "confirmed" ? "ok" : "failed",
    latencyMs: params.confirmationTimeMs,
    chainFamily: params.chainFamily,
    network: params.network,
    txHashHint: redactTxHash(params.txHash),
    detail:
      params.endState === "confirmed"
        ? `Transaction confirmed in ${params.confirmationTimeMs}ms.`
        : `Transaction reached terminal state ${params.endState}${params.revertReason ? `: ${params.revertReason}` : "."}`,
  });
}

export function auditPersistenceWritten(params: {
  correlationId: string;
  decisionId?: string;
  tableName: string;
  recordCount: number;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "persistence_written",
    outcome: "ok",
    detail: `Wrote ${params.recordCount} record(s) to ${params.tableName}.`,
  });
}

export function auditPersistenceFailed(params: {
  correlationId: string;
  decisionId?: string;
  tableName: string;
  errorCode?: string;
  reason: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "persistence_failed",
    outcome: "failed",
    errorCode: params.errorCode,
    detail: `Failed to write to ${params.tableName}: ${params.reason}`,
  });
}

export function auditContractAuditStarted(params: {
  correlationId: string;
  decisionId?: string;
  contractAddress?: string;
  chainFamily?: "evm" | "stellar";
  network?: string;
  auditProvider: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "contract_audit_started",
    provider: params.auditProvider,
    outcome: "ok",
    chainFamily: params.chainFamily,
    network: params.network,
    detail: `Contract audit started with ${params.auditProvider}${params.contractAddress ? ` for address ending …${params.contractAddress.slice(-6)}` : ""}.`,
  });
}

export function auditContractAuditCompleted(params: {
  correlationId: string;
  decisionId?: string;
  contractAddress?: string;
  chainFamily?: "evm" | "stellar";
  network?: string;
  auditProvider: string;
  latencyMs: number;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "contract_audit_completed",
    provider: params.auditProvider,
    outcome: "ok",
    latencyMs: params.latencyMs,
    chainFamily: params.chainFamily,
    network: params.network,
    detail: `Contract audit completed in ${params.latencyMs}ms.`,
  });
}

export function auditContractAuditFailed(params: {
  correlationId: string;
  decisionId?: string;
  contractAddress?: string;
  chainFamily?: "evm" | "stellar";
  network?: string;
  auditProvider: string;
  errorCode?: string;
  reason: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "contract_audit_failed",
    provider: params.auditProvider,
    outcome: "failed",
    errorCode: params.errorCode,
    chainFamily: params.chainFamily,
    network: params.network,
    detail: params.reason,
  });
}

export function auditProviderHealthCheck(params: {
  correlationId: string;
  provider: string;
  providerUrl?: string;
  chainFamily?: "evm" | "stellar";
  network?: string;
  healthy: boolean;
  latencyMs: number;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    kind: "provider_health_check",
    provider: params.provider,
    providerUrl: redactProviderUrl(params.providerUrl),
    outcome: params.healthy ? "ok" : "unavailable",
    latencyMs: params.latencyMs,
    chainFamily: params.chainFamily,
    network: params.network,
    detail: params.healthy
      ? `${params.provider} health check passed in ${params.latencyMs}ms.`
      : `${params.provider} health check failed.`,
  });
}

export function auditProviderDegraded(params: {
  correlationId: string;
  provider: string;
  providerUrl?: string;
  chainFamily?: "evm" | "stellar";
  network?: string;
  reason: string;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    kind: "provider_degraded",
    provider: params.provider,
    providerUrl: redactProviderUrl(params.providerUrl),
    outcome: "unavailable",
    chainFamily: params.chainFamily,
    network: params.network,
    detail: params.reason,
  });
}

export function auditLifecycleExpired(params: {
  correlationId: string;
  decisionId?: string;
  txHash?: string;
  chainFamily: "evm" | "stellar";
  network: string;
  ttlMs: number;
  elapsedMs: number;
}): ExecutionAuditEvent {
  return createEvent({
    correlationId: params.correlationId,
    decisionId: params.decisionId,
    kind: "lifecycle_expired",
    outcome: "expired",
    chainFamily: params.chainFamily,
    network: params.network,
    txHashHint: redactTxHash(params.txHash),
    detail: `Transaction lifecycle expired after ${params.elapsedMs}ms (TTL: ${params.ttlMs}ms).`,
  });
}

// ── Summary helpers ────────────────────────────────────────────────

export function getAuditEventSummary() {
  const events = listAuditEvents({ limit: 1_000 });
  const byKind = new Map<ExecutionAuditEventKind, number>();
  const byOutcome = new Map<AuditOutcome, number>();
  for (const event of events) {
    byKind.set(event.kind, (byKind.get(event.kind) ?? 0) + 1);
    byOutcome.set(event.outcome, (byOutcome.get(event.outcome) ?? 0) + 1);
  }
  return {
    total: events.length,
    byKind: Object.fromEntries(byKind),
    byOutcome: Object.fromEntries(byOutcome),
    latestEvent: events[0] ?? null,
  };
}
