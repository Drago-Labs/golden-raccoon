import { buildHeadroomCoverage } from "./coverage";
import { ResourceHeadroomError, type ResourceHeadroomState } from "./errors";
import { computeResourceHeadroom } from "./headroom";
import {
  createDefaultHistoricalReader,
  type HistoricalUsageProvider,
} from "./historicalUsage";
import { validateInvocationInput } from "./invocationInput";
import { assertSameLimitNetwork, isSupportedHeadroomNetwork } from "./networkIdentity";
import {
  createDefaultNetworkLimitsReader,
  type NetworkLimitsProvider,
} from "./networkLimits";
import { resourceHeadroomRequestSchema, type ResourceHeadroomReport } from "./schema";
import {
  createDefaultSimulationReader,
  type SimulationProvider,
} from "./simulationReader";

export type ResourceHeadroomDeps = {
  simulationProvider?: SimulationProvider;
  historicalProvider?: HistoricalUsageProvider;
  limitsProvider?: NetworkLimitsProvider;
};

export async function compareResourceHeadroom(
  rawInput: unknown,
  deps: ResourceHeadroomDeps = {},
): Promise<ResourceHeadroomReport> {
  const parsed = resourceHeadroomRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ResourceHeadroomError("Invalid resource headroom request", "invalid_request", false);
  }
  const input = parsed.data;
  if (!isSupportedHeadroomNetwork(input.network)) {
    throw new ResourceHeadroomError(`Unsupported network: ${input.network}`, "unsupported_network", false);
  }
  validateInvocationInput(input);

  const simProvider = deps.simulationProvider ?? createDefaultSimulationReader();
  const histProvider = deps.historicalProvider ?? createDefaultHistoricalReader();
  const limitsProvider = deps.limitsProvider ?? createDefaultNetworkLimitsReader();

  let sample;
  let limitSet;
  try {
    [sample, limitSet] = await Promise.all([
      input.mode === "simulation"
        ? simProvider.simulateInvocation({
            contractId: input.contractId!,
            functionName: input.functionName!,
            args: input.args,
            network: input.network,
          })
        : histProvider.readHistoricalUsage({
            txHash: input.txHash!.toLowerCase(),
            network: input.network,
          }),
      limitsProvider.readNetworkLimits({ network: input.network }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Soroban RPC provider unavailable";
    return {
      network: input.network,
      mode: input.mode,
      state: "unavailable",
      warningThresholdPct: input.warningThresholdPct,
      invocationLedger: null,
      limitsLedger: null,
      simulationFailed: false,
      failureMessage: message,
      diagnosticEvents: [],
      resources: [],
      flaggedResources: [],
      coverage: buildHeadroomCoverage({
        reachedProvider: false,
        mode: input.mode,
        invocationLedger: null,
        limitsLedger: null,
        simulationFailed: false,
        message,
      }),
      warnings: [message],
    };
  }

  assertSameLimitNetwork(input.network, limitSet.network);
  assertSameLimitNetwork(input.network, sample.network);

  // When simulation fails, report the failure and its diagnostic events instead of zero usage
  if (sample.failed || !sample.metrics) {
    const failureMsg = sample.errorMessage ?? "Invocation simulation failed";
    return {
      network: input.network,
      mode: input.mode,
      state: "partial",
      warningThresholdPct: input.warningThresholdPct,
      invocationLedger: sample.ledger,
      limitsLedger: limitSet.ledger,
      simulationFailed: true,
      failureMessage: failureMsg,
      diagnosticEvents: sample.diagnosticEvents,
      resources: [],
      flaggedResources: [],
      coverage: buildHeadroomCoverage({
        reachedProvider: true,
        mode: input.mode,
        invocationLedger: sample.ledger,
        limitsLedger: limitSet.ledger,
        simulationFailed: true,
        message: "Simulation trapped; showing diagnostic events rather than zero usage.",
      }),
      warnings: [failureMsg],
    };
  }

  const resources = computeResourceHeadroom(
    sample.metrics,
    limitSet,
    input.warningThresholdPct,
  );
  const flaggedResources = resources.filter((r) => r.flagged);

  const warnings: string[] = [];
  for (const r of flaggedResources) {
    warnings.push(
      `${r.label} is at ${r.utilizationPct}% of the network limit (${r.fractionDisplay}).`,
    );
  }

  const state: ResourceHeadroomState = "complete";

  return {
    network: input.network,
    mode: input.mode,
    state,
    warningThresholdPct: input.warningThresholdPct,
    invocationLedger: sample.ledger,
    limitsLedger: limitSet.ledger,
    simulationFailed: false,
    failureMessage: null,
    diagnosticEvents: sample.diagnosticEvents,
    resources,
    flaggedResources,
    coverage: buildHeadroomCoverage({
      reachedProvider: true,
      mode: input.mode,
      invocationLedger: sample.ledger,
      limitsLedger: limitSet.ledger,
      simulationFailed: false,
      message: `Resource usage compared against ${input.network} limits at ledger ${limitSet.ledger}.`,
    }),
    warnings,
  };
}
