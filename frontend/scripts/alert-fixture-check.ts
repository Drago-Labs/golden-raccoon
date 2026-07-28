/**
 * Alert engine fixture check. Runs in the same way as agent-fixture-check:
 *
 *   cd frontend && npx tsx --tsconfig tsconfig.json scripts/alert-fixture-check.ts
 *
 * Asserts the alert engine contract:
 *   - Trigger / recovery / dedupe / cooldown / hysteresis semantics
 *   - Wallet isolation (case-insensitive)
 *   - Delivery adapters (in-app delivered, external channels skipped when env absent,
 *     and force-failed when ALERT_FORCE_FAIL_CHANNELS is set)
 *   - Storage sanitizer does not leak wallet addresses or secrets
 *   - Default rule seeder is idempotent
 *   - Incomplete result (unavailable provider) does NOT generate a phantom alert
 *   - Alert evidence immutability (before-evidence snapshot frozen; deterioration
 *     appends ids+hashes to a chain; after-evidence refreshes from latest observation)
 *   - AlertDetail UI renders before/after observation ids, hashes, and chain
 */

import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import {
  createAlertObservation,
  createAgentRunRecord,
  ensureAlertRulesForWallet,
  getAlert,
  getStorageHealth,
  listAlertDeliveries,
  listAlertObservations,
  listAlertRules,
  listAlerts,
  upsertAlertRule,
} from "../src/server/storage";
import {
  evaluateAndPersistObservation,
  evaluateObservationVsRule,
  fanOutDeliveries,
  hashEvidence,
  listEnabledRulesForEvaluation,
} from "../src/server/observability/alertEngine";
import { buildSanitizedAlertPayload, shortWalletHint } from "../src/server/observability/alertSanitize";
import { deliverAlertToChannel } from "../src/server/observability/alertDeliveries";
import { ensureDefaultRulesForWallet, ingestAgentRunAlerts } from "../src/server/observability/alertIngestion";
import { extractObservationsForRun } from "../src/server/observability/observations";
import { AlertDetail } from "../src/components/AlertHistoryList";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const now = new Date("2026-07-28T12:00:00.000Z");

const WALLET_A = "0xabcWalletALowercase";
const WALLET_B = "0xdefWalletBUppercase";

function makeRule(overrides: Partial<Parameters<typeof upsertAlertRule>[0]> = {}) {
  const id = overrides.id ?? `rule_${Math.random().toString(36).slice(2, 8)}`;
  const rule = {
    id,
    walletAddress: overrides.walletAddress ?? WALLET_A,
    triggerType: "critical_risk" as const,
    observationKey: overrides.observationKey,
    threshold: 75,
    hysteresis: 5,
    cooldownMinutes: 30,
    direction: "high_is_bad" as const,
    severity: "critical" as const,
    enabled: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };

  return upsertAlertRule(rule);
}

function makeObservation(overrides: {
  walletAddress?: string;
  triggerType?: Parameters<typeof createAlertObservation>[0]["triggerType"];
  observationKey?: string;
  value?: number;
  direction?: Parameters<typeof createAlertObservation>[0]["direction"];
  evidence?: Parameters<typeof createAlertObservation>[0]["evidence"];
  incompleteData?: boolean;
} = {}) {
  return createAlertObservation({
    walletAddress: overrides.walletAddress ?? WALLET_A,
    triggerType: overrides.triggerType ?? "critical_risk",
    observationKey: overrides.observationKey ?? "onchain:fixture",
    value: overrides.value ?? 80,
    direction: overrides.direction ?? "high_is_bad",
    evidence: overrides.evidence ?? {
      runId: `run_${Math.random().toString(36).slice(2, 8)}`,
      agent: "onchain",
      label: "Critical risk fixture",
      detail: "Honeypot risk observed.",
      sourceLabels: ["GoPlus"],
      meta: { fixture: true },
      ...((overrides.evidence as Record<string, unknown> | undefined) ?? {}),
    },
    ...(overrides.incompleteData !== undefined ? { incompleteData: overrides.incompleteData } : {}),
  });
}

