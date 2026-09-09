export type StellarProviderErrorCode =
  | "all_providers_failed"
  | "invalid_request"
  | "malformed_xdr"
  | "missing_entry"
  | "network_mismatch"
  | "provider_lag"
  | "rpc_error"
  | "simulation_failed"
  | "submission_failed"
  | "timeout"
  | "transport_error"
  | "network_outage";

export type StellarProviderAttempt = {
  providerUrl: string;
  stage: "health" | "operation";
  attempt: number;
  ok: boolean;
  latencyMs: number;
  ledgerHeight?: number;
  errorCode?: StellarProviderErrorCode;
  error?: string;
};

export class StellarDataLayerError extends Error {
  constructor(
    readonly code: StellarProviderErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly attempts: readonly StellarProviderAttempt[] = [],
  ) {
    super(message);
    this.name = "StellarDataLayerError";
  }
}
