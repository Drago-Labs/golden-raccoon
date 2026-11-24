import { attributeAssets, formatAssetContributions, marketTotal } from "./assetAttribution";
import { attributeChains } from "./chainAttribution";
import { periodNotes, reportCoverage } from "./coverage";
import { formatUsd } from "./decimalMath";
import { AttributionError } from "./errors";
import { readExternalFlows, type TransactionHistoryReader } from "./flowReader";
import { closingPeriod, separateFlows } from "./flowSeparation";
import { boundObservations, buildPeriods, resolveWindow } from "./periods";
import { observationValue } from "./portfolioInput";
import { collectObservations, observationFromReadApi } from "./snapshotReader";
import {
  attributionRequestSchema,
  type AttributionReport,
  type AttributionResult,
  type ExternalFlow,
  type PeriodAttribution,
  type SnapshotInput,
} from "./schema";

export type AttributionDeps = {
  readHistory: TransactionHistoryReader;
  /** Reads the live portfolio for the end of the window; only called when asked for. */
  readLivePortfolio?: (walletAddress: string, network: string) => Promise<SnapshotInput>;
};

const production: AttributionDeps = {
  readHistory: async ({ walletAddress, cursor, limit }) => {
    const { listTransactionRecordsPaginated } = await import("@/server/storage");
    const page = listTransactionRecordsPaginated(walletAddress, { cursor, limit });
    return { items: page.items as unknown as Array<Record<string, unknown>>, nextCursor: page.nextCursor ?? null };
  },
  readLivePortfolio: async (walletAddress, network) => {
    const { getPortfolioSnapshot } = await import("@/server/portfolio/getPortfolio");
    const result = await getPortfolioSnapshot(walletAddress, network);
    if (result.source.status !== "connected") {
      throw new AttributionError("provider_unavailable", "The portfolio read API returned no usable portfolio.");
    }
    return observationFromReadApi(result.portfolio, network, "Live portfolio read API");
  },
};

/**
 * Attributes a portfolio's change in value to assets, chains and periods,
 * separating external flows from market movement. Read-only: observations and
 * transfer history are read through the existing read APIs and nothing is
 * written back.
 */
