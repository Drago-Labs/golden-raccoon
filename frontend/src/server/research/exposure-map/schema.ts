import { z } from "zod";

export const ExposureNodeTypeSchema = z.enum(["holding", "issuer", "protocol", "underlying"]);
export type ExposureNodeType = z.infer<typeof ExposureNodeTypeSchema>;

export const ExposureEdgeRelationshipSchema = z.enum([
  "issued_by",
  "managed_by",
  "backed_by",
  "derives_from",
]);
export type ExposureEdgeRelationship = z.infer<typeof ExposureEdgeRelationshipSchema>;

export const RelationshipProvenanceSourceSchema = z.enum([
  "curated_registry",
  "verified_manifest",
  "onchain_attestation",
  "user_declared",
]);
export type RelationshipProvenanceSource = z.infer<typeof RelationshipProvenanceSourceSchema>;

export const RelationshipProvenanceSchema = z.object({
  source: RelationshipProvenanceSourceSchema,
  confidence: z.number().min(0).max(1),
  declaredAt: z.string(),
  verified: z.boolean(),
  referenceUri: z.string().optional(),
});
export type RelationshipProvenance = z.infer<typeof RelationshipProvenanceSchema>;

export const RelationshipDeclarationSchema = z.object({
  sourceAssetKey: z.string().min(1),
  targetType: z.enum(["issuer", "protocol", "underlying"]),
  targetId: z.string().min(1),
  targetName: z.string().min(1),
  relationship: ExposureEdgeRelationshipSchema,
  weight: z.number().gt(0).lte(1).default(1.0),
  category: z.string().optional(),
  provenance: RelationshipProvenanceSchema,
});
export type RelationshipDeclaration = z.infer<typeof RelationshipDeclarationSchema>;

export const AdaptedHoldingSchema = z.object({
  assetKey: z.string().min(1),
  symbol: z.string(),
  name: z.string(),
  chainFamily: z.enum(["evm", "stellar", "other"]),
  network: z.string(),
  tokenAddress: z.string(),
  issuer: z.string().optional(),
  contractId: z.string().optional(),
  balance: z.number().nonnegative(),
  priceUsd: z.number().nullable(),
  priceStatus: z.enum(["priced", "unavailable"]),
  valueUsd: z.number().nonnegative(),
  allocationPercent: z.number().nonnegative(),
});
export type AdaptedHolding = z.infer<typeof AdaptedHoldingSchema>;

export const ExposureGraphNodeSchema = z.object({
  id: z.string().min(1),
  type: ExposureNodeTypeSchema,
  name: z.string(),
  symbol: z.string().optional(),
  network: z.string().optional(),
  chainFamily: z.string().optional(),
  directValueUsd: z.number().nonnegative(),
  lookThroughValueUsd: z.number().nonnegative(),
  totalExposureUsd: z.number().nonnegative(),
  portfolioSharePercent: z.number().nonnegative(),
  holdingCount: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ExposureGraphNode = z.infer<typeof ExposureGraphNodeSchema>;

export const ExposureGraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  relationship: ExposureEdgeRelationshipSchema,
  weight: z.number().gt(0).lte(1),
  provenance: RelationshipProvenanceSchema,
});
export type ExposureGraphEdge = z.infer<typeof ExposureGraphEdgeSchema>;

export const DetectedCycleSchema = z.object({
  path: z.array(z.string()),
  severedEdge: z.string(),
  reason: z.string(),
});
export type DetectedCycle = z.infer<typeof DetectedCycleSchema>;

export const SourceHoldingAllocationSchema = z.object({
  assetKey: z.string(),
  symbol: z.string(),
  network: z.string(),
  allocatedUsd: z.number().nonnegative(),
  lookThrough: z.boolean(),
});
export type SourceHoldingAllocation = z.infer<typeof SourceHoldingAllocationSchema>;

