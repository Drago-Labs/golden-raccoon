import { NextResponse } from "next/server";
import { getProviderHealthSnapshot } from "@/server/observability/providerHealth";
import { getStellarRpcHealth } from "@/server/stellar/client";
import { stellarNetworks } from "@/lib/stellar/config";

export const dynamic = "force-dynamic";

/**
 * Health endpoint exposing detailed provider states, synthetic probe results,
 * rolling health scores, and network outage status.
 */
export async function GET() {
  const networks = Object.keys(stellarNetworks) as Array<keyof typeof stellarNetworks>;
  const stellarReports = await Promise.all(
    networks.map(async (network) => {
      try {
        const report = await getStellarRpcHealth(network);
        return {
          network,
          healthy: report.healthy,
          status: report.status,
          latestLedger: report.latestLedger,
          latencyMs: report.latencyMs,
          checkedAt: report.checkedAt,
          fallbackUsed: report.fallbackUsed,
          providerDisagreement: report.providerDisagreement,
          outage: report.outage,
          providers: report.providers,
        };
      } catch (error) {
        return {
          network,
          healthy: false,
          status: "unavailable" as const,
          checkedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
          outage: {
            isOutage: true,
            reason: error instanceof Error ? error.message : "Provider failure",
          },
          providers: [],
        };
      }
    }),
  );

  const snapshot = await getProviderHealthSnapshot();

  return NextResponse.json(
    {
      ok: true,
      service: "golden-raccoon-providers",
      checkedAt: new Date().toISOString(),
      overallStatus: snapshot.overallStatus,
      stellar: {
        networks: stellarReports,
      },
      evm: snapshot.evm,
      circuits: snapshot.circuits,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
