/**
 * Local adaptation of the shared portfolio holding contract.
 *
 * Each holding gets a network-scoped canonical key. Two holdings with the same
 * symbol produce the same key only when they also share a network *and* the
 * same issuer or contract — so `USDC` issued by two different accounts, or the
 * same code on two chains, stay separate throughout the map.
 */
import { EXPOSURE_LIMITS, toMicroUsd, type ExposureHoldingInput } from "./schema";

export type AdaptedHolding = {
  /** Canonical network-scoped key, also used as the graph node id. */
  id: string;
  symbol: string;
  label: string;
  network: string;
  issuer: string | null;
  contractId: string | null;
  /** `null` when the holding carries no usable price. */
  valueMicroUsd: number | null;
  priced: boolean;
  /** Every alias a relationship may use to address this holding. */
  aliases: string[];
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Builds the identity discriminator.
 *
 * An issuer alone is not an identity: one issuer commonly issues several
 * assets, so the classic Stellar identity is the code *and* the issuer
 * together. A contract or token address is already unique on its network. The
 * bare symbol is the last resort and is the only case where two different
 * assets could collide — which is why a symbol alone never creates a
 * relationship elsewhere in this feature.
 */
function discriminator(holding: ExposureHoldingInput): string {
  if (holding.issuer) return `classic:${normalize(holding.symbol)}:${normalize(holding.issuer)}`;
  if (holding.contractId) return `contract:${normalize(holding.contractId)}`;
  if (holding.tokenAddress) return `address:${normalize(holding.tokenAddress)}`;
  return `symbol:${normalize(holding.symbol)}`;
}

export function adaptHoldings(holdings: ExposureHoldingInput[]): AdaptedHolding[] {
  return holdings.map((holding) => {
    const network = normalize(holding.chainId);
    const id = `holding:${network}:${discriminator(holding)}`;
    const priced = holding.priceStatus !== "unavailable" && holding.priceUsd !== null;

    const aliases = new Set<string>([
      normalize(id),
      `${network}:${normalize(holding.symbol)}`,
      normalize(holding.symbol),
    ]);

    if (holding.issuer) {
      aliases.add(normalize(`${holding.symbol}:${holding.issuer}`));
      // A bare issuer address is kept as an alias on purpose: when an issuer
      // has issued several assets it resolves to all of them, and the resolver
      // rejects that declaration as ambiguous rather than guessing which one
      // was meant.
      aliases.add(normalize(holding.issuer));
    }
    if (holding.contractId) aliases.add(normalize(holding.contractId));
    if (holding.tokenAddress) aliases.add(normalize(holding.tokenAddress));

    return {
      id,
      symbol: holding.symbol,
      label: holding.name?.trim() || holding.symbol,
      network,
      issuer: holding.issuer ?? null,
      contractId: holding.contractId ?? holding.tokenAddress ?? null,
      valueMicroUsd: priced ? toMicroUsd(holding.valueUsd) : null,
      priced,
      aliases: [...aliases],
    };
  });
}

/** Sum of holdings that carry a usable price, in micro-USD. */
export function knownValueMicroUsd(holdings: AdaptedHolding[]): number {
  return holdings.reduce((sum, holding) => sum + (holding.valueMicroUsd ?? 0), 0);
}

/** Guards the traversal bound before any graph work begins. */
export function assertWithinBounds(holdings: AdaptedHolding[]): void {
  if (holdings.length > EXPOSURE_LIMITS.maxHoldings) {
    throw new RangeError(`Portfolio carries ${holdings.length} holdings, above the ${EXPOSURE_LIMITS.maxHoldings} bound.`);
  }
}
