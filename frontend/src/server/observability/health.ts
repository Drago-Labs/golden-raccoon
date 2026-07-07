import { apiCacheStrategy } from "@/server/cache/strategy";
import { getAgentReadiness, getEnvHealth } from "@/server/env/validation";
import { getReleaseReadinessHealth } from "@/server/operations/releaseReadiness";
import { getPortfolioProviderHealth } from "@/server/portfolio/getPortfolio";
import { getStorageHealth, listAgentRunRecords } from "@/server/storage";

function getLastSuccessfulProviderCall() {
  const records = listAgentRunRecords();
  const connectedSources = records
    .flatMap((record) => record.results)
    .flatMap((result) => result.sources.map((source) => ({ agent: result.agent, source })))
    .filter((item) => item.source.status === "connected" && item.source.checkedAt)
    .sort((left, right) => new Date(right.source.checkedAt ?? 0).getTime() - new Date(left.source.checkedAt ?? 0).getTime());

  return connectedSources[0]
    ? {
        agent: connectedSources[0].agent,
        provider: connectedSources[0].source.provider ?? connectedSources[0].source.label,
        checkedAt: connectedSources[0].source.checkedAt,
      }
    : undefined;
}

export function getProductionHealth() {
  return {
    envConfig: getEnvHealth(),
    agentReadiness: getAgentReadiness(),
    providerConnectivity: {
      portfolio: getPortfolioProviderHealth(),
    },
    databaseConnectivity: getStorageHealth(),
    cacheStatus: apiCacheStrategy,
    releaseReadiness: getReleaseReadinessHealth(),
    lastSuccessfulProviderCall: getLastSuccessfulProviderCall(),
  };
}
