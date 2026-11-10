import type { HeadroomNetwork } from "./networkIdentity";
import type { RawInvocationSample } from "./schema";

export interface SimulationProvider {
  simulateInvocation(input: {
    contractId: string;
    functionName: string;
    args: string[];
    network: HeadroomNetwork;
  }): Promise<RawInvocationSample>;
}

export function createDefaultSimulationReader(): SimulationProvider {
  return {
    async simulateInvocation({ network }) {
      return {
        network,
        ledger: 0,
        failed: true,
        errorMessage: "Default simulation provider is not connected",
        diagnosticEvents: [],
        metrics: null,
      };
    },
  };
}