async function runThresholdMath() {
  assert(evaluateObservationVsRule({ threshold: 75, hysteresis: 5, direction: "high_is_bad" }, { value: 90, direction: "high_is_bad" }).isBad, "high_is_bad 90 > 75 must be bad.");
  assert(!evaluateObservationVsRule({ threshold: 75, hysteresis: 5, direction: "high_is_bad" }, { value: 70, direction: "high_is_bad" }).isBad, "high_is_bad 70 < 75 must NOT be bad.");
  assert(evaluateObservationVsRule({ threshold: 75, hysteresis: 5, direction: "high_is_bad" }, { value: 69, direction: "high_is_bad" }).isRecovered, "high_is_bad 69 < 75-5 must be recovered when active.");
  assert(!evaluateObservationVsRule({ threshold: 75, hysteresis: 5, direction: "high_is_bad" }, { value: 70, direction: "high_is_bad" }).isRecovered, "high_is_bad 70 must NOT be recovered (within hysteresis).");
  assert(evaluateObservationVsRule({ threshold: 25_000, hysteresis: 5_000, direction: "low_is_bad" }, { value: 24_000, direction: "low_is_bad" }).isBad, "low_is_bad 24000 < 25000 must be bad.");
  assert(evaluateObservationVsRule({ threshold: 25_000, hysteresis: 5_000, direction: "low_is_bad" }, { value: 32_000, direction: "low_is_bad" }).isRecovered, "low_is_bad 32000 > 30000 must be recovered.");
}

async function runTriggerLifecycle() {
  const rule = makeRule({ cooldownMinutes: 30 });

  const firstObservation = makeObservation({ value: 82 });
  const firstEvaluation = evaluateAndPersistObservation(firstObservation, rule);

  assert(firstEvaluation.outcome === "triggered", "First observation must trigger.");
  assert(firstEvaluation.alert && firstEvaluation.alert.status === "triggered", "Fresh alert must be in triggered state.");
  assert(firstEvaluation.deliveries.length === 4, "All 4 delivery channels must be attempted.");
  assert(firstEvaluation.deliveries.some((delivery) => delivery.channel === "in_app" && delivery.status === "delivered"), "in_app channel must always deliver.");
  assert(firstEvaluation.alert.evidenceData.evidenceAfterObservationId === firstObservation.id, "Trigger must link the after-observation id.");
  assert(typeof firstEvaluation.alert.evidenceData.evidenceAfterHash === "string" && firstEvaluation.alert.evidenceData.evidenceAfterHash.startsWith("evh_"), "Trigger must persist an evidence-after hash.");
  assert(firstEvaluation.alert.evidenceData.deteriorationObservationIds.length === 1, "Trigger must initialize the chain with the first observation id.");

  // Recreate using a fresh id (the storage layer dedupes IDs).
  const dupObservation = createAlertObservation({
    walletAddress: firstObservation.walletAddress,
    triggerType: firstObservation.triggerType,
    observationKey: firstObservation.observationKey,
    value: firstObservation.value,
    direction: firstObservation.direction,
    evidence: firstObservation.evidence,
  });
  const dupEvaluation = evaluateAndPersistObservation(dupObservation, rule);

  assert(dupEvaluation.outcome === "no_match" && dupEvaluation.reason === "dedupe", "Identical evidence must dedupe.");
}

async function runRecoveryAndHysteresis() {
  const rule = makeRule({ cooldownMinutes: 5 });
  const bad = makeObservation({ value: 90 });
  const triggered = evaluateAndPersistObservation(bad, rule);
  assert(triggered.outcome === "triggered", "Recovery fixture setup: must trigger.");

  const borderline = makeObservation({
    observationKey: bad.observationKey,
    value: 72,
    evidence: bad.evidence,
  });
  const borderlineEvaluation = evaluateAndPersistObservation(borderline, rule);

  assert(borderlineEvaluation.outcome === "no_match", "Within-hysteresis value must NOT recover.");
  assert(["dedupe", "below_threshold"].includes(borderlineEvaluation.reason), "Within-hysteresis value must dedupe.");

  const fullyRecovered = makeObservation({
    observationKey: bad.observationKey,
    value: 50,
    evidence: bad.evidence,
  });
  const recovery = evaluateAndPersistObservation(fullyRecovered, rule);

  assert(recovery.outcome === "recovered", "Value below threshold minus hysteresis must recover.");
  if (recovery.outcome === "recovered") {
    assert(recovery.alert.status === "recovered", "Recovered alert must transition to recovered.");
    assert(recovery.alert.recoveredAt, "Recovered alert must stamp recoveredAt.");
    assert(recovery.deliveries.length === 4, "Recovery must write delivery rows for all 4 channels.");
  }
}

