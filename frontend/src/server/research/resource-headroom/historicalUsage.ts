import type { HeadroomNetwork } from "./networkIdentity";
import type { RawInvocationSample } from "./schema";

export interface HistoricalUsageProvider {
  readHistoricalUsage(input: {
    txHash: string;
    network: HeadroomNetwork;
  }): Promise<RawInvocationSample>;
}

export function createDefaultHistoricalReader(): HistoricalUsageProvider {
  return {
    async readHistoricalUsage({ network }) {
      return {
        network,
        ledger: 0,
        failed: true,
        errorMessage: "Default historical reader is not connected",
        diagnosticEvents: [],
        metrics: null,
      };
    },
  };
}
