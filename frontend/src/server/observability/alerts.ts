export const alertThresholds = {
  providerFailureRatePercent: 25,
  manualReviewRatePercent: 45,
  decisionErrorRatePercent: 5,
  executionConfirmFailurePercent: 5,
  supabaseWriteFailurePercent: 1,
  /** V2: execution-specific thresholds (Issue #18). */
  quoteStaleRatePercent: 20,
  simulationFailureRatePercent: 10,
  policyBlockRatePercent: 15,
  walletRejectionRatePercent: 10,
  submissionFailureRatePercent: 5,
  /** Threshold for confirmation time p95 (ms). Triggers when p95 exceeds this. */
  confirmationTimeP95Ms: 120_000,
};

export function evaluateAlertThresholds(metrics: {
  providerFailureRate: number;
  manualReviewRate: number;
  decisionErrorRate?: number;
  executionConfirmFailureRate?: number;
  supabaseWriteFailureRate?: number;
  /** V2 execution metrics (Issue #18). */
  quoteStaleRate?: number;
  simulationFailureRate?: number;
  policyBlockRate?: number;
  walletRejectionRate?: number;
  submissionFailureRate?: number;
  confirmationTimeP95Ms?: number;
}) {
  return {
    providerFailureSpike: metrics.providerFailureRate >= alertThresholds.providerFailureRatePercent,
    manualReviewSpike: metrics.manualReviewRate >= alertThresholds.manualReviewRatePercent,
    decisionErrorRateHigh: (metrics.decisionErrorRate ?? 0) >= alertThresholds.decisionErrorRatePercent,
    executionConfirmFailureHigh: (metrics.executionConfirmFailureRate ?? 0) >= alertThresholds.executionConfirmFailurePercent,
    supabaseWriteFailureHigh: (metrics.supabaseWriteFailureRate ?? 0) >= alertThresholds.supabaseWriteFailurePercent,
    // V2 execution thresholds
    quoteStaleRateHigh: (metrics.quoteStaleRate ?? 0) >= alertThresholds.quoteStaleRatePercent,
    simulationFailureRateHigh: (metrics.simulationFailureRate ?? 0) >= alertThresholds.simulationFailureRatePercent,
    policyBlockRateHigh: (metrics.policyBlockRate ?? 0) >= alertThresholds.policyBlockRatePercent,
    walletRejectionRateHigh: (metrics.walletRejectionRate ?? 0) >= alertThresholds.walletRejectionRatePercent,
    submissionFailureRateHigh: (metrics.submissionFailureRate ?? 0) >= alertThresholds.submissionFailureRatePercent,
    confirmationTimeHigh: (metrics.confirmationTimeP95Ms ?? 0) >= alertThresholds.confirmationTimeP95Ms,
  };
}