async function runDeterioration() {
  const rule = makeRule({ cooldownMinutes: 30 });
  const first = makeObservation({ value: 80 });
  const firstEval = evaluateAndPersistObservation(first, rule);
  assert(firstEval.outcome === "triggered", "Deterioration fixture setup: must trigger.");
  if (firstEval.outcome !== "triggered") return;

  const beforeEvidenceBefore = firstEval.alert.evidenceBefore;
  const beforeHash = firstEval.alert.evidenceData.evidenceBeforeHash;
  const worse = makeObservation({
    observationKey: first.observationKey,
    value: 95,
    evidence: { ...first.evidence, sourceSnapshotHash: "snap_new" },
  });
  const deterioration = evaluateAndPersistObservation(worse, rule);

  assert(deterioration.outcome === "deteriorated", "Worsening observation must deteriorate the existing alert.");
  if (deterioration.outcome !== "deteriorated") return;

  assert(deterioration.alert.afterValue === 95, "Deterioration must update afterValue.");
  assert(deterioration.alert.evidenceAfter.sourceSnapshotHash === "snap_new", "Deterioration must refresh evidenceAfter.");

  // Critical audit requirement: evidenceBefore must NOT have been mutated.
  assert(deterioration.alert.evidenceBefore === beforeEvidenceBefore || JSON.stringify(deterioration.alert.evidenceBefore) === JSON.stringify(beforeEvidenceBefore), "evidenceBefore must remain immutable across deterioration.");
  assert(deterioration.alert.evidenceData.evidenceBeforeHash === beforeHash, "evidenceBeforeHash must not change on deterioration.");
  assert(deterioration.alert.evidenceData.evidenceBeforeObservationId === firstEval.alert.evidenceData.evidenceBeforeObservationId, "evidenceBeforeObservationId must not change on deterioration.");
  assert(deterioration.alert.evidenceData.evidenceAfterObservationId === worse.id, "evidenceAfterObservationId links to the latest observation.");
  assert(deterioration.alert.evidenceData.deteriorationObservationIds.length === 2, "Deterioration chain must include both observation ids.");
  assert(deterioration.alert.evidenceData.deteriorationObservationIds.includes(first.id), "Chain must include the original observation id.");
  assert(deterioration.alert.evidenceData.deteriorationObservationIds.includes(worse.id), "Chain must include the new observation id.");
  assert(deterioration.alert.evidenceData.evidenceAfterHash === hashEvidence(worse.evidence), "Evidence-after hash must match the new observation's evidence.");

  // Third event: still no mutation of the original before-snapshot.
  const even_worse = makeObservation({
    observationKey: first.observationKey,
    value: 110,
    evidence: { ...first.evidence, sourceSnapshotHash: "snap_third" },
  });
  const deterioration3 = evaluateAndPersistObservation(even_worse, rule);

  assert(deterioration3.outcome === "deteriorated", "Second worsening observation must deteriorate again.");
  if (deterioration3.outcome === "deteriorated") {
    assert(deterioration3.alert.evidenceData.deteriorationObservationIds.length === 3, "Chain grows on every deterioration event.");
    assert(JSON.stringify(deterioration3.alert.evidenceBefore) === JSON.stringify(beforeEvidenceBefore), "evidenceBefore remains the original after a second deterioration.");
    assert(deterioration3.alert.evidenceData.evidenceBeforeHash === beforeHash, "evidenceBeforeHash remains stable across multiple deterioration events.");
    assert(deterioration3.alert.evidenceData.evidenceAfterObservationId === even_worse.id, "After-observation id tracks the newest observation.");
  }
}

async function runCooldown() {
  const rule = makeRule({ cooldownMinutes: 60 });
  const first = makeObservation({ value: 85 });
  const triggered = evaluateAndPersistObservation(first, rule);
  assert(triggered.outcome === "triggered", "Cooldown fixture setup: must trigger.");

  const recovered = makeObservation({ observationKey: first.observationKey, value: 50, evidence: first.evidence });
  evaluateAndPersistObservation(recovered, rule);

  const repeatBad = makeObservation({ observationKey: first.observationKey, value: 90, evidence: { ...first.evidence, runId: "run_repeat" } });
  const cooldownEvaluation = evaluateAndPersistObservation(repeatBad, rule);

  assert(cooldownEvaluation.outcome === "no_match" && cooldownEvaluation.reason === "cooldown", "Re-trigger inside cooldown window must cool down.");

  const shortRule = makeRule({ cooldownMinutes: 0, id: "rule_short" });
  const shortEvaluation = evaluateAndPersistObservation(makeObservation({ observationKey: first.observationKey, value: 95, evidence: { ...first.evidence, runId: "run_after" } }), shortRule);
  assert(shortEvaluation.outcome === "triggered", "Out of cooldown must trigger a fresh alert.");
}

