import { z } from "zod";
import { ENS_RESOLUTION_LIMITS } from "./limits";
import type { EnsResolutionState } from "./errors";

const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const ensResolutionRequestSchema = z
  .object({
    walletAddress: evmAddress,
    network: z.string().min(1),
    walletNetwork: z.string().min(1),
    ensName: z.string().min(3).max(ENS_RESOLUTION_LIMITS.maxNameLength).optional(),
    targetAddress: evmAddress.optional(),
  })
  .refine((v) => v.network === v.walletNetwork, {
    message: "walletNetwork must match network",
    path: ["walletNetwork"],
  })
  .refine((v) => Boolean(v.ensName || v.targetAddress), {
    message: "Either ensName or targetAddress must be supplied",
    path: ["ensName"],
  });

export type EnsResolutionRequest = z.infer<typeof ensResolutionRequestSchema>;

export type ConfusableFinding = {
  label: string;
  mixedScripts: boolean;
  zeroWidthCharacters: boolean;
  flaggedCharacters: Array<{ char: string; codePointHex: string; script: string }>;
};

export type ForwardResolutionStep = {
  normalizedName: string;
  registryResolver: string | null;
  forwardAddress: string | null;
  blockNumber: number;
};

export type ReverseResolutionStep = {
  queriedAddress: string | null;
  reverseName: string | null;
  reverseForwardAddress: string | null;
  blockNumber: number;
};

export type OwnershipEvidence = {
  registrant: string | null;
  controller: string | null;
  nameWrapperWrapped: boolean;
  expiresAtTimestamp: number | null;
  expiredAtRecordedTime: boolean;
};

export type EnsPairClassification =
  | "verified"
  | "forward_only"
  | "reverse_only"
  | "mismatched"
  | "expired"
  | "unresolved";

export type CoverageNotice = {
  reachedProvider: boolean;
  recordedBlock: number | null;
  forwardResolved: boolean;
  reverseResolved: boolean;
  ownershipRead: boolean;
};

export type EnsResolutionResult = {
  network: string;
  state: EnsResolutionState;
  classification: EnsPairClassification;
  normalizedName: string | null;
  confusables: ConfusableFinding;
  forward: ForwardResolutionStep;
  reverse: ReverseResolutionStep;
  ownership: OwnershipEvidence;
  coverage: CoverageNotice;
  warnings: string[];
};
