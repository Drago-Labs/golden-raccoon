/**
 * Public entry for the Horizon / Stellar RPC consistency check.
 *
 * Callers outside this feature import this module. The probes, classifier,
 * and normaliser stay internal so a page cannot skip the ledger rules.
 */
export { RpcConsistencyError, isRpcConsistencyError } from "./errors";
export type { ConsistencyErrorCode, ProviderState } from "./errors";
export { CONSISTENCY_LIMITS } from "./limits";
export { compareRpcConsistency } from "./service";
export type { ConsistencyDependencies } from "./service";
export {
  CONSISTENCY_SCHEMA_VERSION,
  consistencyRequestSchema,
} from "./schema";
export type {
  ConsistencyReport,
  ConsistencyRequest,
  CoverageNotice,
  FieldComparison,
  FieldClassification,
  LagSummary,
  NetworkId,
  ProviderStatus,
} from "./schema";
