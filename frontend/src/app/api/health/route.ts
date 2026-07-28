import { NextResponse } from "next/server";
import { apiCacheStrategy } from "@/server/cache/strategy";
import { getAgentReadiness, getEnvHealth } from "@/server/env/validation";
import { getRuntimeModeHealth } from "@/server/env/runtimeMode";
import { getSecurityHealth } from "@/server/security/policy";
import { getStorageCounts, getStorageHealth, listAgentRunRecords } from "@/server/storage";
import { getProductionHealth } from "@/server/observability/health";
import { getAgentRunMetrics } from "@/server/observability/metrics";
import { alertThresholds, evaluateAlertThresholds } from "@/server/observability/alerts";

export const dynamic = "force-dynamic";

export async function GET() {
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
      metrics: getAgentRunMetrics(await listAgentRunRecords()),
      alerts: {
        thresholds: alertThresholds,
        status: evaluateAlertThresholds(getAgentRunMetrics(await listAgentRunRecords())),
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
