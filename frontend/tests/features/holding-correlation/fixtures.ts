import type { HoldingsPriceProvider, HoldingSeries } from "@/server/research/holding-correlation";

export const wallet = "0x9999999999999999999999999999999999999999";

export function recordedHoldingsProvider(series: HoldingSeries[]): HoldingsPriceProvider {
  return {
    async loadHoldingsWithSeries() {
      return series;
    },
  };
}
