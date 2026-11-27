import { INVOCATION_PROFILE_LIMITS } from "./limits";
import type { CoverageGap, RawInvocation } from "./schema";

export type InvocationReadResult =
  | {
      status: "available";
      invocations: RawInvocation[];
      priorCallerDays: Record<string, string[]>;
      coverageGaps: CoverageGap[];
      truncated: boolean;
    }
  | { status: "unavailable"; reason: string };

export type InvocationReader = (
  network: string,
  contractId: string,
  windowStart: number,
  windowEnd: number,
) => Promise<InvocationReadResult>;

/**
 * Default reader returns an empty available window.
 * Tests and demos inject fixture-backed readers.
 */
export async function readInvocations(
  _network: string,
  _contractId: string,
  _windowStart: number,
  _windowEnd: number,
): Promise<InvocationReadResult> {
  return {
    status: "available",
    invocations: [],
    priorCallerDays: {},
    coverageGaps: [],
    truncated: false,
  };
}

/** Cap and mark truncation when a provider returns more rows than allowed. */
export function applyInvocationLimit(invocations: RawInvocation[]): { invocations: RawInvocation[]; truncated: boolean } {
  if (invocations.length <= INVOCATION_PROFILE_LIMITS.maxInvocations) {
    return { invocations, truncated: false };
  }
  return {
    invocations: invocations.slice(0, INVOCATION_PROFILE_LIMITS.maxInvocations),
    truncated: true,
  };
}
