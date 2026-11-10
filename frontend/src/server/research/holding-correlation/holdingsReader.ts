import type { HoldingSeries } from "./schema";

export interface HoldingsPriceProvider {
  loadHoldingsWithSeries(input: {
    walletAddress: string;
    network: string;
    windowDays: number;
  }): Promise<HoldingSeries[]>;
}

export function createDefaultHoldingsReader(): HoldingsPriceProvider {
  return {
    async loadHoldingsWithSeries() {
      return [];
    },
  };
}