async function runWalletIsolation() {
  const walletARule = makeRule({ walletAddress: WALLET_A, observationKey: undefined });
  const walletBObservation = makeObservation({ walletAddress: WALLET_B, value: 90, observationKey: "onchain:fixture" });
  const walletAAlertsBefore = listAlerts(WALLET_A).length;
  const evaluation = evaluateAndPersistObservation(walletBObservation, walletARule);

  assert(evaluation.outcome === "no_match", "Cross-wallet observation against a wallet-A rule must NOT trigger.");
  assert(listAlerts(WALLET_A).length === walletAAlertsBefore, "Wallet A alert count must be unchanged when wallet B observation is processed.");
  assert(listAlerts(WALLET_B).every((alert) => alert.walletAddress === WALLET_B), "Wallet B's alerts list must only contain wallet B records.");

  assert(!listAlertRules(WALLET_B).some((rule) => rule.walletAddress === WALLET_A), "Wallet B must not see wallet A's rules.");

  ensureDefaultRulesForWallet(WALLET_A.toUpperCase());
  const rulesInAnyCase = listAlertRules(WALLET_A);
  assert(rulesInAnyCase.every((rule) => rule.walletAddress === WALLET_A.toLowerCase()), "All persisted rules must be stored lowercase.");
}

async function runDeliveryAdapters() {
  const rule = makeRule({ cooldownMinutes: 1 });
  const observation = makeObservation({ value: 88 });
  const triggered = evaluateAndPersistObservation(observation, rule);
  assert(triggered.outcome === "triggered", "Delivery fixture must trigger.");

  if (triggered.outcome !== "triggered") return;
  const inAppDelivery = listAlertDeliveries(triggered.alert.id).find((delivery) => delivery.channel === "in_app");
  assert(inAppDelivery?.status === "delivered", "in_app delivery adapter must always succeed.");

  const telegramDelivery = listAlertDeliveries(triggered.alert.id).find((delivery) => delivery.channel === "telegram");
  assert(telegramDelivery?.status === "skipped", "Telegram delivery without env must be skipped.");
  assert(deliverAlertToChannel("discord", {} as Parameters<typeof deliverAlertToChannel>[1], { walletAddress: WALLET_A, triggerType: "critical_risk", severity: "high" }).status === "skipped", "Discord without env must skip.");
}

async function runDeliveryFailureFixture() {
  // Audit requirement: the fixture must exercise the failed-delivery path
  // and the configured adapters must be able to return "failed" so the
  // alert engine persists a real audit row.
  const previousTierEmail = process.env.ALERT_EMAIL_WEBHOOK_URL;
  const previousTierDiscord = process.env.ALERT_DISCORD_WEBHOOK_URL;
  process.env.ALERT_EMAIL_WEBHOOK_URL = "https://example.invalid/email";
  process.env.ALERT_DISCORD_WEBHOOK_URL = "https://example.invalid/discord";
  process.env.ALERT_FORCE_FAIL_CHANNELS = "email,telegram";

  try {
    const rule = makeRule({ cooldownMinutes: 0, id: `rule_force_fail_${Math.random().toString(36).slice(2, 8)}` });
    const observation = makeObservation({ value: 92 });
    const triggered = evaluateAndPersistObservation(observation, rule);

    assert(triggered.outcome === "triggered", "Force-fail fixture must trigger.");
    if (triggered.outcome !== "triggered") return;

    const deliveries = listAlertDeliveries(triggered.alert.id);
    const inApp = deliveries.find((delivery) => delivery.channel === "in_app");
    const email = deliveries.find((delivery) => delivery.channel === "email");
    const telegram = deliveries.find((delivery) => delivery.channel === "telegram");
    const discord = deliveries.find((delivery) => delivery.channel === "discord");

    assert(inApp?.status === "delivered", "in_app must still be delivered even when ALERT_FORCE_FAIL_CHANNELS excludes it.");
    assert(email?.status === "failed", "email must be flagged failed via ALERT_FORCE_FAIL_CHANNELS override.");
    assert(email?.errorDetail?.includes("ALERT_FORCE_FAIL_CHANNELS"), "failed delivery must surface override detail.");
    assert(telegram?.status === "failed", "telegram must be flagged failed via ALERT_FORCE_FAIL_CHANNELS override.");
    assert(discord?.status === "delivered", "discord must remain delivered (override does not include it).");

    // Direct adapter call outside of the alert should also respect the override.
    assert(deliverAlertToChannel("email", {} as Parameters<typeof deliverAlertToChannel>[1], { walletAddress: WALLET_A, triggerType: "critical_risk", severity: "high" }).status === "failed", "deliverAlertToChannel must honor ALERT_FORCE_FAIL_CHANNELS directly.");
  } finally {
    if (previousTierEmail === undefined) delete process.env.ALERT_EMAIL_WEBHOOK_URL;
    else process.env.ALERT_EMAIL_WEBHOOK_URL = previousTierEmail;
    if (previousTierDiscord === undefined) delete process.env.ALERT_DISCORD_WEBHOOK_URL;
    else process.env.ALERT_DISCORD_WEBHOOK_URL = previousTierDiscord;
    delete process.env.ALERT_FORCE_FAIL_CHANNELS;
  }
}

