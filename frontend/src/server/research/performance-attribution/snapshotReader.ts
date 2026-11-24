import { normalizeObservation, portfolioScope } from "./portfolioInput";
import { AttributionError } from "./errors";
import { ATTRIBUTION_LIMITS } from "./limits";
import type { PortfolioObservation, SnapshotInput } from "./schema";

/** The live portfolio read API, injected so the service can be tested without a provider. */
export type LivePortfolioReader = (
  walletAddress: string,
  network: string,
) => Promise<{ snapshot: SnapshotInput; connected: boolean }>;

/**
 * Turns the portfolio read API's own snapshot shape into this feature's
 * recorded-observation shape. Storage is not touched: the snapshot is read and
 * normalized, never written.
 */
export function observationFromReadApi(raw: unknown, network: string, source: string): SnapshotInput {
  const row = raw as Record<string, unknown> | null;
  if (!row || typeof row.walletAddress !== "string" || typeof row.createdAt !== "string" || !Array.isArray(row.holdings)) {
    throw new AttributionError("malformed_snapshot", "The portfolio read API returned no wallet, time or holdings.");
  }
  const holdings = row.holdings.map((value) => {
    const holding = value as Record<string, unknown>;
    const address = typeof holding.tokenAddress === "string" ? holding.tokenAddress : "";
    const chain = typeof holding.chainId === "string" ? holding.chainId : network;
    const identity = address.startsWith("0x") ? address.toLowerCase() : address;
    if (!identity) throw new AttributionError("malformed_snapshot", "A holding has no asset identity.");
    const priced = typeof holding.priceUsd === "number" && Number.isFinite(holding.priceUsd) && holding.priceUsd > 0;
    const unpriced = holding.priceStatus === "unavailable" || !priced;
    return {
      key: `${chain}:${identity}${typeof holding.issuer === "string" ? `:${holding.issuer}` : ""}`,
      symbol: String(holding.symbol ?? identity).slice(0, 40),
      chain,
      quantity: typeof holding.balance === "number" && Number.isFinite(holding.balance) ? holding.balance.toFixed(18) : "0",
      priceUsd: unpriced ? null : (holding.priceUsd as number).toFixed(8),
      valueUsd:
        unpriced || typeof holding.valueUsd !== "number" || !Number.isFinite(holding.valueUsd)
          ? null
          : holding.valueUsd.toFixed(8),
    };
  });
  return { walletAddress: row.walletAddress, network, at: new Date(row.createdAt).toISOString(), source, holdings };
}

/**
 * The observations to attribute: the caller's recorded observations, plus the
 * live read when asked for, deduplicated by observation time and ordered
 * oldest first. Observations of another wallet or network are refused rather
 * than quietly dropped, so a mixed request can never produce a mixed report.
 */
export function collectObservations(
  recorded: unknown[],
  scope: { walletAddress: string; network: string },
  live?: SnapshotInput,
): PortfolioObservation[] {
  if (recorded.length > ATTRIBUTION_LIMITS.maxSnapshots) {
    throw new AttributionError("invalid_request", `At most ${ATTRIBUTION_LIMITS.maxSnapshots} observations may be supplied.`);
  }
  const byTime = new Map<string, PortfolioObservation>();
  for (const row of recorded) {
    const observation = normalizeObservation(row, scope);
    byTime.set(observation.at, observation);
  }
  if (live) {
    const observation = normalizeObservation(live, scope);
    byTime.set(observation.at, observation);
  }
  return [...byTime.values()].sort((left, right) => left.at.localeCompare(right.at));
}

export { portfolioScope };
