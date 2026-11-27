import { z } from "zod";
import type { InvocationProfileState } from "./errors";

export const INVOCATION_PROFILE_SCHEMA_VERSION = 1;

export const invocationProfileRequestSchema = z.object({
  contractId: z.string().min(1),
  network: z.enum(["stellar-testnet", "stellar-pubnet"]),
  windowStart: z.number().int().positive(),
  windowEnd: z.number().int().positive(),
});

export type InvocationProfileRequest = z.infer<typeof invocationProfileRequestSchema>;

/** One recorded or reconstructed invocation against the target contract. */
export type RawInvocation = {
  txHash: string;
  ledger: number;
  day: string;
  functionName: string;
  success: boolean;
  /** Immediate caller of the target (account G… or intermediary C…). */
  directCaller: string;
  /** Account that originated the transaction. */
  originatingAccount: string;
  /** Contract that relayed the call, when nested. */
  intermediary: string | null;
};

export type AttributedInvocation = RawInvocation & {
  callerKind: "direct_account" | "via_contract";
};

export type FunctionAggregate = {
  functionName: string;
  successCount: number;
  failureCount: number;
  uniqueCallers: number;
  directCallers: number;
  viaContractCallers: number;
};

export type CallerAggregate = {
  account: string;
  successCount: number;
  failureCount: number;
  functionNames: string[];
  directCount: number;
  viaContractCount: number;
  intermediaries: string[];
};

export type DailyPoint = {
  day: string;
  successCount: number;
  failureCount: number;
  uniqueCallers: number;
};

export type ConcentrationMetrics = {
  callerCount: number;
  totalInvocations: number;
  topCallerShare: number;
  topCallerAccount: string | null;
  herfindahl: number;
};

export type CohortSummary = {
  newCallers: number;
  returningCallers: number;
  newCallerAccounts: string[];
  returningCallerAccounts: string[];
};

export type CoverageGap = {
  fromLedger: number;
  toLedger: number;
  reason: "truncated" | "provider_gap";
};

export type InvocationProfileReport = {
  schemaVersion: number;
  contractId: string;
  network: string;
  windowStart: number;
  windowEnd: number;
  state: InvocationProfileState;
  functions: FunctionAggregate[];
  callers: CallerAggregate[];
  daily: DailyPoint[];
  concentration: ConcentrationMetrics;
  cohorts: CohortSummary;
  coverageGaps: CoverageGap[];
  coverageNotice: string;
  sampledInvocationCount: number;
  readOnly: boolean;
};