export async function attributePerformance(input: unknown, deps: AttributionDeps = production): Promise<AttributionResult> {
  const parsed = attributionRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AttributionError("invalid_request", "The attribution request is invalid.", parsed.error.flatten());
  }
  const request = parsed.data;
  const scope = { walletAddress: request.walletAddress, network: request.network };
  const window = resolveWindow(request.windowStart, request.windowEnd);
  const periods = buildPeriods(window, request.granularity);

  let live: SnapshotInput | undefined;
  const liveNotes: string[] = [];
  if (request.includeLiveSnapshot) {
    if (!deps.readLivePortfolio) {
      throw new AttributionError("provider_unavailable", "No live portfolio reader is configured.");
    }
    try {
      live = await deps.readLivePortfolio(request.walletAddress, request.network);
    } catch (error) {
      liveNotes.push(
        `The live portfolio could not be read, so only the recorded observations were used: ${error instanceof Error ? error.message : "unknown provider failure"}`,
      );
    }
  }

  const observations = collectObservations(request.snapshots, scope, live);

  let flows: ExternalFlow[] = [];
  let truncated = false;
  const flowNotes: string[] = [];
  try {
    const read = await readExternalFlows(deps.readHistory, scope, window);
    flows = read.flows;
    truncated = read.truncated;
  } catch (error) {
    flowNotes.push(
      `External flows could not be read, so no period is attributed: ${error instanceof Error ? error.message : "unknown provider failure"}`,
    );
  }

  const attributedUnits: Array<{ period: PeriodAttribution; units: PeriodUnits }> = periods.map((period) => {
    const bounds = boundObservations(period, observations);
    const separated = separateFlows(closingPeriod(period, window.end), flows);

    if (flowNotes.length || !bounds.start || !bounds.end) {
      const { state, notes } = flowNotes.length
        ? { state: "unavailable" as const, notes: flowNotes }
        : periodNotes(bounds.start, bounds.end, false);
      return {
        period: {
          start: period.start,
          end: period.end,
          label: period.label,
          state,
          startObservedAt: bounds.start?.at ?? null,
          endObservedAt: bounds.end?.at ?? null,
          startValueUsd: null,
          endValueUsd: null,
          changeUsd: null,
          externalFlowUsd: formatUsd(separated.total),
          marketUsd: null,
          priceEffectUsd: null,
          residualUsd: null,
          assets: [],
          chains: [],
          flowCount: separated.flows.length,
          notes,
        },
        units: { change: null, flow: separated.total, market: null, priceEffect: null, residual: null },
      };
    }

    const rows = attributeAssets(bounds.start, bounds.end, separated.byAsset);
    const market = marketTotal(rows);
    const assets = formatAssetContributions(rows, market);
    const splitKnown = rows.every((row) => row.priceEffect !== null && row.residual !== null);
    const { state, notes } = periodNotes(bounds.start, bounds.end, assets.some((asset) => asset.state === "partial"));
    const startValue = observationValue(bounds.start);
    const endValue = observationValue(bounds.end);

    const change = startValue === null || endValue === null ? null : endValue - startValue;
    const priceEffect = splitKnown ? rows.reduce((total, row) => total + (row.priceEffect as bigint), 0n) : null;
    const residual = splitKnown && market !== null ? rows.reduce((total, row) => total + (row.residual as bigint), 0n) : null;

    return {
      period: {
        start: period.start,
        end: period.end,
        label: period.label,
        state,
        startObservedAt: bounds.start.at,
        endObservedAt: bounds.end.at,
        startValueUsd: startValue === null ? null : formatUsd(startValue),
        endValueUsd: endValue === null ? null : formatUsd(endValue),
        changeUsd: change === null ? null : formatUsd(change),
        externalFlowUsd: formatUsd(separated.total),
        marketUsd: market === null ? null : formatUsd(market),
        priceEffectUsd: priceEffect === null ? null : formatUsd(priceEffect),
        residualUsd: residual === null ? null : formatUsd(residual),
        assets,
        chains: attributeChains(rows, market),
        flowCount: separated.flows.length,
        notes,
      },
      units: { change, flow: separated.total, market, priceEffect, residual },
    };
  });

  const attributed: PeriodAttribution[] = attributedUnits.map((row) => row.period);

  const usable = attributedUnits.filter((row) => row.period.state !== "unavailable");
  const totals = sumPeriods(usable.map((row) => row.units), usable.length, attributed.length - usable.length);
  const state: AttributionReport["state"] = !usable.length
    ? "unavailable"
    : attributed.some((period) => period.state !== "complete")
      ? "partial"
      : "complete";

  const report: AttributionReport = {
    state,
    portfolio: scope,
    window: { start: window.start, end: window.end, granularity: request.granularity },
    periods: attributed,
    totals,
    coverage: [...reportCoverage(attributed, observations, { count: flows.length, truncated }), ...liveNotes],
    readOnly: true,
  };

  if (state === "unavailable") {
    return {
      state: "unavailable",
      report,
      reason: flowNotes[0] ?? "No period in this window has the recorded observations needed to attribute it. Nothing was estimated.",
    };
  }
  return { state: "ready", report };
}

type PeriodUnits = {
  change: bigint | null;
  flow: bigint;
  market: bigint | null;
  priceEffect: bigint | null;
  residual: bigint | null;
};

/**
 * Totals across the periods that could be attributed, in exact integer units.
 * A total is only stated when every attributed period could state its part;
 * otherwise it is null rather than a sum of the periods that happened to work.
 */
function sumPeriods(units: PeriodUnits[], attributedPeriods: number, unavailablePeriods: number): AttributionReport["totals"] {
  // With no attributed period there is nothing to total: a zero would read as
  // "nothing happened", which is not what was observed.
  if (!units.length) {
    return {
      changeUsd: null,
      externalFlowUsd: "0",
      marketUsd: null,
      priceEffectUsd: null,
      residualUsd: null,
      attributedPeriods,
      unavailablePeriods,
    };
  }
  const total = (pick: (row: PeriodUnits) => bigint | null): bigint | null => {
    let sum = 0n;
    for (const row of units) {
      const value = pick(row);
      if (value === null) return null;
      sum += value;
    }
    return sum;
  };
  const format = (value: bigint | null) => (value === null ? null : formatUsd(value));

  return {
    changeUsd: format(total((row) => row.change)),
    externalFlowUsd: formatUsd(total((row) => row.flow) ?? 0n),
    marketUsd: format(total((row) => row.market)),
    priceEffectUsd: format(total((row) => row.priceEffect)),
    residualUsd: format(total((row) => row.residual)),
    attributedPeriods,
    unavailablePeriods,
  };
}
