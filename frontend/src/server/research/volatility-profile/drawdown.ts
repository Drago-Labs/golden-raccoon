import type { DrawdownSummary, PriceObservation } from "./schema";
import { normalizeObservations } from "./series";

export function computeDrawdownSummary(observations: PriceObservation[]): DrawdownSummary {
  const sorted = normalizeObservations(observations);
  if (sorted.length === 0) {
    return {
      maxDrawdownPct: 0,
      peakTimestamp: null,
      troughTimestamp: null,
      recoveryTimestamp: null,
      drawdownDurationSeconds: 0,
      recoveryDurationSeconds: null,
      series: [],
    };
  }

  let runningPeak = sorted[0]!.price;
  let runningPeakTs = sorted[0]!.timestamp;

  let maxDd = 0;
  let bestPeakPrice = runningPeak;
  let bestPeakTs = runningPeakTs;
  let bestTroughTs = runningPeakTs;
  let bestTroughIdx = 0;

  const ddSeries: Array<{ timestamp: number; drawdownPct: number }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const pt = sorted[i]!;
    if (pt.price >= runningPeak) {
      runningPeak = pt.price;
      runningPeakTs = pt.timestamp;
    }
    const dd = runningPeak > 0 ? ((runningPeak - pt.price) / runningPeak) * 100 : 0;
    ddSeries.push({ timestamp: pt.timestamp, drawdownPct: Number(dd.toFixed(4)) });

    if (dd > maxDd) {
      maxDd = dd;
      bestPeakPrice = runningPeak;
      bestPeakTs = runningPeakTs;
      bestTroughTs = pt.timestamp;
      bestTroughIdx = i;
    }
  }

  if (maxDd === 0) {
    return {
      maxDrawdownPct: 0,
      peakTimestamp: sorted[0]!.timestamp,
      troughTimestamp: sorted[0]!.timestamp,
      recoveryTimestamp: sorted[0]!.timestamp,
      drawdownDurationSeconds: 0,
      recoveryDurationSeconds: 0,
      series: ddSeries,
    };
  }

  let recoveryTs: number | null = null;
  for (let i = bestTroughIdx + 1; i < sorted.length; i++) {
    if (sorted[i]!.price >= bestPeakPrice) {
      recoveryTs = sorted[i]!.timestamp;
      break;
    }
  }

  return {
    maxDrawdownPct: Number(maxDd.toFixed(4)),
    peakTimestamp: bestPeakTs,
    troughTimestamp: bestTroughTs,
    recoveryTimestamp: recoveryTs,
    drawdownDurationSeconds: bestTroughTs - bestPeakTs,
    recoveryDurationSeconds: recoveryTs !== null ? recoveryTs - bestTroughTs : null,
    series: ddSeries,
  };
}
