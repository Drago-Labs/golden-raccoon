import assert from "node:assert/strict";
import { buildSanitizedAlertPayload, redactWalletAddressInEvidence } from "../src/server/observability/alertSanitize";
import type { Alert, AlertObservation } from "../src/server/types";

const secrets = ["0x" + "a".repeat(40), "sk-abcdefgh12345678", "api_key=abcdef12345678", "G" + "A".repeat(55), "S" + "A".repeat(55)];
for (const secret of secrets) {
  for (let run = 0; run < 3; run++) {
    const evidence = { sourceLabels: [secret, secret, "Public source"], runId: secret, sourceSnapshotHash: secret, agent: "onchain", label: "Risk", detail: "Risk change" } satisfies AlertObservation["evidence"];
    const payload = buildSanitizedAlertPayload({ triggerType: "critical_risk", severity: "high", message: secret, observationKey: secret, beforeValue: 1, afterValue: 2, triggeredAt: "2026-01-01T00:00:00Z" } as Parameters<typeof buildSanitizedAlertPayload>[0], evidence);
    assert.ok(!JSON.stringify(payload).includes(secret));
    assert.deepEqual(payload.sourceLabels, ["Public source"]);
    assert.ok(!JSON.stringify(redactWalletAddressInEvidence(evidence)).includes(secret));
  }
}
const safe = buildSanitizedAlertPayload({ triggerType: "critical_risk", severity: "high", message: "Risk increased", observationKey: "public-key", beforeValue: 1, afterValue: 2, triggeredAt: "2026-01-01T00:00:00Z" } as Pick<Alert, "triggerType" | "severity" | "message" | "observationKey" | "beforeValue" | "afterValue" | "triggeredAt">, { sourceLabels: ["Public source"], runId: "public-run", agent: "onchain", label: "Risk", detail: "Risk change" });
assert.equal(safe.summary, "Risk increased");
assert.equal(safe.observationKey, "public-key");
console.log("Alert redaction regression checks passed");
