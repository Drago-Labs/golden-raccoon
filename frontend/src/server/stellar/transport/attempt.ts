import { redactProviderUrl } from "@/lib/stellar/failover";
import type { StellarProviderErrorCode } from "../errors";

export type TransportAttempt = {
  endpointUrl: string;
  safeUrl: string;
  attemptNumber: number;
  ok: boolean;
  latencyMs: number;
  stage?: string;
  ledgerHeight?: number;
  errorCode?: StellarProviderErrorCode;
  error?: string;
  hedged?: boolean;
};

export function createAttempt(input: {
  endpointUrl: string;
  attemptNumber: number;
  ok: boolean;
  latencyMs: number;
  stage?: string;
  ledgerHeight?: number;
  errorCode?: StellarProviderErrorCode;
  error?: string;
  hedged?: boolean;
}): TransportAttempt {
  return {
    endpointUrl: input.endpointUrl,
    safeUrl: redactProviderUrl(input.endpointUrl),
    attemptNumber: input.attemptNumber,
    ok: input.ok,
    latencyMs: Math.max(0, input.latencyMs),
    stage: input.stage ?? "operation",
    ledgerHeight: input.ledgerHeight,
    errorCode: input.errorCode,
    error: input.error ? input.error.replaceAll(input.endpointUrl, redactProviderUrl(input.endpointUrl)) : undefined,
    hedged: input.hedged,
  };
}

export function computeTransportReliability(
  attempts: readonly TransportAttempt[],
  fallbackUsed: boolean,
): { reliability: number; confidence: number } {
  const failureCount = attempts.filter((a) => !a.ok).length;
  const rawReliability = 0.98 - failureCount * 0.15 - (fallbackUsed ? 0.08 : 0);
  const reliability = Math.max(0.05, Math.min(1.0, Math.round(rawReliability * 100) / 100));
  const confidence = Math.max(0.05, Math.min(1.0, Math.round((reliability - (failureCount > 0 ? 0.1 : 0)) * 100) / 100));

  return { reliability, confidence };
}
