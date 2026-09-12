/**
 * Versioned contract for the shared-exposure map.
 *
 * The map answers "how much of this portfolio ultimately depends on the same
 * issuer, protocol or underlying asset?" It refuses to guess: a relationship
 * exists only if the caller declared it with a provenance tag, and a matching
 * symbol is never treated as evidence of common ownership.
 */
import { z } from "zod";

export const EXPOSURE_MAP_SCHEMA_VERSION = "exposure-map/2026-01" as const;

export const EXPOSURE_LIMITS = {
  maxHoldings: 500,
  maxRelationships: 1_000,
  /** Longest chain of look-through edges followed from a single holding. */
  maxTraversalDepth: 8,
  maxNodes: 2_000,
  maxRequestBytes: 512_000,
  /** Values are held as integer micro-USD to keep grouping decimal-safe. */
  microUsdScale: 1_000_000,
} as const;

export type RelationshipKind = "issuer" | "protocol" | "underlying";

/**
 * Where a declared relationship came from. There is deliberately no
 * `inferred` member: this feature does not manufacture relationships.
 */
export type RelationshipProvenance =
  | "issuer_disclosure"
  | "protocol_documentation"
  | "onchain_metadata"
  | "operator_declared";

export type ExposureNodeKind = "holding" | "issuer" | "protocol" | "underlying";

export type ExposureNode = {
  /** Network-scoped canonical key. Never collapses across chains. */
  id: string;
  kind: ExposureNodeKind;
  label: string;
  network: string | null;
  /** Direct holding value in micro-USD, zero for non-holding nodes. */
  directMicroUsd: number;
  /** Direct plus look-through value attributed to this node, in micro-USD. */
  totalMicroUsd: number;
  /** Holding ids that reach this node, each counted at most once. */
  contributingHoldings: string[];
  /** True when the node's value could not be fully determined. */
  valueIncomplete: boolean;
};

export type ExposureEdge = {
  from: string;
  to: string;
  kind: RelationshipKind;
  provenance: RelationshipProvenance;
  observedAt: string | null;
  /**
   * `dropped_cycle` edges are retained for display but excluded from
   * attribution, so a cycle can never inflate a total.
   */
  status: "applied" | "dropped_cycle" | "dropped_depth" | "dropped_duplicate";
  note: string;
};

export type ExposureGroup = {
  nodeId: string;
  kind: Exclude<ExposureNodeKind, "holding">;
  label: string;
  network: string | null;
  directMicroUsd: number;
  lookThroughMicroUsd: number;
  totalMicroUsd: number;
  /** Share of the *known-value* base, not of an assumed portfolio total. */
  sharePercentOfKnownValue: number | null;
  holdingCount: number;
  contributingHoldings: string[];
  provenances: RelationshipProvenance[];
  earliestObservedAt: string | null;
  latestObservedAt: string | null;
};

export type UnresolvedHolding = {
  holdingId: string;
  symbol: string;
  reason: "no_declared_relationship" | "unpriced" | "both";
  valueMicroUsd: number | null;
  detail: string;
};

export type ExposureCoverage = {
  state: "complete" | "partial" | "empty";
  holdingCount: number;
  pricedHoldingCount: number;
  unpricedHoldingCount: number;
  /** Total of holdings that carry a usable price, in micro-USD. */
  knownValueMicroUsd: number;
  /** Holdings with a price but no declared relationship. */
  unmappedHoldingCount: number;
  unmappedValueMicroUsd: number;
  droppedEdgeCount: number;
  cycleCount: number;
  /** Groups whose membership overlaps another group's membership. */
  overlappingGroupCount: number;
  note: string;
};

export type ExposureMap = {
  schemaVersion: typeof EXPOSURE_MAP_SCHEMA_VERSION;
  walletAddress: string;
  network: string;
  observedAt: string;
  nodes: ExposureNode[];
  edges: ExposureEdge[];
  groups: ExposureGroup[];
  unresolved: UnresolvedHolding[];
  coverage: ExposureCoverage;
};

const holdingSchema = z.object({
  symbol: z.string().trim().min(1).max(64),
  name: z.string().trim().max(160).optional(),
  chainId: z.string().trim().min(1).max(80),
  assetKind: z.string().trim().max(32).optional(),
  issuer: z.string().trim().max(120).optional(),
  contractId: z.string().trim().max(120).optional(),
  tokenAddress: z.string().trim().max(120).optional(),
  balance: z.number().finite().nonnegative(),
  priceUsd: z.number().finite().nonnegative().nullable(),
  valueUsd: z.number().finite().nonnegative(),
  priceStatus: z.enum(["priced", "unavailable"]).optional(),
});

/**
 * A relationship the caller vouches for. `provenance` is mandatory: without a
 * stated source there is no relationship to record.
 */
const relationshipSchema = z.object({
  /** Holding or node key this edge starts from, matched case-insensitively. */
  fromAssetKey: z.string().trim().min(1).max(200),
  kind: z.enum(["issuer", "protocol", "underlying"]),
  targetLabel: z.string().trim().min(1).max(160),
  /** Network the target lives on; defaults to the source holding's network. */
  targetNetwork: z.string().trim().max(80).optional(),
  provenance: z.enum(["issuer_disclosure", "protocol_documentation", "onchain_metadata", "operator_declared"]),
  observedAt: z.string().datetime({ offset: true }).optional(),
});

export const exposureRequestSchema = z.object({
  walletAddress: z.string().trim().min(1).max(120),
  network: z.string().trim().min(1).max(80),
  holdings: z.array(holdingSchema).max(EXPOSURE_LIMITS.maxHoldings),
  relationships: z.array(relationshipSchema).max(EXPOSURE_LIMITS.maxRelationships).default([]),
  observedAt: z.string().datetime({ offset: true }).optional(),
});

export type ExposureRequest = z.infer<typeof exposureRequestSchema>;
export type ExposureHoldingInput = z.infer<typeof holdingSchema>;
export type ExposureRelationshipInput = z.infer<typeof relationshipSchema>;

export class ExposureMapError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ExposureMapError";
    this.code = code;
    this.details = details;
  }
}

/** Converts a USD amount to integer micro-USD, avoiding float drift. */
export function toMicroUsd(value: number): number {
  return Math.round(value * EXPOSURE_LIMITS.microUsdScale);
}

export function fromMicroUsd(value: number): number {
  return value / EXPOSURE_LIMITS.microUsdScale;
}
