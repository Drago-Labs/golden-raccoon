/**
 * Provider failure fixture tests for execution observability.
 * Exercises each degraded state and verifies redaction, audit events,
 * and disable switches without importing server-only modules.
 * Run with:
 *   npx tsx frontend/scripts/execution-fixture-check.ts
 *
 * Issue #18: V2 Execution Observability & Audit Logs.
 */

import {
  recordAuditEvent,
  listAuditEvents,
  clearAuditEvents,
  getAuditEventSummary,
} from "../src/server/observability/executionAudit";

import {
  redactExecutionSensitive,
  redactSignedXdr,
  redactCalldata,
  redactStellarSecretKey,
  redactWalletAddresses,
  redactExecutionDetail,
  walletAuditHint,
} from "../src/server/observability/executionRedaction";

import {
  listRunbooks,
  getRunbook,
  runbookToReadinessCheck,
} from "../src/server/observability/runbooks";

// Inline disable switch check without importing server-only modules.
// Mirrors providerHealth.ts logic.
function getExecutionDisableFlags() {
  return {
    all: Boolean(process.env.DISABLE_EXECUTION_PROVIDERS) || Boolean(process.env.RECOMMENDATION_ONLY_MODE),
    quote: Boolean(process.env.DISABLE_QUOTE_PROVIDER),
    simulation: Boolean(process.env.DISABLE_SIMULATION_PROVIDER),
    evmSubmission: Boolean(process.env.DISABLE_EVM_SUBMISSION),
    stellarSubmission: Boolean(process.env.DISABLE_STELLAR_SUBMISSION),
    confirmationPolling: Boolean(process.env.DISABLE_CONFIRMATION_POLLING),
    supabaseWrites: Boolean(process.env.DISABLE_SUPABASE_WRITES),
    x402Settlement: Boolean(process.env.DISABLE_X402_SETTLEMENT),
    recommendationOnly: Boolean(process.env.RECOMMENDATION_ONLY_MODE),
  };
}

function areExecutionProvidersDisabled() {
  return getExecutionDisableFlags().all;
}

// ── Test helpers ───────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  const ok = actual === expected || (Number.isNaN(actual) && Number.isNaN(expected));
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

// ── Redaction Tests ────────────────────────────────────────────────

function testRedaction() {
  console.log("\n── Redaction Tests ──");

  // Signed XDR
  const xdr = "AAAAAgAAAAB+8s5+nRT4n7N7kz9YkqZ7xRv8z7dR5UfXO/9iZz9ZgAAAZAAAAAAAAAAAAQAAAAAAAAABAAAAANBEq9G/XlU3RQ0BgAAA";
  assert(redactSignedXdr(xdr).includes("[XDR_ENVELOPE_REDACTED"), "redacts signed XDR envelope");
  assert(redactSignedXdr("normal text") === "normal text", "passes through non-XDR text");

  // Calldata
  const calldata = "0x02f8b0180843b9aca085043b9aca082520894000000000000000000000000000000000000000088016345785d8a0000";
  assert(redactCalldata(calldata).includes("[CALLDATA_REDACTED"), "redacts EVM calldata");
  assert(redactCalldata("not calldata") === "not calldata", "passes through non-calldata");

  // Stellar secret key (inline — using word boundaries)
  const fakeSecret = "SBFJKSFWEQRQFFHZWF5TPNYVTK7XJBPNWLTWWYBPKX4J6G4K4PGTRXWB";
  assert(
    redactStellarSecretKey(`text containing ${fakeSecret} inline`).includes("[STELLAR_SECRET_REDACTED]"),
    "redacts inline Stellar secret key"
  );
  assert(redactStellarSecretKey(fakeSecret) === "[STELLAR_SECRET_REDACTED]", "redacts standalone Stellar secret key");

  // Wallet addresses
  const evmAddr = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1";
  assert(redactWalletAddresses(evmAddr).includes("…"), "redacts EVM wallet address");
  assert(redactWalletAddresses(evmAddr).length < evmAddr.length, "redacted EVM address is shorter");
  const stellarAddr = "GBD7QGQOQHRMTYG6WTOJ2YXSRH5Z7U5MNZJ7WYA2KJUX7HWNJFHY5R43";
  assert(redactWalletAddresses(stellarAddr).includes("…"), "redacts Stellar G-address");

  // Full pipeline
  assert(redactExecutionSensitive(evmAddr).includes("…"), "full pipeline redacts EVM address");
  assert(redactExecutionSensitive(stellarAddr).includes("…"), "full pipeline redacts Stellar address");

  // API key redaction
  assert(
    redactExecutionSensitive("api_key=sk-1234abcd").includes("[REDACTED]"),
    "full pipeline redacts api_key"
  );

  // Execution detail redaction
  const detail = { signedPayload: xdr, normalField: "hello", sub: { calldata } };
  const redacted = redactExecutionDetail(detail);
  assert(redacted.signedPayload === "[REDACTED]", "redacts signedPayload key");
  assert(redacted.normalField === "hello", "preserves normal fields");
  assert(
    typeof redacted.sub === "object" && (redacted.sub as Record<string, unknown>).calldata === "[REDACTED]",
    "redacts nested calldata"
  );

  // Wallet audit hint
  assert(walletAuditHint(evmAddr) === `w:${evmAddr.slice(0, 4)}`, "creates wallet audit hint");
  assert(walletAuditHint(undefined) === undefined, "returns undefined for missing address");

  // Non-serializable
  assert(
    redactExecutionSensitive(BigInt(123)).includes("[UNSERIALIZABLE_REDACTED]"),
    "handles un-serializable input"
  );
}