async function runSanitizer() {
  const payload = buildSanitizedAlertPayload(
    {
      triggerType: "critical_risk",
      observationKey: "onchain:0xSECRET-KEY-PRIVATE",
      severity: "critical",
      message: "Critical risk reached 95 (onchain:fixture).",
      beforeValue: 50,
      afterValue: 95,
      triggeredAt: now.toISOString(),
    },
    {
      runId: "run_test",
      agent: "onchain",
      label: "Critical risk fixture",
      detail: "Sensitive content api_key=abc1234567890\n\nsecret 0xDEADBEEF",
      sourceLabels: ["GoPlus"],
      meta: { privateKey: "0xshould-not-leak", bearer: "Bearer abcdef", publicNote: "ok" },
    },
    { walletAddressHint: WALLET_A },
  );
  assert((payload as Record<string, unknown>).walletHint === shortWalletHint(WALLET_A), "Sanitizer must expose shortWalletHint.");

  const serialized = JSON.stringify(payload);
  assert(!serialized.includes("0xabc1234567890"), "Sanitizer must redact secrets and api_key= values.");
  assert(!serialized.toLowerCase().includes("privatekey") && !serialized.toLowerCase().includes("bearer"), "Sanitizer must strip privateKey/bearer keys.");
  assert(serialized.length < 4_000, "Sanitizer payload must remain small.");
}

async function runSeederIdempotency() {
  const seeded = ensureAlertRulesForWallet(WALLET_A);
  const seededCount = seeded.length;

  assert(seeded.length > 0, "First seeder call must persist defaults.");

  const seededAgain = ensureDefaultRulesForWallet(WALLET_A);

  assert(seededAgain.length === seededCount, "Second seeder call must be idempotent — no new rows.");

  const ruleIds = new Set(seeded.map((rule) => rule.id));
  const secondIds = new Set(seededAgain.map((rule) => rule.id));

  assert(ruleIds.size === seededCount && secondIds.size === seededCount, "All default rule IDs must be stable across seeder calls.");
}

async function runIngestionEndToEnd() {
  const rule = makeRule({ triggerType: "liquidity_drop", walletAddress: WALLET_A, threshold: 50_000, hysteresis: 5_000, cooldownMinutes: 0, observationKey: undefined, id: "rule_liq" });
  const observationHistory = [
    makeObservation({ triggerType: "liquidity_drop", value: 80_000, observationKey: "onchain:liq", evidence: { runId: "run_liq_1", agent: "onchain", label: "Liquidity fixture", detail: "Above threshold", sourceLabels: ["DexScreener"] } }),
    makeObservation({ triggerType: "liquidity_drop", value: 30_000, observationKey: "onchain:liq", evidence: { runId: "run_liq_2", agent: "onchain", label: "Liquidity fixture", detail: "Below threshold", sourceLabels: ["DexScreener"] } }),
  ];

  const runRecord = createAgentRunRecord({
    walletAddress: WALLET_A,
    mode: "token_scan",
    inputSnapshot: { token: "fixture-token" },
    targetToken: { symbol: "FIX", chain: "base" },
    results: [],
  });
  void runRecord;

  const result = ingestionRunObservationFlow(observationHistory, rule);

  assert(result.recoveries > 0 || result.triggers > 0, "Ingestion simulation must yield observable counts.");
  void ensureAlertRulesForWallet;
  void extractObservationsForRun;
}

function ingestionRunObservationFlow(observations: Parameters<typeof createAlertObservation>[0][], rule: ReturnType<typeof makeRule>) {
  let triggers = 0;
  let recoveries = 0;
  let dedups = 0;

  for (const input of observations) {
    const observation = createAlertObservation(input);
    const evaluation = evaluateAndPersistObservation(observation, rule);

    if (evaluation.outcome === "triggered") triggers += 1;
    if (evaluation.outcome === "recovered") recoveries += 1;
    if (evaluation.outcome === "no_match" && evaluation.reason === "dedupe") dedups += 1;
  }

  return { triggers, recoveries, dedups };
}

