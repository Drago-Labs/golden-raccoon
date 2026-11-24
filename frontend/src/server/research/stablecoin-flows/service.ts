import {
  findAsset,
  selectDeployments,
  type Deployment,
  type EvmDeployment,
  type StablecoinAsset,
  type StellarDeployment,
} from "./assetRegistry";
import { chainCoverage, reportNotes, reportState } from "./coverage";
import { aggregateDaily } from "./dailyAggregation";
import { StablecoinFlowError } from "./errors";
import { readEvmFlowEvents, type EvmReadResult } from "./evmEvents";
import { largestEvents } from "./largeEvents";
import { netIssuance, netIssuanceByChain } from "./netIssuance";
import { normalizeEvmEvent, normalizeStellarPayment, sortEvents } from "./normalization";
import { stablecoinFlowRequestSchema, type ChainReadResult, type FlowEvent, type StablecoinFlowResult } from "./schema";
import { readStellarFlowEvents, type StellarReadResult } from "./stellarEvents";
import { resolveWindow, withinWindow, type ResolvedWindow } from "./windowing";

export type StablecoinFlowDeps = {
  readEvm: (deployment: EvmDeployment, window: ResolvedWindow) => Promise<EvmReadResult>;
  readStellar: (deployment: StellarDeployment, window: ResolvedWindow) => Promise<StellarReadResult>;
};

const production: StablecoinFlowDeps = {
  readEvm: async (deployment, window) => {
    const { resolveEvmRpcUrl } = await import("@/lib/evm/config");
    return readEvmFlowEvents(resolveEvmRpcUrl(deployment.chain), deployment, window);
  },
  readStellar: async (deployment, window) =>
    readStellarFlowEvents(process.env.HORIZON_URL ?? "https://horizon.stellar.org", deployment, window),
};

/** Reads one deployment and reports a chain-level failure rather than failing the whole report. */
async function readChain(
  deployment: Deployment,
  asset: StablecoinAsset,
  window: ResolvedWindow,
  deps: StablecoinFlowDeps,
): Promise<ChainReadResult> {
  try {
    if (deployment.kind === "evm") {
      const read = await deps.readEvm(deployment, window);
      const events = read.events
        .map((raw) => normalizeEvmEvent(raw, deployment, asset))
        .filter((event) => withinWindow(event.at, window));
      return {
        chain: deployment.chain,
        events,
        truncated: read.truncated,
        rangeNote: read.coversWindowStart
          ? undefined
          : "The block range derived for this chain could not reach the start of the window, so its earliest days are missing.",
      };
    }
    const read = await deps.readStellar(deployment, window);
    const events = read.payments
      .map((payment) => normalizeStellarPayment(payment, deployment, asset))
      .filter((event): event is FlowEvent => event !== null)
      .filter((event) => withinWindow(event.at, window));
    return {
      chain: deployment.chain,
      events,
      truncated: read.truncated,
      rangeNote: read.reachedWindowStart
        ? undefined
        : "Horizon paging stopped before the start of the window, so this chain's earliest days are missing.",
    };
  } catch (error) {
    return {
      chain: deployment.chain,
      events: [],
      truncated: false,
      failure:
        error instanceof StablecoinFlowError
          ? error.message
          : `${deployment.chain} could not be read: ${error instanceof Error ? error.message : "unknown provider failure"}.`,
    };
  }
}

/**
 * Reads the configured mint and burn records of one stablecoin across the
 * requested chains, aggregates them by UTC day and chain, and states net
 * issuance, the largest single events and what the evidence does not cover.
 * Read-only: nothing here writes, signs or submits anything.
 */
export async function trackStablecoinFlows(
  input: unknown,
  deps: StablecoinFlowDeps = production,
): Promise<StablecoinFlowResult> {
  const parsed = stablecoinFlowRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new StablecoinFlowError("invalid_request", "The stablecoin-flow request is invalid.", parsed.error.flatten());
  }
  const request = parsed.data;
  const asset = findAsset(request.assetId);
  const deployments = selectDeployments(asset, request.chains);
  const window = resolveWindow(request.windowStart, request.windowEnd);

  const results: ChainReadResult[] = [];
  for (const deployment of deployments) {
    results.push(await readChain(deployment, asset, window, deps));
  }

  const coverage = chainCoverage(results, deployments);
  // A chain that could not be read contributes no row at all: a zero would
  // read as "nothing was issued there", which is not what was observed.
  const readable = results.filter((result) => !result.failure);
  const events = sortEvents(readable.flatMap((result) => result.events));
  const daily = aggregateDaily(
    events,
    readable.map((result) => result.chain),
    window,
    asset.canonicalDecimals,
  );
  const state = reportState(coverage);

  const report = {
    state,
    asset: { id: asset.id, symbol: asset.symbol, name: asset.name, canonicalDecimals: asset.canonicalDecimals },
    window: { start: window.start, end: window.end, days: window.days },
    daily,
    netIssuance: netIssuance(daily, asset.canonicalDecimals),
    netByChain: netIssuanceByChain(daily, asset.canonicalDecimals),
    largestEvents: largestEvents(events, request.topEvents),
    coverage,
    notes: reportNotes(coverage, events, window),
    readOnly: true as const,
  };

  if (state === "unavailable") {
    return {
      state: "unavailable",
      report,
      reason: "No configured chain could be read for this asset. No mint, burn or net issuance was inferred.",
    };
  }
  return { state: "ready", report };
}
