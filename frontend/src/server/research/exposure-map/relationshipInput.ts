import type { RelationshipDeclaration } from "./schema";
import { RelationshipDeclarationSchema } from "./schema";

const CURATED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

/**
 * Built-in curated relationship registry with provenance metadata.
 */
export const CURATED_RELATIONSHIPS: RelationshipDeclaration[] = [
  {
    sourceAssetKey: "ethereum:evm:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    targetType: "issuer",
    targetId: "issuer:circle",
    targetName: "Circle",
    relationship: "issued_by",
    weight: 1.0,
    category: "stablecoin_issuer",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
      referenceUri: "https://www.circle.com/en/usdc",
    },
  },
  {
    sourceAssetKey: "base:evm:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    targetType: "issuer",
    targetId: "issuer:circle",
    targetName: "Circle",
    relationship: "issued_by",
    weight: 1.0,
    category: "stablecoin_issuer",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
      referenceUri: "https://www.circle.com/en/usdc",
    },
  },
  {
    sourceAssetKey: "arbitrum:evm:0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    targetType: "issuer",
    targetId: "issuer:circle",
    targetName: "Circle",
    relationship: "issued_by",
    weight: 1.0,
    category: "stablecoin_issuer",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
      referenceUri: "https://www.circle.com/en/usdc",
    },
  },
  {
    sourceAssetKey: "stellar-pubnet:stellar:classic:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    targetType: "issuer",
    targetId: "issuer:circle",
    targetName: "Circle",
    relationship: "issued_by",
    weight: 1.0,
    category: "stablecoin_issuer",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
      referenceUri: "https://www.circle.com/en/usdc",
    },
  },
  {
    sourceAssetKey: "stellar-pubnet:stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    targetType: "issuer",
    targetId: "issuer:circle",
    targetName: "Circle",
    relationship: "issued_by",
    weight: 1.0,
    category: "stablecoin_issuer",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
      referenceUri: "https://www.circle.com/en/usdc",
    },
  },
  {
    sourceAssetKey: "stellar-testnet:stellar:classic:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    targetType: "issuer",
    targetId: "issuer:circle",
    targetName: "Circle",
    relationship: "issued_by",
    weight: 1.0,
    category: "stablecoin_issuer",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
      referenceUri: "https://www.circle.com/en/usdc",
    },
  },
  {
    sourceAssetKey: "ethereum:evm:0xdac17f958d2ee523a2206206994597c13d831ec7",
    targetType: "issuer",
    targetId: "issuer:tether",
    targetName: "Tether",
    relationship: "issued_by",
    weight: 1.0,
    category: "stablecoin_issuer",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
      referenceUri: "https://tether.to",
    },
  },
  {
    sourceAssetKey: "ethereum:evm:0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
    targetType: "protocol",
    targetId: "protocol:lido",
    targetName: "Lido",
    relationship: "managed_by",
    weight: 1.0,
    category: "liquid_staking",
    provenance: {
      source: "curated_registry",
      confidence: 0.98,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
    },
  },
  {
    sourceAssetKey: "ethereum:evm:0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
    targetType: "underlying",
    targetId: "underlying:eth",
    targetName: "ETH (Native)",
    relationship: "backed_by",
    weight: 1.0,
    category: "underlying_asset",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
    },
  },
  {
    sourceAssetKey: "ethereum:evm:0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
    targetType: "protocol",
    targetId: "protocol:lido",
    targetName: "Lido",
    relationship: "managed_by",
    weight: 1.0,
    category: "liquid_staking",
    provenance: {
      source: "curated_registry",
      confidence: 0.98,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
    },
  },
  {
    sourceAssetKey: "ethereum:evm:0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
    targetType: "underlying",
    targetId: "underlying:steth",
    targetName: "stETH",
    relationship: "backed_by",
    weight: 1.0,
    category: "liquid_staking",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
    },
  },
  {
    sourceAssetKey: "underlying:steth",
    targetType: "underlying",
    targetId: "underlying:eth",
    targetName: "ETH (Native)",
    relationship: "derives_from",
    weight: 1.0,
    category: "underlying_asset",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
    },
  },
  {
    sourceAssetKey: "ethereum:evm:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    targetType: "issuer",
    targetId: "issuer:bitgo",
    targetName: "BitGo",
    relationship: "issued_by",
    weight: 1.0,
    category: "custodian_issuer",
    provenance: {
      source: "curated_registry",
      confidence: 0.95,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
    },
  },
  {
    sourceAssetKey: "ethereum:evm:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    targetType: "underlying",
    targetId: "underlying:btc",
    targetName: "Bitcoin (Native)",
    relationship: "backed_by",
    weight: 1.0,
    category: "underlying_asset",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
    },
  },
  {
    sourceAssetKey: "stellar-pubnet:stellar:native",
    targetType: "issuer",
    targetId: "issuer:stellar-network",
    targetName: "Stellar Network",
    relationship: "issued_by",
    weight: 1.0,
    category: "layer1_network",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
    },
  },
  {
    sourceAssetKey: "stellar-testnet:stellar:native",
    targetType: "issuer",
    targetId: "issuer:stellar-network",
    targetName: "Stellar Network",
    relationship: "issued_by",
    weight: 1.0,
    category: "layer1_network",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
    },
  },
  {
    sourceAssetKey: "ethereum:evm:native",
    targetType: "issuer",
    targetId: "issuer:ethereum-network",
    targetName: "Ethereum Network",
    relationship: "issued_by",
    weight: 1.0,
    category: "layer1_network",
    provenance: {
      source: "curated_registry",
      confidence: 1.0,
      declaredAt: CURATED_TIMESTAMP,
      verified: true,
    },
  },
];

/**
 * Validates, bounds, and normalizes relationship declarations from curated and custom inputs.
 */
export function normalizeRelationships(
  customDeclarations: RelationshipDeclaration[] = [],
  maxDeclarations = 200
): RelationshipDeclaration[] {
  const combined = [...CURATED_RELATIONSHIPS];

  for (const item of customDeclarations) {
    const parseResult = RelationshipDeclarationSchema.safeParse(item);
    if (parseResult.success) {
      combined.push(parseResult.data);
    }
  }

  const bounded = combined.slice(0, maxDeclarations);
  const seenKeys = new Set<string>();
  const deduped: RelationshipDeclaration[] = [];

  for (const rel of bounded) {
    const uniqueKey = `${rel.sourceAssetKey}->${rel.targetId}:${rel.relationship}`;
    if (!seenKeys.has(uniqueKey)) {
      seenKeys.add(uniqueKey);
      deduped.push({
        ...rel,
        weight: Math.max(0.0001, Math.min(1.0, rel.weight)),
      });
    }
  }

  return deduped;
}
