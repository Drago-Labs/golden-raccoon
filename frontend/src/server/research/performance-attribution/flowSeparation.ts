import { sum } from "./decimalMath";
import type { ExternalFlow } from "./schema";
import type { Period } from "./periods";

export type SeparatedFlows = {
  /** The flows that fall inside the period, oldest first. */
  flows: ExternalFlow[];
  /** Net external value per asset identity, in 10^-8 USD. */
  byAsset: Map<string, bigint>;
  /** Net external value per chain. */
  byChain: Map<string, bigint>;
  /** Net external value for the whole period. */
  total: bigint;
};

/**
 * Separates external flows from market movement for one period: value that
 * entered or left the portfolio is accounted for here, so the rest of the
 * change can be attributed to the market. A flow is never a return — deposits
 * do not become gains and withdrawals do not become losses.
 *
 * A flow exactly on a period boundary belongs to the period that starts there,
 * so no flow is counted twice and none is dropped between periods.
 */
export function separateFlows(period: Period, flows: ExternalFlow[]): SeparatedFlows {
  const startMs = Date.parse(period.start);
  const endMs = Date.parse(period.end);
  const inPeriod = flows
    .filter((flow) => {
      const at = Date.parse(flow.at);
      return Number.isFinite(at) && at >= startMs && at < endMs;
    })
    .sort((left, right) => left.at.localeCompare(right.at));

  const byAsset = new Map<string, bigint>();
  const byChain = new Map<string, bigint>();
  for (const flow of inPeriod) {
    byAsset.set(flow.key, (byAsset.get(flow.key) ?? 0n) + flow.valueUsdUnits);
    byChain.set(flow.chain, (byChain.get(flow.chain) ?? 0n) + flow.valueUsdUnits);
  }

  return { flows: inPeriod, byAsset, byChain, total: sum(inPeriod.map((flow) => flow.valueUsdUnits)) };
}

/** The last period of a window ends at the window's end, which is inclusive for flows. */
export function closingPeriod(period: Period, windowEnd: string): Period {
  return Date.parse(period.end) >= Date.parse(windowEnd)
    ? { ...period, end: new Date(Date.parse(windowEnd) + 1).toISOString() }
    : period;
}
