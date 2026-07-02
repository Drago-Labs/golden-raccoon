import { NextResponse } from "next/server";
import { apiCacheStrategy } from "@/server/cache/strategy";
import { getAgentReadiness, getEnvHealth } from "@/server/env/validation";
import { getSecurityHealth } from "@/server/security/policy";
import { getStorageCounts, getStorageHealth } from "@/server/storage";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "golden-raccoon",
      env: getEnvHealth(),
      agentReadiness: getAgentReadiness(),
      storage: getStorageHealth(),
      storageCounts: getStorageCounts(),
      security: getSecurityHealth(),
      cache: apiCacheStrategy,
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
