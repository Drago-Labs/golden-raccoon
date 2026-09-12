import {
  type CanonicalAssetId,
  type PegDefinition,
} from "./schema";

export const CANONICAL_PEG_DEFINITIONS: PegDefinition[] = [
  {
    assetId: {
      chainFamily: "evm",
      network: "ethereum",
      symbol: "USDC",
      addressOrIssuer: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    },
    name: "USD Coin (Ethereum Native)",
    referenceCurrency: "USD",
    declaredTargetValue: 1.0,
    source: "canonical",
    provenance: "Circle Official Verified Smart Contract (Ethereum)",
    toleranceBps: 50,
    maxGapIntervalMs: 3_600_000,
  },
  {
    assetId: {
      chainFamily: "evm",
      network: "base",
      symbol: "USDC",
      addressOrIssuer: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    },
    name: "USD Coin (Base Native)",
    referenceCurrency: "USD",
    declaredTargetValue: 1.0,
    source: "canonical",
    provenance: "Circle Official Verified Smart Contract (Base)",
    toleranceBps: 50,
    maxGapIntervalMs: 3_600_000,
  },
  {
    assetId: {
      chainFamily: "stellar",
      network: "stellar-pubnet",
      symbol: "USDC",
      addressOrIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    },
    name: "USD Coin (Stellar Centre Native)",
    referenceCurrency: "USD",
    declaredTargetValue: 1.0,
    source: "canonical",
    provenance: "Centre / Circle Stellar Native Anchor",
    toleranceBps: 50,
    maxGapIntervalMs: 3_600_000,
  },
  {
    assetId: {
      chainFamily: "stellar",
      network: "stellar-pubnet",
      symbol: "USDC",
      addressOrIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    },
    name: "USD Coin (Alternative Stellar Issuer)",
    referenceCurrency: "USD",
    declaredTargetValue: 1.0,
    source: "canonical",
    provenance: "Alternative Gateway Issuer Anchor",
    toleranceBps: 50,
    maxGapIntervalMs: 3_600_000,
  },
  {
    assetId: {
      chainFamily: "evm",
      network: "ethereum",
      symbol: "EURC",
      addressOrIssuer: "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c",
    },
    name: "Euro Coin (Ethereum)",
    referenceCurrency: "EUR",
    declaredTargetValue: 1.0,
    source: "canonical",
    provenance: "Circle Official Verified EURC Smart Contract",
    toleranceBps: 50,
    maxGapIntervalMs: 3_600_000,
  },
  {
    assetId: {
      chainFamily: "stellar",
      network: "stellar-pubnet",
      symbol: "EURC",
      addressOrIssuer: "GDTVV5XCLBT27BDTX2F5C25J2R25227XJ7K25K25K25K25K25K25K25K",
    },
    name: "Euro Coin (Stellar)",
    referenceCurrency: "EUR",
    declaredTargetValue: 1.0,
    source: "canonical",
    provenance: "Circle Official Stellar Euro Anchor",
    toleranceBps: 50,
    maxGapIntervalMs: 3_600_000,
  },
  {
    assetId: {
      chainFamily: "evm",
      network: "ethereum",
      symbol: "XSGD",
      addressOrIssuer: "0x70e8de73ce538da2beed35d14187f6959a8eca96",
    },
    name: "StraitsX Singapore Dollar",
    referenceCurrency: "SGD",
    declaredTargetValue: 1.0,
    source: "canonical",
    provenance: "StraitsX Official Smart Contract",
    toleranceBps: 50,
    maxGapIntervalMs: 3_600_000,
  },
  {
    assetId: {
      chainFamily: "evm",
      network: "ethereum",
      symbol: "JPYC",
      addressOrIssuer: "0x431d5dff03120afa4bdf332c61a6e1766ef37bdb",
    },
    name: "JPY Coin (100 JPY Basket)",
    referenceCurrency: "JPY",
    declaredTargetValue: 100.0,
    source: "canonical",
    provenance: "JPYC Official Smart Contract - 100 Unit Target",
    toleranceBps: 75,
    maxGapIntervalMs: 3_600_000,
  },
  {
    assetId: {
      chainFamily: "evm",
      network: "ethereum",
      symbol: "USDT",
      addressOrIssuer: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    },
    name: "Tether USD (Ethereum)",
    referenceCurrency: "USD",
    declaredTargetValue: 1.0,
    source: "canonical",
    provenance: "Tether Official Verified Smart Contract",
    toleranceBps: 50,
    maxGapIntervalMs: 3_600_000,
  },
  {
    assetId: {
      chainFamily: "evm",
      network: "ethereum",
      symbol: "DAI",
      addressOrIssuer: "0x6b175474e89094c44da98b954eedeac495271d0f",
    },
    name: "Dai Stablecoin (Ethereum)",
    referenceCurrency: "USD",
    declaredTargetValue: 1.0,
    source: "canonical",
    provenance: "MakerDAO / Sky Protocol Verified Smart Contract",
    toleranceBps: 50,
    maxGapIntervalMs: 3_600_000,
  },
];

/**
 * Normalizes an asset identifier for deterministic comparison across chain and network standards.
 */
export function normalizeAssetKey(assetId: CanonicalAssetId): string {
  return [
    assetId.chainFamily.toLowerCase(),
    assetId.network.toLowerCase(),
    assetId.symbol.toUpperCase(),
    assetId.addressOrIssuer.toLowerCase(),
  ].join(":");
}

/**
 * Retrieves a canonical peg definition matching the given canonical asset identifier.
 */
export function getCanonicalPegDefinition(assetId: CanonicalAssetId): PegDefinition | undefined {
  const targetKey = normalizeAssetKey(assetId);
  return CANONICAL_PEG_DEFINITIONS.find((def) => normalizeAssetKey(def.assetId) === targetKey);
}

/**
 * Resolves a peg definition for the given asset.
 * If the asset is canonical, returns the registered configuration.
 * If the asset is unknown, requires an explicit custom definition with reference currency and declared target value.
 */
export function resolvePegDefinition(
  assetId: CanonicalAssetId,
  custom?: Partial<PegDefinition>,
): PegDefinition {
  const canonical = getCanonicalPegDefinition(assetId);
  if (canonical) {
    if (custom) {
      return {
        ...canonical,
        ...custom,
        assetId: canonical.assetId,
        source: "canonical",
        provenance: custom.provenance || canonical.provenance,
      };
    }
    return canonical;
  }

  if (!custom || !custom.referenceCurrency || !custom.declaredTargetValue) {
    throw new Error(
      `Explicit peg definition required for unknown asset: ${assetId.symbol} on ${assetId.network} (${assetId.addressOrIssuer}). Please specify reference currency and declared target value.`,
    );
  }

  return {
    assetId: {
      chainFamily: assetId.chainFamily,
      network: assetId.network.trim().toLowerCase(),
      symbol: assetId.symbol.trim().toUpperCase(),
      addressOrIssuer: assetId.addressOrIssuer.trim().toLowerCase(),
    },
    name: custom.name || `${assetId.symbol} (User Declared)`,
    referenceCurrency: custom.referenceCurrency.trim().toUpperCase(),
    declaredTargetValue: custom.declaredTargetValue,
    source: "user_declared",
    provenance: custom.provenance || "User provided explicit reference target",
    toleranceBps: custom.toleranceBps ?? 50,
    maxGapIntervalMs: custom.maxGapIntervalMs ?? 3_600_000,
  };
}

/**
 * Lists all known canonical peg definitions.
 */
export function listKnownPegDefinitions(): PegDefinition[] {
  return [...CANONICAL_PEG_DEFINITIONS];
}
