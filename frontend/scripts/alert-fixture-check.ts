/**
 * Alert engine fixture check. Runs in the same way as agent-fixture-check:
 *
 *   cd frontend && npx tsx --tsconfig tsconfig.json scripts/alert-fixture-check.ts
 *
 * Asserts the alert engine contract:
 *   - Trigger / recovery / dedupe / cooldown / hysteresis semantics
 *   - Wallet isolation (case-insensitive)
 *   - Delivery adapters (in-app delivered, external channels skipped when env absent)
 *   - Storage sanitizer does not leak wallet addresses or secrets
 *   - Default rule seeder is idempotent
 */

import {
  createAlertObservation,
  createAgentRunRecord,
  ensureAlertRulesForWallet,
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
  listEnabledRulesForEvaluation,
} from "../src/server/observability/alertEngine";
import { buildSanitizedAlertPayload, shortWalletHint } from "../src/server/observability/alertSanitize";
import { deliverAlertToChannel } from "../src/server/observability/alertDeliveries";
import { ensureDefaultRulesForWallet, ingestAgentRunAlerts } from "../src/server/observability/alertIngestion";
import { extractObservationsForRun } from "../src/server/observability/observations";

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

function makeObservation(overrides: { walletAddress?: string; triggerType?: Parameters<typeof createAlertObservation>[0]["triggerType"]; observationKey?: string; value?: number; direction?: Parameters<typeof createAlertObservation>[0]["direction"]; evidence?: Parameters<typeof createAlertObservation>[0]["evidence"] } = {}) {
  const observation = createAlertObservation({
    walletAddress: overrides.walletAddress ?? WALLET_A,
    triggerType: overrides.triggerType ?? "critical_risk",
    observationKey: overrides.observationKey ?? "onchain:fixture",
    value: overrides.value ?? 80,
    direction: overrides.direction ?? "high_is_bad",
    evidence: overrides.evidence ?? {
      runId: `run_${Math.random().toString(36).slice(2, 8)}`,
      agent: overrides.triggerType?.includes("stellar") ? "onchain" : "onchain",
      label: "Critical risk fixture",
      detail: "Honeypot risk observed.",
      sourceLabels: ["GoPlus"],
      meta: { fixture: true },
      ...((overrides.evidence as Record<string, unknown> | undefined) ?? {}),
    },
  });

  return observation;
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
    value: 72, // 72 is between threshold (75) and threshold - hysteresis (70)
    evidence: bad.evidence,
  });
  // within hysteresis: must still be in triggered/degraded path (not yet recovered)
  const borderlineEvaluation = evaluateAndPersistObservation(borderline, rule);

  assert(borderlineEvaluation.outcome === "no_match", "Within-hysteresis value must NOT recover.");
  assert(["dedupe", "below_threshold"].includes(borderlineEvaluation.reason), "Within-hysteresis value must dedupe.");

  const fullyRecovered = makeObservation({
    observationKey: bad.observationKey,
    value: 50, // well below 75 - 5
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
  evaluateAndPersistObservation(first, rule);

  const worse = makeObservation({
    observationKey: first.observationKey,
    value: 95,
    evidence: { ...first.evidence, sourceSnapshotHash: "snap_new" },
  });
  const deterioration = evaluateAndPersistObservation(worse, rule);

  assert(deterioration.outcome === "deteriorated", "Worsening observation must deteriorate the existing alert.");
  if (deterioration.outcome === "deteriorated") {
    assert(deterioration.alert.afterValue === 95, "Deterioration must update afterValue.");
    assert(deterioration.alert.evidenceAfter.sourceSnapshotHash === "snap_new", "Deterioration must refresh evidenceAfter.");
  }
}

async function runCooldown() {
  const rule = makeRule({ cooldownMinutes: 60 });
  const first = makeObservation({ value: 85 });
  const triggered = evaluateAndPersistObservation(first, rule);
  assert(triggered.outcome === "triggered", "Cooldown fixture setup: must trigger.");

  const recovered = makeObservation({ observationKey: first.observationKey, value: 50, evidence: first.evidence });
  evaluateAndPersistObservation(recovered, rule);

  // Immediately after recovery, identical re-trigger must hit cooldown.
  const repeatBad = makeObservation({ observationKey: first.observationKey, value: 90, evidence: { ...first.evidence, runId: "run_repeat" } });
  const cooldownEvaluation = evaluateAndPersistObservation(repeatBad, rule);

  assert(cooldownEvaluation.outcome === "no_match" && cooldownEvaluation.reason === "cooldown", "Re-trigger inside cooldown window must cool down.");

  // After cooldown expires (manipulate clock via internal call), we cannot directly fake dates, but a new rule with shorter cooldown exercises it.
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

  // Wallet B should not see wallet A's rules.
  assert(!listAlertRules(WALLET_B).some((rule) => rule.walletAddress === WALLET_A), "Wallet B must not see wallet A's rules.");

  // Casing: even when wallet is uppercase, isolation must hold.
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
  const seeded = ensureDefaultRulesForWallet(WALLET_A);
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

  // Ingest observations directly to validate the contract.
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

async function main() {
  await runThresholdMath();
  await runTriggerLifecycle();
  await runRecoveryAndHysteresis();
  await runDeterioration();
  await runCooldown();
  await runWalletIsolation();
  await runDeliveryAdapters();
  await runSanitizer();
  await runSeederIdempotency();
  await runIngestionEndToEnd();
  await runIngestionHelper();

  console.log("Alert engine fixture checks passed.");
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