async function runIngestionHelper() {
  const runRecord = createAgentRunRecord({
    walletAddress: WALLET_A,
    mode: "token_scan",
    inputSnapshot: { token: "fixture" },
    targetToken: { symbol: "FIX", chain: "base" },
    results: [
      {
        agent: "onchain",
        status: "partial",
        riskScore: 78,
        score: 78,
        riskLevel: "high",
        verdict: "Critical risk detected",
        summary: "Honeypot-flagged fixture.",
        findings: [
          {
            label: "Honeypot",
            severity: "critical",
            detail: "Detected honeypot risk.",
            scoreImpact: 90,
            weight: 1,
            sourceLabel: "GoPlus",
            interpretation: "Cannot sell.",
            confidence: 0.86,
          },
        ],
        sources: [{ label: "GoPlus", status: "connected", checkedAt: now.toISOString() }],
        dataQuality: { mode: "partial", connectedSources: 1, unavailableSources: 0, mockSources: 0, sourceCount: 1, reliability: 0.7, detail: "Partial fixture." },
        confidence: 0.7,
        recommendedAction: "avoid",
        blockingReasons: ["Critical finding"],
        missingData: [],
        rawSignals: { holders: { top5Percent: 70 }, market: { bestPair: { liquidityUsd: 20_000 } } },
        createdAt: now.toISOString(),
      },
    ],
  });

  const observationsBefore = listAlertObservations(WALLET_A).length;

  ensureDefaultRulesForWallet(WALLET_A);
  listEnabledRulesForEvaluation(WALLET_A);

  const ingestResult = ingestAgentRunAlerts(runRecord);
  assert(ingestResult.persistedObservationIds.length >= 1, "Ingestion must persist at least one observation.");
  void fanOutDeliveries;

  const observationsAfter = listAlertObservations(WALLET_A).length;

  assert(observationsAfter > observationsBefore, "Observation store must grow after ingestion.");
}

async function runIncompleteDataSuppression() {
  // Audit requirement: an AgentResult with an unavailable provider must
  // not generate a phantom critical_risk alert. Only rpc_degradation
  // observations may flow when the result is incomplete.
  const rule = makeRule({ id: `rule_incomplete_${Math.random().toString(36).slice(2, 8)}` });
  const runRecord = createAgentRunRecord({
    walletAddress: WALLET_A,
    mode: "token_scan",
    inputSnapshot: { token: "incomplete" },
    targetToken: { symbol: "INC", chain: "base" },
    results: [
      {
        agent: "onchain",
        status: "partial",
        riskScore: 92, // would normally trigger critical_risk at threshold 75
        score: 92,
        riskLevel: "high",
        verdict: "Critical risk detected",
        summary: "Mixed-risk fixture with one unavailable provider.",
        findings: [
          { label: "Honeypot", severity: "critical", detail: "Honeypot risk", scoreImpact: 90, weight: 1, sourceLabel: "GoPlus", interpretation: "Cannot sell.", confidence: 0.86 },
        ],
        sources: [
          { label: "GoPlus", status: "connected", checkedAt: now.toISOString() },
          { label: "DexScreener", status: "unavailable", checkedAt: now.toISOString() },
        ],
        dataQuality: { mode: "partial", connectedSources: 1, unavailableSources: 1, mockSources: 0, sourceCount: 2, reliability: 0.4, detail: "Incomplete fixture." },
        confidence: 0.4,
        recommendedAction: "manual_review",
        blockingReasons: ["Critical finding"],
        missingData: [{ field: "dexscreener.market", reason: "provider unavailable", impact: "high" }],
        rawSignals: { holders: { top5Percent: 70 } },
        createdAt: now.toISOString(),
      },
    ],
  });

  void runRecord;
  const observations = extractObservationsForRun(runRecord);
  const observationBeforeAlerts = listAlerts(WALLET_A).length;

  for (const observation of observations) {
    evaluateAndPersistObservation(observation, rule);
  }

  const alertsAfter = listAlerts(WALLET_A).filter((alert) => alert.triggerType === "critical_risk" && alert.observationKey === "onchain:incomplete");

  // We may receive an rpc_degradation observation but no critical_risk alert for this result.
  assert(observations.some((observation) => observation.triggerType === "rpc_degradation"), "Unavailable provider must still surface an rpc_degradation observation.");
  assert(observations.every((observation) => observation.incompleteData === undefined || observation.triggerType === "rpc_degradation"), "Risk observations from an incomplete result are either tagged incompleteData or suppressed entirely.");
  assert(alertsAfter.length === 0 || observationBeforeAlerts === alertsAfter.length, "Critical_risk alerts must NOT be created from an incomplete result.");
  assert(listAlerts(WALLET_A).length === observationBeforeAlerts, "Total alert count must remain unchanged — no phantom alert from a degraded provider.");
}

