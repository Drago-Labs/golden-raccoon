import {
  type CanonicalAssetId,
  type NormalizedObservation,
  type PegDefinition,
  type RawObservation,
  type ReferenceRate,
} from "@/server/research/peg-observations";

/**
 * Fixture providing canonical USDC on Ethereum.
 */
export const USDC_ETH_ID: CanonicalAssetId = {
  chainFamily: "evm",
  network: "ethereum",
  symbol: "USDC",
  addressOrIssuer: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
};

/**
 * Fixture providing canonical USDC on Base.
 */
export const USDC_BASE_ID: CanonicalAssetId = {
  chainFamily: "evm",
  network: "base",
  symbol: "USDC",
  addressOrIssuer: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
};

/**
 * Fixture providing Centre USDC on Stellar Pubnet.
 */
export const USDC_STELLAR_NATIVE_ID: CanonicalAssetId = {
  chainFamily: "stellar",
  network: "stellar-pubnet",
  symbol: "USDC",
  addressOrIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};

/**
 * Fixture providing alternative issuer USDC on Stellar Pubnet.
 */
export const USDC_STELLAR_ALT_ID: CanonicalAssetId = {
  chainFamily: "stellar",
  network: "stellar-pubnet",
  symbol: "USDC",
  addressOrIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
};

/**
 * Fixture providing canonical EURC on Ethereum.
 */
export const EURC_ETH_ID: CanonicalAssetId = {
  chainFamily: "evm",
  network: "ethereum",
  symbol: "EURC",
  addressOrIssuer: "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c",
};

/**
 * Fixture providing JPYC on Ethereum with non-unit 100.0 JPY peg target.
 */
export const JPYC_ETH_ID: CanonicalAssetId = {
  chainFamily: "evm",
  network: "ethereum",
  symbol: "JPYC",
  addressOrIssuer: "0x431d5dff03120afa4bdf332c61a6e1766ef37bdb",
};

/**
 * Fixture providing an unregistered custom asset ID.
 */
export const UNKNOWN_ASSET_ID: CanonicalAssetId = {
  chainFamily: "evm",
  network: "arbitrum",
  symbol: "MYSTERY",
  addressOrIssuer: "0x9999999999999999999999999999999999999999",
};

/**
 * Fixture providing explicit custom peg definition for an arbitrary asset.
 */
export const CUSTOM_PEG_DEFINITION: PegDefinition = {
  assetId: UNKNOWN_ASSET_ID,
  name: "Mystery Synthetic Dollar",
  referenceCurrency: "USD",
  declaredTargetValue: 1.0,
  provenance: "Test harness explicit peg declaration",
};

/**
 * Generates sample timestamp sequence relative to an origin base time.
 */
export function createTimestampSequence(baseTime: number, minuteIntervals: number[]): number[] {
  return minuteIntervals.map((mins) => baseTime + mins * 60_000);
}

/**
 * Generates sample observations containing duplicates and out-of-order points.
 */
export function createOutOfOrderWithDuplicates(baseTime: number): RawObservation[] {
  return [
    { timestamp: baseTime + 180_000, price: 0.998, currency: "USD", source: "dex" },
    { timestamp: baseTime + 60_000, price: 1.002, currency: "USD", source: "cex" },
    { timestamp: baseTime + 60_000, price: 1.004, currency: "USD", source: "aggregator" },
    { timestamp: baseTime, price: 1.0, currency: "USD", source: "direct" },
    { timestamp: baseTime + 120_000, price: 0.995, currency: "USD", source: "dex" },
  ];
}

/**
 * Generates sample observations with a persistent breach that recovers.
 */
export function createRecoveredBreachObservations(baseTime: number): NormalizedObservation[] {
  return [
    { timestamp: baseTime, rawPrice: 1.0, normalizedPrice: 1.0, referenceCurrency: "USD", deviationBps: 0, isGapBreach: false },
    { timestamp: baseTime + 60_000, rawPrice: 0.992, normalizedPrice: 0.992, referenceCurrency: "USD", deviationBps: -80, isGapBreach: false },
    { timestamp: baseTime + 120_000, rawPrice: 0.990, normalizedPrice: 0.990, referenceCurrency: "USD", deviationBps: -100, isGapBreach: false },
    { timestamp: baseTime + 180_000, rawPrice: 0.997, normalizedPrice: 0.997, referenceCurrency: "USD", deviationBps: -30, isGapBreach: false },
    { timestamp: baseTime + 240_000, rawPrice: 1.0, normalizedPrice: 1.0, referenceCurrency: "USD", deviationBps: 0, isGapBreach: false },
  ];
}

/**
 * Generates sample observations with a breach interrupted by an unobserved continuity gap.
 */
export function createGapInterruptedObservations(baseTime: number): NormalizedObservation[] {
  return [
    { timestamp: baseTime, rawPrice: 1.0, normalizedPrice: 1.0, referenceCurrency: "USD", deviationBps: 0, isGapBreach: false },
    { timestamp: baseTime + 60_000, rawPrice: 0.991, normalizedPrice: 0.991, referenceCurrency: "USD", deviationBps: -90, isGapBreach: false },
    { timestamp: baseTime + 120_000, rawPrice: 0.988, normalizedPrice: 0.988, referenceCurrency: "USD", deviationBps: -120, isGapBreach: false },
    { timestamp: baseTime + 7_200_000, rawPrice: 1.0, normalizedPrice: 1.0, referenceCurrency: "USD", deviationBps: 0, isGapBreach: false },
  ];
}

/**
 * Generates sample reference rates.
 */
export function createSampleReferenceRates(baseTime: number): ReferenceRate[] {
  return [
    { fromCurrency: "EUR", toCurrency: "USD", rate: 1.085, timestamp: baseTime, source: "ecb" },
    { fromCurrency: "JPY", toCurrency: "USD", rate: 0.0065, timestamp: baseTime, source: "boj" },
    { fromCurrency: "SGD", toCurrency: "USD", rate: 0.75, timestamp: baseTime, source: "mas" },
  ];
}