export const GroupedExposureItemSchema = z.object({
  entityId: z.string(),
  entityType: z.enum(["issuer", "protocol", "underlying"]),
  name: z.string(),
  category: z.string().optional(),
  exposureUsd: z.number().nonnegative(),
  directValueUsd: z.number().nonnegative(),
  lookThroughValueUsd: z.number().nonnegative(),
  portfolioSharePercent: z.number().nonnegative(),
  holdingCount: z.number().int().nonnegative(),
  distinctChains: z.array(z.string()),
  sourceHoldings: z.array(SourceHoldingAllocationSchema),
});
export type GroupedExposureItem = z.infer<typeof GroupedExposureItemSchema>;

export const ConcentrationMetricsSchema = z.object({
  hhi: z.number().nonnegative(),
  classification: z.enum(["well_diversified", "moderate_concentration", "high_concentration"]),
  topEntitySharePercent: z.number().nonnegative(),
  topEntityName: z.string().optional(),
  top3SharePercent: z.number().nonnegative(),
  dominantEntities: z.array(z.string()),
});
export type ConcentrationMetrics = z.infer<typeof ConcentrationMetricsSchema>;

export const UnpricedHoldingNoticeSchema = z.object({
  assetKey: z.string(),
  symbol: z.string(),
  network: z.string(),
  balance: z.number().nonnegative(),
});
export type UnpricedHoldingNotice = z.infer<typeof UnpricedHoldingNoticeSchema>;

export const UnresolvedHoldingNoticeSchema = z.object({
  assetKey: z.string(),
  symbol: z.string(),
  network: z.string(),
  valueUsd: z.number().nonnegative(),
  priceStatus: z.string(),
});
export type UnresolvedHoldingNotice = z.infer<typeof UnresolvedHoldingNoticeSchema>;

export const OverlappingCategorySchema = z.object({
  entityId: z.string(),
  name: z.string(),
  roles: z.array(z.string()),
});
export type OverlappingCategory = z.infer<typeof OverlappingCategorySchema>;

export const CoverageGapsSchema = z.object({
  totalHoldingsCount: z.number().int().nonnegative(),
  resolvedHoldingsCount: z.number().int().nonnegative(),
  unresolvedHoldingsCount: z.number().int().nonnegative(),
  pricedHoldingsCount: z.number().int().nonnegative(),
  unpricedHoldingsCount: z.number().int().nonnegative(),
  totalPortfolioValueUsd: z.number().nonnegative(),
  knownValueCoverageRatio: z.number().min(0).max(1),
  coverageStatus: z.enum(["complete", "partial", "unavailable"]),
  observationTimestamp: z.string(),
  unpricedHoldings: z.array(UnpricedHoldingNoticeSchema),
  unresolvedHoldings: z.array(UnresolvedHoldingNoticeSchema),
  overlappingCategories: z.array(OverlappingCategorySchema),
});
export type CoverageGaps = z.infer<typeof CoverageGapsSchema>;

export const ExposureMapResultSchema = z.object({
  walletAddress: z.string(),
  network: z.string(),
  nodes: z.array(ExposureGraphNodeSchema),
  edges: z.array(ExposureGraphEdgeSchema),
  cycles: z.array(DetectedCycleSchema),
  groupedExposures: z.object({
    byIssuer: z.array(GroupedExposureItemSchema),
    byProtocol: z.array(GroupedExposureItemSchema),
    byUnderlying: z.array(GroupedExposureItemSchema),
  }),
  concentration: ConcentrationMetricsSchema,
  coverage: CoverageGapsSchema,
  adaptedHoldings: z.array(AdaptedHoldingSchema),
  evaluatedAt: z.string(),
});
export type ExposureMapResult = z.infer<typeof ExposureMapResultSchema>;

export const ExposureMapRequestSchema = z.object({
  walletAddress: z.string().optional(),
  chain: z.string().optional(),
  customRelationships: z.array(RelationshipDeclarationSchema).optional(),
});
export type ExposureMapRequest = z.infer<typeof ExposureMapRequestSchema>;
