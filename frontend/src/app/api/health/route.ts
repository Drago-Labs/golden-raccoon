import { NextResponse } from "next/server";
import { apiCacheStrategy } from "@/server/cache/strategy";
import { getAgentReadiness, getEnvHealth } from "@/server/env/validation";
import { getRuntimeModeHealth } from "@/server/env/runtimeMode";
import { getSecurityHealth } from "@/server/security/policy";
import { getStorageCounts, getStorageHealth, listAgentRunRecords, listAlerts } from "@/server/storage";
import { getProductionHealth } from "@/server/observability/health";
import { getAgentRunMetrics } from "@/server/observability/metrics";
import { alertThresholds, evaluateAlertThresholds } from "@/server/observability/alerts";
import { getAuditEventSummary } from "@/server/observability/executionAudit";
import { getExecutionDisableFlags } from "@/server/observability/providerHealth";
import { runbookToReadinessCheck, listRunbooks } from "@/server/observability/runbooks";

export const dynamic = "force-dynamic";

export function GET() {
  const records = listAgentRunRecords();
  const metrics = getAgentRunMetrics(records);
  const executionMetrics = metrics.execution;
  const triggeredCount = listAlerts(undefined, "triggered").length;
  const recoveredCount = listAlerts(undefined, "recovered").length;
  const acknowledgedCount = listAlerts(undefined, "acknowledged").length;
  const runbooks = listRunbooks().map(runbookToReadinessCheck);
  const auditSummary = getAuditEventSummary();
  const disableFlags = getExecutionDisableFlags();
  return NextResponse.json(
    {
      ok: true,
      service: "golden-raccoon",
      env: getEnvHealth(),
      agentReadiness: getAgentReadiness(),
      storage: await getStorageHealth(),
      storageCounts: await getStorageCounts(),
      security: getSecurityHealth(),
      productionHealth: getProductionHealth(),
      metrics,
      executionAudit: auditSummary,
      runbooks,
      disableFlags,
      alerts: {
        thresholds: alertThresholds,
        status: evaluateAlertThresholds({
          providerFailureRate: metrics.providerFailureRate,
          manualReviewRate: metrics.manualReviewRate,
          executionConfirmFailureRate: executionMetrics?.confirmation?.failureRate,
          supabaseWriteFailureRate: executionMetrics?.storage?.failureRate,
          quoteStaleRate: executionMetrics?.providers?.quote?.staleRate,
          simulationFailureRate: executionMetrics?.providers?.simulation?.failureRate,
          policyBlockRate: executionMetrics?.policy?.blockRate,
          walletRejectionRate: executionMetrics?.approval?.rejectionRate,
          submissionFailureRate: executionMetrics?.submission?.failureRate,
          confirmationTimeP95Ms: executionMetrics?.confirmation?.confirmationTimeMs?.p95,
        }),
        engine: {
          triggered: triggeredCount,
          recovered: recoveredCount,
          acknowledged: acknowledgedCount,
          total: triggeredCount + recoveredCount + acknowledgedCount,
        },
      },
      runtimeMode: getRuntimeModeHealth(),
      cache: apiCacheStrategy,
      mockFallbacksEnabled: false,
      liveModeUsesMockData: false,
      professionalRiskLanguage: true,
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
