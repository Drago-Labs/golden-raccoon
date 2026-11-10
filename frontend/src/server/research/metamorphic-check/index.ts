export { inspectMetamorphicContract } from "./service";
export { METAMORPHIC_CHECK_LIMITS } from "./limits";
export { MetamorphicCheckError, type MetamorphicCheckErrorKind, type MetamorphicCheckState } from "./errors";
export {
  metamorphicCheckRequestSchema,
  type MetamorphicCheckRequest,
  type MetamorphicCheckResult,
  type MetamorphicClassification,
  type CreationEvidence,
  type OpcodeFindings,
  type InitCodePatternFindings,
  type ForkSemantics,
  type CodeHashSample,
  type CodeHashComparison,
  type CoverageNotice,
} from "./schema";
export { isCreate2Deployment } from "./create2";
export { scanRuntimeBytecode } from "./opcodeScanner";
export { analyzeInitCode } from "./initCodePatterns";
export { evaluateForkRules } from "./forkRules";
export { compareCodeHashes } from "./codeHashHistory";
export type { MetamorphicChainReader, RecordedContractEvidence } from "./creationReader";