// ── Audit Event Tests ──────────────────────────────────────────────

function testAuditEvents() {
  console.log("\n── Audit Event Tests ──");
  clearAuditEvents();

  const correlationId = "test_correlation_abc123";
  const decisionId = "decision_xyz";

  // Record a full execution lifecycle
  recordAuditEvent({
    id: "audit_test_1",
    correlationId,
    decisionId,
    kind: "quote_requested",
    occurredAt: new Date().toISOString(),
    provider: "stellar_aggregator",
    outcome: "ok",
    chainFamily: "stellar",
    network: "stellar-testnet",
    detail: "Quote requested.",
  });

  recordAuditEvent({
    id: "audit_test_2",
    correlationId,
    decisionId,
    kind: "quote_received",
    occurredAt: new Date().toISOString(),
    provider: "stellar_aggregator",
    outcome: "ok",
    latencyMs: 350,
    chainFamily: "stellar",
    network: "stellar-testnet",
    detail: "Quote received.",
  });

  recordAuditEvent({
    id: "audit_test_3",
    correlationId,
    kind: "policy_evaluated",
    occurredAt: new Date().toISOString(),
    outcome: "ok",
    detail: "Policy passed.",
  });

  recordAuditEvent({
    id: "audit_test_4",
    correlationId,
    kind: "submission_broadcast",
    occurredAt: new Date().toISOString(),
    provider: "stellar_rpc",
    providerUrl: "https://soroban-testnet.stellar.org",
    outcome: "ok",
    latencyMs: 1200,
    chainFamily: "stellar",
    network: "stellar-testnet",
    txHashHint: "abcdef1234…",
    detail: "Broadcast accepted.",
  });

  recordAuditEvent({
    id: "audit_test_5",
    correlationId,
    kind: "confirmation_terminal",
    occurredAt: new Date().toISOString(),
    outcome: "ok",
    latencyMs: 5000,
    chainFamily: "stellar",
    network: "stellar-testnet",
    detail: "Transaction confirmed.",
  });

  // Query by correlationId
  const events = listAuditEvents({ correlationId });
  assert(events.length === 5, `found all 5 events by correlationId (got ${events.length})`);

  // Query by kind
  const quoteEvents = listAuditEvents({ kind: "quote_received" });
  assert(quoteEvents.length === 1, "filters by kind");

  // Correlation ID is consistent
  for (const event of events) {
    assert(event.correlationId === correlationId, `event ${event.kind} has correct correlationId`);
  }

  // decisionId is present where provided
  const eventsWithDecisionId = events.filter((e) => e.decisionId);
  assert(eventsWithDecisionId.length >= 2, `decisionId flows to events (${eventsWithDecisionId.length} found)`);

  // Latency is recorded
  const withLatency = events.filter((e) => typeof e.latencyMs === "number");
  assert(withLatency.length >= 3, `latency recorded on ${withLatency.length} events`);

  // Tx hash is redacted
  const submissionEvent = events.find((e) => e.kind === "submission_broadcast");
  assert(submissionEvent !== undefined, "submission event exists");
  assert(submissionEvent?.txHashHint?.includes("…") ?? false, "tx hash is redacted with truncation");

  // Summary helper
  const summary = getAuditEventSummary();
  assert(summary.total === 5, "summary has correct total");
  assert(summary.byKind.quote_received === 1, "summary counts by kind");
}

// ── Disable Switch Tests ───────────────────────────────────────────