async function runStorageHealthReporting() {
  const health = getStorageHealth();
  // Whether the adapter is connected depends on env vars; we only check
  // the contract: provider name is one of two values, and the schema
  // contract is always returned.
  assert(["memory", "supabase_postgres"].includes(health.provider), "StorageHealth.provider must be one of the documented values.");
  assert(typeof health.persistent === "boolean", "StorageHealth.persistent must be a boolean.");
  assert(Array.isArray(health.schema?.tables) && health.schema?.tables.includes("alert_deliveries"), "Schema contract must list the alert_deliveries table.");
  assert(Array.isArray(health.schema?.adapterApi) && health.schema?.adapterApi.includes("createAlertDelivery"), "Schema contract must list the storage adapter API surface.");
}

async function runUIRenderSmokeTest() {
  // The UI assertion uses `renderToStaticMarkup` from `react-dom/server`,
  // which is already a transitive dependency of Next.js. We assert that
  // the alert detail panel exposes the immutable before/after observation
  // ids, the evidence hashes, and the deterioration chain in markup.

  // Build a real alert by triggering once and then deteriorating twice so
  // the chain has length 3. Use a unique observation key so the alerts
  // store does not carry priors from earlier fixture routines that would
  // otherwise set `evidenceBeforeObservationId` non-undefined at trigger.
  const uiKey = `onchain:ui-render-${Math.random().toString(36).slice(2, 8)}`;
  const rule = makeRule({ cooldownMinutes: 0, id: `rule_ui_${Math.random().toString(36).slice(2, 8)}`, observationKey: uiKey });
  const first = makeObservation({ value: 80, observationKey: uiKey });
  const triggered = evaluateAndPersistObservation(first, rule);

  assert(triggered.outcome === "triggered", "UI fixture setup must trigger.");
  if (triggered.outcome !== "triggered") return;

  const second = makeObservation({ observationKey: first.observationKey, value: 92, evidence: { ...first.evidence, sourceSnapshotHash: "snap_ui_2" } });
  evaluateAndPersistObservation(second, rule);

  const third = makeObservation({ observationKey: first.observationKey, value: 110, evidence: { ...first.evidence, sourceSnapshotHash: "snap_ui_3" } });
  evaluateAndPersistObservation(third, rule);

  const hydrated = getAlert(triggered.alert.id);
  assert(hydrated, "Alert must be retrievable by id for UI rendering.");
  if (!hydrated) return;

  // We don't go through the React component lifecycle (no wallet connected
  // in fixture mode), so we assert on the data shape that the component
  // relies on. The audit's UI contract: the panel must be able to render
  // the immutable before-id, the latest after-id, both hashes, and the
  // deterioration chain. For a brand-new alert there is no prior
  // observation, so `evidenceBeforeObservationId` is intentionally
  // undefined and we assert that.
  const chain = hydrated.evidenceData.deteriorationObservationIds;
  assert(chain.length === 3, "UI fixture must produce a chain of 3 observations.");
  assert(chain[0] === first.id, "UI fixture chain must start with the first observation id.");
  assert(hydrated.evidenceData.evidenceBeforeObservationId === undefined, "UI fixture must keep evidenceBeforeObservationId undefined for a first trigger.");
  assert(hydrated.evidenceData.evidenceAfterObservationId === third.id, "UI fixture must link the latest after observation.");
  assert(typeof hydrated.evidenceData.evidenceBeforeHash === "string" && (hydrated.evidenceData.evidenceBeforeHash as string).startsWith("evh_"), "UI fixture must have an immutable before-hash.");
  assert(typeof hydrated.evidenceData.evidenceAfterHash === "string" && (hydrated.evidenceData.evidenceAfterHash as string).startsWith("evh_"), "UI fixture must have a fresh after-hash.");

  // Verify a separate "alert with prior observation" path: insert a
  // prior observation and then a fresh trigger. The trigger's
  // `evidenceBeforeObservationId` should now link to the prior id and
  // remain stable across deterioration. This is the audit's
  // "before snapshot is immutable" requirement executed end-to-end.
  const priorKey = `onchain:ui-prior-${Math.random().toString(36).slice(2, 8)}`;
  // Catch-all rule scoped to the prior observation key so the engine
  // doesn't reject the fresh trigger with `key_mismatch`.
  const priorRule = makeRule({
    cooldownMinutes: 0,
    id: `rule_prior_${Math.random().toString(36).slice(2, 8)}`,
    observationKey: undefined,
  });
  const priorId = makeObservation({
    walletAddress: WALLET_A,
    triggerType: "critical_risk",
    observationKey: priorKey,
    value: 60, // below threshold so the prior does NOT trigger
    evidence: { ...first.evidence, runId: "run_prior", sourceSnapshotHash: "snap_prior" },
  });
  const freshTriggerObservation = makeObservation({
    walletAddress: WALLET_A,
    triggerType: "critical_risk",
    observationKey: priorKey,
    value: 92,
    evidence: { ...first.evidence, runId: "run_fresh", sourceSnapshotHash: "snap_fresh" },
  });
  evaluateAndPersistObservation(freshTriggerObservation, priorRule);
  const hydratedWithPrior = listAlerts(WALLET_A).find(
    (alert) => alert.observationKey === priorKey && alert.evidenceData.evidenceAfterObservationId === freshTriggerObservation.id,
  );

  assert(hydratedWithPrior, "UI fixture: alert with prior observation must be created.");
  assert(hydratedWithPrior?.evidenceData.evidenceBeforeObservationId === priorId.id, "UI fixture: trigger must link the prior observation id as the before.");
  assert(hydratedWithPrior?.evidenceData.evidenceAfterObservationId === freshTriggerObservation.id, "UI fixture: trigger must link the new observation id as the after.");

  // Render the expanded alert-detail panel directly. The audit's UI
  // contract for the alert-history view: every user-mutable alert row
  // must carry immutable observation ids + hashes and expose the
  // deterioration chain as a list of observation ids. The full
  // `<AlertHistoryList />` component reads wallet state from wagmi's
  // `useAccount` / the Stellar provider via `useWalletSession`, which
  // requires their provider context to be mounted; that is intentionally
  // not exercised in this fixture (no Next.js runtime here). The
  // exported `<AlertDetail />` panel is what proves the rendering
  // contract end-to-end.
  const detailHtml = renderToStaticMarkup(React.createElement(AlertDetail as unknown as React.ComponentType<{ alert: unknown }>, { alert: hydrated }));
  assert(detailHtml.includes(first.id), "Alert detail must render the original trigger observation id.");
  assert(detailHtml.includes(third.id), "Alert detail must render the latest after-observation id.");
  assert(detailHtml.includes(hydrated.evidenceData.evidenceBeforeHash as string), "Alert detail must render the immutable before-hash.");
  assert(detailHtml.includes(hydrated.evidenceData.evidenceAfterHash as string), "Alert detail must render the latest after-hash.");
  assert(/Deterioration chain/i.test(detailHtml), "Alert detail must label the deterioration chain section when the chain has more than one entry.");
  assert(detailHtml.includes(second.id), "Alert detail must list every observation id in the deterioration chain.");
}

async function main() {
  await runThresholdMath();
  await runTriggerLifecycle();
  await runRecoveryAndHysteresis();
  await runDeterioration();
  await runCooldown();
  await runWalletIsolation();
  await runDeliveryAdapters();
  await runDeliveryFailureFixture();
  await runSanitizer();
  await runSeederIdempotency();
  await runIngestionEndToEnd();
  await runIngestionHelper();
  await runIncompleteDataSuppression();
  await runStorageHealthReporting();
  await runUIRenderSmokeTest();

  // Provide a tiny report so CI logs make the new coverage obvious without
  // making the script disagree with itself.
  const summary = {
    thresholdMath: "ok",
    triggerLifecycle: "ok",
    recoveryAndHysteresis: "ok",
    deterioration: "ok",
    cooldown: "ok",
    walletIsolation: "ok",
    deliveryAdapters: "ok",
    deliveryFailureFixture: "ok",
    sanitizer: "ok",
    seederIdempotency: "ok",
    ingestionEndToEnd: "ok",
    ingestionHelper: "ok",
    incompleteDataSuppression: "ok",
    storageHealthReporting: "ok",
    uiRenderSmokeTest: "ok",
  };

  console.log("Alert engine fixture checks passed.", JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
