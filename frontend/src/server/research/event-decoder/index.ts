export { decodeContractEvents, type EventDecoderDeps } from "./service";
export { EVENT_DECODER_LIMITS } from "./limits";
export {
  EventDecoderError,
  type EventDecoderErrorKind,
  type EventDecoderState,
} from "./errors";
export {
  SUPPORTED_EVENT_NETWORKS,
  isSupportedEventNetwork,
  type EventDecoderNetwork,
} from "./networkIdentity";
export {
  eventDecoderRequestSchema,
  type EventDecoderRequest,
  type RawScVal,
  type RawContractEvent,
  type RawEventWindowResponse,
  type SpecFieldDef,
  type ContractEventSpecDef,
  type DecodedField,
  type DecodedContractEvent,
  type RetentionAssessment,
  type CoverageNotice,
  type EventDecoderReport,
} from "./schema";
export { decode128Parts, decodeScVal } from "./scvalDecoder";
export { paginateAndDeduplicateEvents, type ContractEventProvider } from "./eventReader";
export { matchEventAgainstSpecs, type EventMatchResult } from "./eventMatcher";
export { assessRetentionWindow } from "./retention";
export { formatDecodedContractEvent } from "./displayFormat";
export { buildEventDecoderCoverage } from "./coverage";
export type { ContractSpecProvider } from "./specReader";