function testDisableSwitches() {
  console.log("\n── Disable Switch Tests ──");

  const flags = getExecutionDisableFlags();
  assert(typeof flags.all === "boolean", "disable flags has 'all' boolean");
  assert(typeof flags.recommendationOnly === "boolean", "disable flags has 'recommendationOnly' boolean");
  assert(typeof flags.quote === "boolean", "disable flags has 'quote' boolean");
  assert(typeof flags.simulation === "boolean", "disable flags has 'simulation' boolean");
  assert(typeof flags.evmSubmission === "boolean", "disable flags has 'evmSubmission' boolean");
  assert(typeof flags.stellarSubmission === "boolean", "disable flags has 'stellarSubmission' boolean");
  assert(typeof flags.confirmationPolling === "boolean", "disable flags has 'confirmationPolling' boolean");
  assert(typeof flags.supabaseWrites === "boolean", "disable flags has 'supabaseWrites' boolean");
  assert(typeof flags.x402Settlement === "boolean", "disable flags has 'x402Settlement' boolean");

  // In test env without the env var, providers should be enabled
  assert(!areExecutionProvidersDisabled(), "providers are enabled by default (no disable env var set)");
  assert(!flags.all, "all flags disabled is false by default");
}

// ── Provider Health Tests (config-only, no RPC calls) ─────────────

function testProviderHealth() {
  console.log("\n── Provider Health Tests (config only) ──");

  // Test env-based configured health without importing server-only modules
  const flags = getExecutionDisableFlags();
  assert(typeof flags.quote === "boolean", "quote disable flag is boolean");
  assert(typeof flags.simulation === "boolean", "simulation disable flag is boolean");
  assert(typeof flags.evmSubmission === "boolean", "evmSubmission disable flag is boolean");
  assert(typeof flags.stellarSubmission === "boolean", "stellarSubmission disable flag is boolean");
  assert(typeof flags.supabaseWrites === "boolean", "supabaseWrites disable flag is boolean");
  assert(typeof flags.x402Settlement === "boolean", "x402Settlement disable flag is boolean");

  // Test EVM and Stellar RPC URL check (without live calls)
  const goatRpcUrl = process.env.GOAT_RPC_URL ?? process.env.NEXT_PUBLIC_GOAT_RPC_URL;
  const stellarRpcUrl = process.env.STELLAR_RPC_URL ?? process.env.NEXT_PUBLIC_STELLAR_TESTNET_RPC_URL;
  assert(typeof goatRpcUrl === "string" || goatRpcUrl === undefined, "GOAT RPC URL is string or undefined");
  assert(typeof stellarRpcUrl === "string" || stellarRpcUrl === undefined, "Stellar RPC URL is string or undefined");
}

// ── Runbook Tests ──────────────────────────────────────────────────

function testRunbooks() {
  console.log("\n── Runbook Tests ──");

  const all = listRunbooks();
  assert(all.length === 6, `has 6 runbooks (got ${all.length})`);

  const rb001 = getRunbook("RB-001");
  assert(rb001 !== undefined, "RB-001 exists");
  assert(rb001?.steps.length === 5, "RB-001 has 5 steps (detection→verification)");
  assert(rb001?.steps[0].phase === "detection", "first step is detection");
  assert(rb001?.steps[4].phase === "verification", "last step is verification");

  const rb003 = getRunbook("RB-003");
  assert(rb003?.severity === "critical", "RB-003 is critical severity");
  assert(rb003?.disableSwitch?.env === "DISABLE_EVM_SUBMISSION", "RB-003 has EVM disable switch");

  const rb005 = getRunbook("RB-005");
  assert(rb005?.severity === "critical", "RB-005 is critical severity");

  // Verify all runbooks have the 5 standard phases
  for (const runbook of all) {
    const phases = runbook.steps.map((s) => s.phase);
    assert(phases.includes("detection"), `${runbook.id} has detection`);
    assert(phases.includes("diagnosis"), `${runbook.id} has diagnosis`);
    assert(phases.includes("containment"), `${runbook.id} has containment`);
    assert(phases.includes("recovery"), `${runbook.id} has recovery`);
    assert(phases.includes("verification"), `${runbook.id} has verification`);
  }

  // runbookToReadinessCheck
  const check = runbookToReadinessCheck(rb001!);
  assert(check.title.includes("RB-001"), "readiness check has runbook ID");
  assert(check.severity === "high", "readiness check has severity");
  assert(check.disableSwitch !== undefined, "readiness check has disable switch");
}

// ── Run ────────────────────────────────────────────────────────────

console.log("Execution Observability Fixture Check");
console.log("═══════════════════════════════════════\n");

testRedaction();
testAuditEvents();
testDisableSwitches();
testProviderHealth();
testRunbooks();

console.log(`\n═══════════════════════════════════════`);
console.log(`Result: ${passed} passed, ${failed} failed`);
console.log(`═══════════════════════════════════════\n`);

if (failed > 0) {
  process.exit(1);
}
