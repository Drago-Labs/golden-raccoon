import { z } from "zod";
import type { MetamorphicCheckState } from "./errors";

const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const metamorphicCheckRequestSchema = z
  .object({
    walletAddress: evmAddress,
    network: z.string().min(1),
    walletNetwork: z.string().min(1),
    contractAddress: evmAddress,
    blockNumber: z.number().int().nonnegative().optional(),
  })
  .refine((v) => v.network === v.walletNetwork, {
    message: "walletNetwork must match network",
    path: ["walletNetwork"],
  });

export type MetamorphicCheckRequest = z.infer<typeof metamorphicCheckRequestSchema>;

export type CreationEvidence = {
  found: boolean;
  txHash: string | null;
  creationKind: "CREATE" | "CREATE2" | "unknown";
  factoryAddress: string | null;
  salt: string | null;
  initCodeHex: string | null;
  deploymentBlock: number | null;
};

export type OpcodeFindings = {
  hasSelfDestruct: boolean;
  selfDestructOffsets: number[];
  hasDelegateCall: boolean;
  delegateCallOffsets: number[];
};

export type InitCodePatternFindings = {
  externalCodeCopyInInit: boolean;
  dynamicRuntimeLoader: boolean;
};

export type ForkSemantics = {
  network: string;
  eip6780Active: boolean;
  cancunActivationBlock: number | null;
  postCancunSelfDestructRestricted: boolean;
};

export type CodeHashSample = {
  blockNumber: number;
  codeHash: string | null;
};

export type CodeHashComparison = {
  samples: CodeHashSample[];
  historicalCodeChangeDetected: boolean;
};

export type MetamorphicClassification =
  | "redeployable_metamorphic"
  | "post_eip6780_mitigated"
  | "ordinary_immutable_creation"
  | "inconclusive";

export type CoverageNotice = {
  reachedProvider: boolean;
  creationTxFound: boolean;
  runtimeBytecodeRead: boolean;
  codeHashSamplesRead: number;
};

export type MetamorphicCheckResult = {
  network: string;
  contractAddress: string;
  state: MetamorphicCheckState;
  classification: MetamorphicClassification;
  creation: CreationEvidence;
  opcodes: OpcodeFindings;
  initCodePatterns: InitCodePatternFindings;
  forkRules: ForkSemantics;
  codeHashHistory: CodeHashComparison;
  coverage: CoverageNotice;
  warnings: string[];
};
