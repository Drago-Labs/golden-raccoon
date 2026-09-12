/**
 * Fixtures for the shared-exposure map.
 *
 * Values are chosen so every expected total is an exact integer in micro-USD,
 * which is what lets the tests assert precise figures rather than approximate
 * ones. No fixture touches a network, a wallet, or a paid provider.
 */
import type { ExposureRequest } from "@/server/research/exposure-map/schema";

type Holding = ExposureRequest["holdings"][number];

export function holding(overrides: Partial<Holding> & Pick<Holding, "symbol" | "chainId" | "valueUsd">): Holding {
  return {
    balance: 1,
    priceUsd: overrides.valueUsd,
    priceStatus: "priced",
    ...overrides,
  };
}

const ISSUER_A = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const ISSUER_B = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

/**
 * Two distinct assets that share a documented issuer, plus a same-symbol asset
 * from a different issuer on a different chain that must stay separate.
 */
export const sharedIssuerMixedChain: ExposureRequest = {
  walletAddress: "GWALLET",
  network: "stellar-pubnet",
  holdings: [
    holding({ symbol: "USDC", chainId: "stellar-pubnet", issuer: ISSUER_A, valueUsd: 1_000 }),
    holding({ symbol: "EURC", chainId: "stellar-pubnet", issuer: ISSUER_A, valueUsd: 500 }),
    // Same symbol, different issuer: must never join the group above.
    holding({ symbol: "USDC", chainId: "stellar-pubnet", issuer: ISSUER_B, valueUsd: 250 }),
    // Same symbol again, different chain entirely.
    holding({ symbol: "USDC", chainId: "ethereum", contractId: "0xa0b8", valueUsd: 750 }),
  ],
  relationships: [
    {
      fromAssetKey: `USDC:${ISSUER_A}`,
      kind: "issuer",
      targetLabel: "Centre Consortium",
      provenance: "issuer_disclosure",
      observedAt: "2026-01-02T00:00:00.000Z",
    },
    {
      fromAssetKey: `EURC:${ISSUER_A}`,
      kind: "issuer",
      targetLabel: "Centre Consortium",
      provenance: "issuer_disclosure",
      observedAt: "2026-01-03T00:00:00.000Z",
    },
    {
      fromAssetKey: "0xa0b8",
      kind: "issuer",
      targetLabel: "Centre Consortium",
      targetNetwork: "ethereum",
      provenance: "issuer_disclosure",
      observedAt: "2026-01-04T00:00:00.000Z",
    },
  ],
  observedAt: "2026-01-05T00:00:00.000Z",
};

/**
 * A nested chain with a cycle and a duplicate edge. The cycle must terminate
 * and must not inflate any total.
 */
export const nestedCycleDoubleCounting: ExposureRequest = {
  walletAddress: "GWALLET",
  network: "stellar-pubnet",
  holdings: [holding({ symbol: "LPX", chainId: "stellar-pubnet", contractId: "CLPX", valueUsd: 400 })],
  relationships: [
    { fromAssetKey: "CLPX", kind: "protocol", targetLabel: "Alpha Pool", provenance: "protocol_documentation" },
    // Duplicate of the edge above.
    { fromAssetKey: "CLPX", kind: "protocol", targetLabel: "Alpha Pool", provenance: "protocol_documentation" },
    // Alpha Pool -> Beta Vault -> Alpha Pool closes a cycle.
    { fromAssetKey: "protocol:stellar-pubnet:alpha pool", kind: "protocol", targetLabel: "Beta Vault", provenance: "protocol_documentation" },
    { fromAssetKey: "protocol:stellar-pubnet:beta vault", kind: "protocol", targetLabel: "Alpha Pool", provenance: "protocol_documentation" },
  ],
  observedAt: "2026-01-05T00:00:00.000Z",
};

/** Mixed priced and unpriced holdings, one with no declared relationship. */
export const partialPricesUnresolved: ExposureRequest = {
  walletAddress: "GWALLET",
  network: "stellar-pubnet",
  holdings: [
    holding({ symbol: "USDC", chainId: "stellar-pubnet", issuer: ISSUER_A, valueUsd: 1_000 }),
    { symbol: "MYST", chainId: "stellar-pubnet", issuer: ISSUER_B, balance: 42, priceUsd: null, priceStatus: "unavailable", valueUsd: 0 },
    holding({ symbol: "LONE", chainId: "stellar-pubnet", contractId: "CLONE", valueUsd: 300 }),
  ],
  relationships: [
    { fromAssetKey: `USDC:${ISSUER_A}`, kind: "issuer", targetLabel: "Centre Consortium", provenance: "issuer_disclosure" },
    { fromAssetKey: `MYST:${ISSUER_B}`, kind: "issuer", targetLabel: "Mystery Labs", provenance: "operator_declared" },
  ],
  observedAt: "2026-01-05T00:00:00.000Z",
};

/** Valid, but the wallet holds nothing on this network. */
export const emptyPortfolio: ExposureRequest = {
  walletAddress: "GWALLET",
  network: "stellar-pubnet",
  holdings: [],
  relationships: [],
  observedAt: "2026-01-05T00:00:00.000Z",
};

/** A declaration addressed by bare symbol that matches two holdings. */
export const ambiguousDeclaration: ExposureRequest = {
  walletAddress: "GWALLET",
  network: "stellar-pubnet",
  holdings: [
    holding({ symbol: "USDC", chainId: "stellar-pubnet", issuer: ISSUER_A, valueUsd: 100 }),
    holding({ symbol: "USDC", chainId: "stellar-pubnet", issuer: ISSUER_B, valueUsd: 100 }),
  ],
  relationships: [
    { fromAssetKey: "USDC", kind: "issuer", targetLabel: "Guessed Issuer", provenance: "operator_declared" },
  ],
  observedAt: "2026-01-05T00:00:00.000Z",
};
