export { verifyEnsResolution } from "./service";
export { ENS_RESOLUTION_LIMITS } from "./limits";
export { EnsResolutionError, type EnsResolutionErrorKind, type EnsResolutionState } from "./errors";
export {
  ensResolutionRequestSchema,
  type EnsResolutionRequest,
  type EnsResolutionResult,
  type EnsPairClassification,
  type ConfusableFinding,
  type ForwardResolutionStep,
  type ReverseResolutionStep,
  type OwnershipEvidence,
  type CoverageNotice,
} from "./schema";
export { normalizeEnsName } from "./normalize";
export { inspectConfusableLabels } from "./confusables";
export { extractForwardStep } from "./forwardResolver";
export { extractReverseStep } from "./reverseResolver";
export { extractOwnershipEvidence } from "./ownership";
export { classifyEnsResolution } from "./classify";
export type { EnsRegistryReader, RecordedEnsSnapshot } from "./registryReader";
