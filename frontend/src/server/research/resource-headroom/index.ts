export { compareResourceHeadroom, type ResourceHeadroomDeps } from "./service";
export { RESOURCE_HEADROOM_LIMITS } from "./limits";
export {
  ResourceHeadroomError,
  type ResourceHeadroomErrorKind,
  type ResourceHeadroomState,
} from "./errors";
export {
  SUPPORTED_HEADROOM_NETWORKS,
  isSupportedHeadroomNetwork,
  assertSameLimitNetwork,
  type HeadroomNetwork,
} from "./networkIdentity";
export {
  resourceHeadroomRequestSchema,
  type ResourceHeadroomRequest,
  type ResourceKey,
  type RawResourceMetrics,
  type RawInvocationSample,
  type NetworkLimitSet,
  type ResourceHeadroomItem,
  type CoverageNotice,
  type ResourceHeadroomReport,
} from "./schema";
export { validateInvocationInput } from "./invocationInput";
export { extractResourceMap, RESOURCE_DEFINITIONS } from "./resourceExtraction";
export { DEFAULT_NETWORK_LIMITS, type NetworkLimitsProvider } from "./networkLimits";
export { computeResourceHeadroom } from "./headroom";
export { buildHeadroomCoverage } from "./coverage";
export type { SimulationProvider } from "./simulationReader";
export type { HistoricalUsageProvider } from "./historicalUsage";
