import { parseQuantity, parseUsd, quantityTimesPrice } from "./decimalMath";
import { AttributionError } from "./errors";
import { snapshotInputSchema, type PortfolioObservation, type SnapshotInput } from "./schema";

/** The identity a snapshot or flow must belong to. EVM hex is case-folded; Stellar StrKey is not. */
export function portfolioScope(walletAddress: string, network: string): string {
  return `${network.trim().toLowerCase()}:${/^0[xX]/.test(walletAddress) ? walletAddress.toLowerCase() : walletAddress.trim()}`;
}

/** How the transfer history names an asset: chain and symbol, lower-cased. */
export function assetAlias(chain: string, symbol: string): string {
  return `${chain.trim().toLowerCase()}:${symbol.trim().toLowerCase()}`;
}

/**
 * Normalizes one recorded portfolio observation into exact integer units.
 * A holding the provider could not price keeps a null value rather than a
 * zero, and the whole observation is then marked as not fully priced.
 */
export function normalizeObservation(input: unknown, scope: { walletAddress: string; network: string }): PortfolioObservation {
  const parsed = snapshotInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AttributionError("malformed_snapshot", "A recorded portfolio observation is malformed.", parsed.error.flatten());
  }
  const snapshot: SnapshotInput = parsed.data;
  if (portfolioScope(snapshot.walletAddress, snapshot.network) !== portfolioScope(scope.walletAddress, scope.network)) {
    throw new AttributionError("identity_mismatch", "A recorded observation belongs to another wallet or network.");
  }

  const seen = new Set<string>();
  let fullyPriced = true;
  const holdings = snapshot.holdings.map((holding) => {
    if (seen.has(holding.key)) {
      throw new AttributionError("malformed_snapshot", `Asset ${holding.key} appears twice in one observation.`);
    }
    seen.add(holding.key);
    const quantityUnits = parseQuantity(holding.quantity, `quantity of ${holding.key}`);
    if (quantityUnits < 0n) {
      throw new AttributionError("malformed_snapshot", `Asset ${holding.key} has a negative quantity.`);
    }
    const priceUsdUnits = holding.priceUsd === null ? null : parseUsd(holding.priceUsd, `price of ${holding.key}`);
    // A recorded value is kept as recorded; otherwise it is quantity × price.
    const valueUsdUnits =
      holding.valueUsd !== null
        ? parseUsd(holding.valueUsd, `value of ${holding.key}`)
        : priceUsdUnits === null
          ? null
          : quantityTimesPrice(quantityUnits, priceUsdUnits);
    if (valueUsdUnits === null || priceUsdUnits === null) fullyPriced = false;
    return {
      key: holding.key,
      alias: assetAlias(holding.chain, holding.symbol),
      symbol: holding.symbol,
      chain: holding.chain,
      quantityUnits,
      priceUsdUnits,
      valueUsdUnits,
    };
  });

  return {
    walletAddress: snapshot.walletAddress,
    network: snapshot.network,
    at: new Date(snapshot.at).toISOString(),
    source: snapshot.source,
    holdings,
    fullyPriced,
  };
}

/** Total observed value, or null when any holding was unpriced — a partial total would read as a loss. */
export function observationValue(observation: PortfolioObservation): bigint | null {
  if (!observation.fullyPriced) return null;
  let total = 0n;
  for (const holding of observation.holdings) {
    if (holding.valueUsdUnits === null) return null;
    total += holding.valueUsdUnits;
  }
  return total;
}
