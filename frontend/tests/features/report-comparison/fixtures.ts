import type { RiskSnapshotDocument, RiskSnapshotRecord } from "@/server/snapshots/schema";
import { canonicalAssetIdentity, hashRiskSnapshot } from "@/server/snapshots/canonical";

export const FIXTURE_BASE_TIME = "2026-07-06T12:00:00.000Z";
export const FIXTURE_TARGET_TIME = "2026-07-06T14:30:00.000Z";
export const FIXTURE_EXPIRES_TIME = "2027-01-01T00:00:00.000Z";
export const FIXTURE_STALE_TIME = "2026-07-07T00:00:00.000Z";

export const mockBaseSnapshotDoc: RiskSnapshotDocument = {
  schemaVersion: "1",
  asset: {
    chainFamily: "stellar",
    network: "testnet",
    symbol: "USDC",
    name: "USD Coin",
    identity: {
      kind: "stellar_classic",
      canonicalId: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      assetCode: "USDC",
      issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    },
  },
  scores: {
    buyRisk: 42,
    confidence: 0.85,
  },
  verdict: "manual_review",
  summary: "Baseline liquidity and authority analysis.",
  topReasons: [
    "[authority] Freeze authority: revocable (impact: 10)",
    "[liquidity] DEX liquidity pool: depth $250k (impact: 20)",
    "[verification] Contract source: verified on Horizon",
  ],
  evidence: [
    {
      label: "Horizon RPC",
      status: "connected",
      checkedAt: FIXTURE_BASE_TIME,
      reliability: 0.95,
    },
    {
      label: "Reflector Oracle",
      status: "connected",
      checkedAt: FIXTURE_BASE_TIME,
      reliability: 0.9,
    },
  ],
  missingData: [
    {
      field: "historical_wash_volume",
      impact: "low",
    },
  ],
  freshness: {
    generatedAt: FIXTURE_BASE_TIME,
    sourceCheckedAt: [FIXTURE_BASE_TIME],
    staleAt: FIXTURE_STALE_TIME,
  },
  expiresAt: FIXTURE_EXPIRES_TIME,
  product: {
    name: "Golden Raccoon",
    version: "0.1.0",
  },
  notices: {
    informationOnly: true,
    providerCorrectnessNotProven: true,
  },
};

export const mockReorderedEquivalentSnapshotDoc: RiskSnapshotDocument = {
  ...mockBaseSnapshotDoc,
  topReasons: [
    "[verification] Contract source: verified on Horizon",
    "[liquidity] DEX liquidity pool: depth $250k (impact: 20)",
    "[authority] Freeze authority: revocable (impact: 10)",
  ],
  evidence: [
    {
      label: "Reflector Oracle",
      status: "connected",
      checkedAt: FIXTURE_BASE_TIME,
      reliability: 0.9,
    },
    {
      label: "Horizon RPC",
      status: "connected",
      checkedAt: FIXTURE_BASE_TIME,
      reliability: 0.95,
    },
  ],
};

export const mockTargetSnapshotDoc: RiskSnapshotDocument = {
  schemaVersion: "1",
  asset: {
    chainFamily: "stellar",
    network: "testnet",
    symbol: "USDC",
    name: "USD Coin",
    identity: {
      kind: "stellar_classic",
      canonicalId: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      assetCode: "USDC",
      issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    },
  },
  scores: {
    buyRisk: 88,
    confidence: 0.92,
  },
  verdict: "avoid",
  summary: "Critical authority modifications detected during follow-up observation.",
  topReasons: [
    "[authority] Freeze authority: enabled and active: critical honeypot risk (impact: 95)",
    "[liquidity] DEX liquidity pool: depth $120k (impact: 35)",
    "[governance] Multi-sig signers: reduced from 3 to 1",
  ],
  evidence: [
    {
      label: "Horizon RPC",
      status: "connected",
      checkedAt: FIXTURE_TARGET_TIME,
      reliability: 0.98,
    },
    {
      label: "Reflector Oracle",
      status: "unavailable",
      checkedAt: FIXTURE_TARGET_TIME,
      reliability: 0.0,
    },
  ],
  missingData: [],
  freshness: {
    generatedAt: FIXTURE_TARGET_TIME,
    sourceCheckedAt: [FIXTURE_TARGET_TIME],
    staleAt: "2026-07-07T02:30:00.000Z",
  },
  expiresAt: FIXTURE_EXPIRES_TIME,
  product: {
    name: "Golden Raccoon",
    version: "0.1.0",
  },
  notices: {
    informationOnly: true,
    providerCorrectnessNotProven: true,
  },
};

export const mockCrossAssetSnapshotDoc: RiskSnapshotDocument = {
  ...mockTargetSnapshotDoc,
  asset: {
    chainFamily: "stellar",
    network: "testnet",
    symbol: "XLM",
    name: "Native Lumen",
    identity: {
      kind: "stellar_native",
      canonicalId: "native:XLM",
      assetCode: "XLM",
    },
  },
};

export const mockCrossNetworkSnapshotDoc: RiskSnapshotDocument = {
  ...mockTargetSnapshotDoc,
  asset: {
    ...mockTargetSnapshotDoc.asset,
    network: "public",
    identity: {
      ...mockTargetSnapshotDoc.asset.identity,
      canonicalId: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    },
  },
};

export const mockEmptySnapshotDoc: RiskSnapshotDocument = {
  ...mockBaseSnapshotDoc,
  topReasons: [],
  evidence: [],
  missingData: [],
};

export const mockAmbiguousSnapshotDoc: RiskSnapshotDocument = {
  ...mockBaseSnapshotDoc,
  topReasons: [
    "[authority] Freeze authority: revocable (impact: 10)",
    "[authority] Freeze authority: admin altered",
  ],
};

/**
 * Generates an immutable, cryptographically valid RiskSnapshotRecord fixture.
 *
 * @param id - Snapshot unique identifier.
 * @param doc - Snapshot document payload.
 * @param overrides - Optional record property overrides.
 * @returns Fully populated and cryptographically verified RiskSnapshotRecord.
 */
export function createFixtureRecord(
  id: string,
  doc: RiskSnapshotDocument,
  overrides: Partial<RiskSnapshotRecord> = {},
): RiskSnapshotRecord {
  const hash = hashRiskSnapshot(doc);
  const identityKey = canonicalAssetIdentity(doc.asset);
  return {
    id,
    schemaVersion: "1",
    canonicalHash: hash,
    identityKey,
    snapshot: doc,
    createdAt: doc.freshness.generatedAt,
    expiresAt: doc.expiresAt,
    revocationTokenHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ...overrides,
  };
}
