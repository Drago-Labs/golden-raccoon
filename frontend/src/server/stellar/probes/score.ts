import { DEFAULT_MAX_LEDGER_LAG, isLedgerStale } from "./freshness";

export type EndpointHealthState = "healthy" | "degraded" | "unhealthy";

export type ProbeSample = {
  ok: boolean;
  latencyMs: number;
  ledgerHeight?: number;
  lag?: number;
  errorCode?: string;
  error?: string;
  timestamp: number;
};

export type ScoreBreakdown = {
  score: number;
  state: EndpointHealthState;
  baseScore: number;
  latencyPenalty: number;
  failurePenalty: number;
  lagPenalty: number;
  breakdown: {
    latencyPenalty: number;
    failurePenalty: number;
    lagPenalty: number;
  };
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  reasons: string[];
};

export const HEALTHY_SCORE_THRESHOLD = 70;
export const DEGRADED_SCORE_THRESHOLD = 30;

/**
 * Deterministically computes an endpoint health score and classification state
 * given recorded probe samples, ledger lag, and clock time.
 *
 * @param samples Chronologically ordered probe samples (newest last or provided as array)
 * @param options Scoring configuration parameters and current clock
 * @returns Complete score breakdown with assigned state
 */
export function computeEndpointScore(
  samples: readonly ProbeSample[],
  options: {
    maxLag?: number;
    now?: number;
    windowMs?: number;
  } = {},
): ScoreBreakdown {
  const maxLag = options.maxLag ?? DEFAULT_MAX_LEDGER_LAG;
  const reasons: string[] = [];

  if (samples.length === 0) {
    return {
      score: 50,
      state: "degraded",
      baseScore: 50,
      latencyPenalty: 0,
      failurePenalty: 0,
      lagPenalty: 0,
      breakdown: {
        latencyPenalty: 0,
        failurePenalty: 0,
        lagPenalty: 0,
      },
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      reasons: ["No probe samples recorded."],
    };
  }

  const now = options.now ?? samples[samples.length - 1]?.timestamp ?? Date.now();
  const windowMs = options.windowMs ?? 300_000;
  const recentSamples = samples.filter((s) => now - s.timestamp <= windowMs);
  const activeSamples = recentSamples.length > 0 ? recentSamples : samples.slice(-10);

  let consecutiveFailures = 0;
  for (let i = activeSamples.length - 1; i >= 0; i -= 1) {
    if (!activeSamples[i].ok) {
      consecutiveFailures += 1;
    } else {
      break;
    }
  }

  let consecutiveSuccesses = 0;
  for (let i = activeSamples.length - 1; i >= 0; i -= 1) {
    if (activeSamples[i].ok) {
      consecutiveSuccesses += 1;
    } else {
      break;
    }
  }

  const latest = activeSamples[activeSamples.length - 1];

  let lagPenalty = 0;
  const stale = isLedgerStale(latest.lag, maxLag);
  if (stale) {
    lagPenalty = 80;
    reasons.push(`Endpoint lags network head by ${latest.lag} ledgers.`);
  }

  const failedCount = activeSamples.filter((s) => !s.ok).length;
  const failureRate = failedCount / activeSamples.length;
  const failurePenalty = Math.round(failureRate * 65 + consecutiveFailures * 20);
  if (consecutiveFailures > 0) {
    reasons.push(`${consecutiveFailures} consecutive probe failure(s).`);
  }

  const successLatencies = activeSamples.filter((s) => s.ok).map((s) => s.latencyMs);
  const avgLatency = successLatencies.length > 0
    ? successLatencies.reduce((sum, l) => sum + l, 0) / successLatencies.length
    : 2000;
  const latencyPenalty = Math.min(30, Math.max(0, Math.round((avgLatency - 150) / 50)));
  if (latencyPenalty > 10) {
    reasons.push(`High average probe latency (${Math.round(avgLatency)}ms).`);
  }

  const baseScore = 100;
  const rawScore = baseScore - failurePenalty - latencyPenalty - lagPenalty;
  const score = Math.max(0, Math.min(100, rawScore));

  let state: EndpointHealthState = "healthy";
  if (!latest.ok || stale || consecutiveFailures >= 2 || score < DEGRADED_SCORE_THRESHOLD) {
    state = "unhealthy";
  } else if (score < HEALTHY_SCORE_THRESHOLD || consecutiveFailures === 1 || latencyPenalty > 15) {
    state = "degraded";
  }

  return {
    score,
    state,
    baseScore,
    latencyPenalty,
    failurePenalty,
    lagPenalty,
    breakdown: {
      latencyPenalty,
      failurePenalty,
      lagPenalty,
    },
    consecutiveFailures,
    consecutiveSuccesses,
    reasons,
  };
}
