import type { PriceSeriesSource, RecordedPriceSeries } from "@/server/research/volatility-profile";

export const wallet = "0x9999999999999999999999999999999999999999";

export function recordedPriceSource(series: RecordedPriceSeries): PriceSeriesSource {
  return {
    async loadSeries() {
      return series;
    },
  };
}
