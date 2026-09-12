import {
  type NormalizedObservation,
  type PegAnalysisSummary,
  type PegDefinition,
} from "./schema";

export type DeviationCalculationResult = {
  observationsWithDeviations: NormalizedObservation[];
  summary: PegAnalysisSummary;
};

/**
 * Calculates basis point deviation from a declared target value.
 */
export function calculateDeviationBps(price: number, target: number): number {
  if (target <= 0) {
    throw new Error(`Invalid non-positive peg declared target value: ${target}`);
  }
  return Math.round(((price - target) / target) * 10_000);
}

/**
 * Calculates basis point deviation from the declared target peg for each normalized observation.
 * Aggregates descriptive distribution metrics including min, max, mean, and standard deviation.
 */
export function calculatePegDeviations(
  normalizedObservations: NormalizedObservation[],
  pegDefinition: PegDefinition,
): DeviationCalculationResult {
  const target = pegDefinition.declaredTargetValue;
  if (target <= 0) {
    throw new Error(`Invalid non-positive peg declared target value: ${target}`);
  }

  const resultObservations: NormalizedObservation[] = [];
  const validDeviations: number[] = [];
  let latestPrice: number | null = null;
  let latestDeviation: number | null = null;

  for (const obs of normalizedObservations) {
    if (obs.normalizedPrice === null || obs.isRateMissing) {
      resultObservations.push({
        ...obs,
        deviationBps: null,
      });
      continue;
    }

    const price = obs.normalizedPrice;
    const deviationBps = calculateDeviationBps(price, target);
    validDeviations.push(deviationBps);
    latestPrice = price;
    latestDeviation = deviationBps;

    resultObservations.push({
      ...obs,
      deviationBps,
    });
  }

  if (validDeviations.length === 0) {
    return {
      observationsWithDeviations: resultObservations,
      summary: {
        currentPrice: null,
        currentDeviationBps: null,
        minDeviationBps: null,
        maxDeviationBps: null,
        meanDeviationBps: null,
        stdDevBps: null,
        activeEpisodesCount: 0,
        recoveredEpisodesCount: 0,
        interruptedEpisodesCount: 0,
      },
    };
  }

  const minBps = Math.min(...validDeviations);
  const maxBps = Math.max(...validDeviations);
  const sumBps = validDeviations.reduce((acc, val) => acc + val, 0);
  const meanBps = Number((sumBps / validDeviations.length).toFixed(2));

  const variance =
    validDeviations.reduce((acc, val) => acc + (val - meanBps) ** 2, 0) / validDeviations.length;
  const stdDevBps = Number(Math.sqrt(variance).toFixed(2));

  return {
    observationsWithDeviations: resultObservations,
    summary: {
      currentPrice: latestPrice,
      currentDeviationBps: latestDeviation,
      minDeviationBps: minBps,
      maxDeviationBps: maxBps,
      meanDeviationBps: meanBps,
      stdDevBps,
      activeEpisodesCount: 0,
      recoveredEpisodesCount: 0,
      interruptedEpisodesCount: 0,
    },
  };
}
