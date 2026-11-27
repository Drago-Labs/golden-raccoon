import { attributeCallers } from "./callerAttribution";
import { computeCallerCohorts } from "./cohorts";
import { aggregateByCaller, computeCallerConcentration } from "./concentration";
import { parseContractInput } from "./contractInput";
import { coverageNotice } from "./coverage";
import { buildDailySeries } from "./dailySeries";
import { InvocationProfileError } from "./errors";
import { aggregateByFunction } from "./functionAggregation";
import { applyInvocationLimit, readInvocations, type InvocationReader } from "./invocationReader";
import { INVOCATION_PROFILE_LIMITS } from "./limits";
import {
  INVOCATION_PROFILE_SCHEMA_VERSION,
  type InvocationProfileReport,
} from "./schema";

export type InvocationProfileDeps = {
  readInvocations: InvocationReader;
};

const productionDeps: InvocationProfileDeps = {
  readInvocations,
};

function unavailableReport(
  contractId: string,
  network: string,
  windowStart: number,
  windowEnd: number,
  reason: string,
): InvocationProfileReport {
  return {
    schemaVersion: INVOCATION_PROFILE_SCHEMA_VERSION,
    contractId,
    network,
    windowStart,
    windowEnd,
    state: "unavailable",
    functions: [],
    callers: [],
    daily: [],
    concentration: {
      callerCount: 0,
      totalInvocations: 0,
      topCallerShare: 0,
      topCallerAccount: null,
      herfindahl: 0,
    },
    cohorts: {
      newCallers: 0,
      returningCallers: 0,
      newCallerAccounts: [],
      returningCallerAccounts: [],
    },
    coverageGaps: [],
    coverageNotice: `Invocation profile unavailable: ${reason}`,
    sampledInvocationCount: 0,
    readOnly: true,
  };
}

export async function profileInvocations(
  input: unknown,
  deps: InvocationProfileDeps = productionDeps,
): Promise<InvocationProfileReport> {
  const validated = parseContractInput(input);
  const { contractId, network, windowStart, windowEnd } = validated;

  const started = Date.now();
  const result = await deps.readInvocations(network, contractId, windowStart, windowEnd);
  if (Date.now() - started > INVOCATION_PROFILE_LIMITS.timeoutMs) {
    throw new InvocationProfileError("timeout", "Invocation profile timed out");
  }

  if (result.status === "unavailable") {
    return unavailableReport(contractId, network, windowStart, windowEnd, result.reason);
  }

  const limited = applyInvocationLimit(result.invocations);
  const attributed = attributeCallers(limited.invocations);
  const functions = aggregateByFunction(attributed).slice(0, INVOCATION_PROFILE_LIMITS.maxFunctions);
  const callers = aggregateByCaller(attributed).slice(0, INVOCATION_PROFILE_LIMITS.maxCallers);
  const daily = buildDailySeries(attributed).slice(0, INVOCATION_PROFILE_LIMITS.maxDailyPoints);
  const concentration = computeCallerConcentration(attributed);
  const cohorts = computeCallerCohorts(attributed, result.priorCallerDays);
  const coverageGaps = [...result.coverageGaps];
  if (limited.truncated) {
    coverageGaps.push({
      fromLedger: windowStart,
      toLedger: windowEnd,
      reason: "truncated",
    });
  }

  const state = coverageGaps.length > 0 || limited.truncated ? "partial" : "complete";

  return {
    schemaVersion: INVOCATION_PROFILE_SCHEMA_VERSION,
    contractId,
    network,
    windowStart,
    windowEnd,
    state,
    functions,
    callers,
    daily,
    concentration,
    cohorts,
    coverageGaps,
    coverageNotice: coverageNotice(state, coverageGaps, attributed.length, limited.truncated || result.truncated),
    sampledInvocationCount: attributed.length,
    readOnly: true,
  };
}
