import type { RecordedPriceSeries, SeriesInterval } from "./schema";

export interface PriceSeriesSource {
  loadSeries(input: {
    assetSymbol: string;
    interval: SeriesInterval;
    windowDays: number;
  }): Promise<RecordedPriceSeries>;
}

export function createDefaultPriceSource(): PriceSeriesSource {
  return {
    async loadSeries(input) {
      return {
        assetSymbol: input.assetSymbol,
        source: "recorded-feed",
        interval: input.interval,
        expectedStepSeconds: input.interval === "1h" ? 3600 : 86400,
        observations: [],
      };
    },
  };
}
