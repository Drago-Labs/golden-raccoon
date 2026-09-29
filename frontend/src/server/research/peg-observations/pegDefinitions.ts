/**
 * Peg definitions and canonical asset identity.
 *
 * The feature's central refusal lives here: there is no default target. An
 * asset with no declared peg is not analysed against one dollar, or against
 * anything else — it is listed as undefined and left alone.
 */
import { PEG_LIMITS, type PegAssetIdentity, type PegAssetInput, type PegDefinition, type PegDefinitionInput } from "./schema";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function assetIdentity(asset: PegAssetInput): PegAssetIdentity {
  const chainId = asset.chainId.trim();
  const family = chainId.toLowerCase().startsWith("stellar") ? "stellar" : "evm";

  // Issuer wins over contract address, and the bare symbol is the last resort.
  // Two assets sharing a symbol but issued by different accounts must never
  // collapse onto one definition.
  const discriminator = asset.issuer
    ? `issuer:${normalize(asset.issuer)}`
    : asset.contractAddress
      ? `contract:${normalize(asset.contractAddress)}`
      : `symbol:${normalize(asset.symbol)}`;

  return {
    chainId,
    family,
    symbol: asset.symbol.trim(),
    issuer: asset.issuer?.trim(),
    contractAddress: asset.contractAddress?.trim(),
    identityKey: `${normalize(chainId)}|${normalize(asset.symbol)}|${discriminator}`,
  };
}

export function buildDefinition(input: PegDefinitionInput): PegDefinition {
  const asset = assetIdentity(input.asset);

  return {
    asset,
    referenceCurrency: input.referenceCurrency.trim().toUpperCase(),
    targetValue: input.targetValue.trim(),
    provenance: input.provenance,
    declaredAt: input.declaredAt ?? null,
    note: `Target of ${input.targetValue} ${input.referenceCurrency.trim().toUpperCase()} per unit, declared via ${input.provenance.replace(/_/g, " ")}. This target is taken from the declaration, not assumed from the asset's symbol.`,
  };
}

/** Indexes declarations by canonical identity key. */
export function indexDefinitions(inputs: PegDefinitionInput[]): Map<string, PegDefinition> {
  const index = new Map<string, PegDefinition>();

  for (const input of inputs) {
    const definition = buildDefinition(input);

    // A second declaration for the same asset is ambiguous rather than a
    // refinement, so the first one wins and the collision stays visible in the
    // count of definitions the caller supplied.
    if (!index.has(definition.asset.identityKey)) {
      index.set(definition.asset.identityKey, definition);
    }
  }

  return index;
}

export function assertWithinBounds(seriesCount: number): void {
  if (seriesCount > PEG_LIMITS.maxAssets) {
    throw new RangeError(`Request carries ${seriesCount} assets, above the ${PEG_LIMITS.maxAssets} bound.`);
  }
}
