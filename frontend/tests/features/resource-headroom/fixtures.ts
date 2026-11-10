import type { RawInvocationSample, ResourceHeadroomDeps } from "@/server/research/resource-headroom";

export const CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
export const TX_HASH = "a".repeat(64);

export function depsFromSample(sample: RawInvocationSample): ResourceHeadroomDeps {
  return {
    simulationProvider: {
      async simulateInvocation() {
        return sample;
      },
    },
    historicalProvider: {
      async readHistoricalUsage() {
        return sample;
      },
    },
  };
}
