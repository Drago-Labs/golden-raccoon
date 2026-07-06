export const alertThresholds = {
  providerFailureRatePercent: 25,
  manualReviewRatePercent: 45,
  decisionErrorRatePercent: 5,
  executionConfirmFailurePercent: 5,
  supabaseWriteFailurePercent: 1,
};

export function evaluateAlertThresholds(metrics: {
  providerFailureRate: number;
  manualReviewRate: number;
  decisionErrorRate?: number;
  executionConfirmFailureRate?: number;
  supabaseWriteFailureRate?: number;
}) {
  return {
    providerFailureSpike: metrics.providerFailureRate >= alertThresholds.providerFailureRatePercent,
    manualReviewSpike: metrics.manualReviewRate >= alertThresholds.manualReviewRatePercent,
    decisionErrorRateHigh: (metrics.decisionErrorRate ?? 0) >= alertThresholds.decisionErrorRatePercent,
    executionConfirmFailureHigh: (metrics.executionConfirmFailureRate ?? 0) >= alertThresholds.executionConfirmFailurePercent,
    supabaseWriteFailureHigh: (metrics.supabaseWriteFailureRate ?? 0) >= alertThresholds.supabaseWriteFailurePercent,
  };
}
