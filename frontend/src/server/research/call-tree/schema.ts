import { z } from "zod";
import type { CallTreeState } from "./errors";
import { SUPPORTED_CALL_TREE_NETWORKS, type CallTreeNetwork } from "./networkIdentity";

export const callTreeRequestSchema = z.object({
  txHash: z.string().trim().regex(/^[0-9a-fA-F]{64}$/, "Expected 64-char hex transaction hash"),
  network: z.enum(SUPPORTED_CALL_TREE_NETWORKS),
});

export type CallTreeRequest = z.infer<typeof callTreeRequestSchema>;

export type RawArgValue = {
  name?: string;
  type: string;
  value: string;
};

export type RawDiagnosticEvent = {
  kind: "fn_call" | "fn_return" | "fn_error" | "transfer";
  contractId: string;
  functionName?: string;
  args?: RawArgValue[];
  returnValue?: RawArgValue;
  errorMessage?: string;
  transfer?: {
    tokenContractId: string;
    symbol: string;
    from: string;
    to: string;
    amountRaw: string;
  };
};

export type RawInvocationMeta = {
  txHash: string;
  ledger: number;
  diagnosticsEnabled: boolean;
  topLevelCall: {
    contractId: string;
    functionName: string;
    args: RawArgValue[];
    returnValue?: RawArgValue;
    errorMessage?: string;
  };
  events: RawDiagnosticEvent[];
};

export type DecodedArg = {
  name: string;
  type: string;
  displayValue: string;
};

export type TokenTransferMovement = {
  nodeId: string;
  tokenContractId: string;
  symbol: string;
  from: string;
  to: string;
  amountRaw: string;
};

export type CallTreeNode = {
  nodeId: string;
  depth: number;
  order: number;
  contractId: string;
  functionName: string;
  args: DecodedArg[];
  returnValue: DecodedArg | null;
  status: "succeeded" | "failed";
  errorMessage: string | null;
  transfers: TokenTransferMovement[];
  children: CallTreeNode[];
};

export type NetTransferEntry = {
  address: string;
  tokenContractId: string;
  symbol: string;
  netDeltaRaw: string;
};

export type FailureLocation = {
  nodeId: string;
  contractId: string;
  functionName: string;
  depth: number;
  errorMessage: string;
};

export type CoverageNotice = {
  reachedProvider: boolean;
  diagnosticsEnabled: boolean;
  eventsProcessed: number;
  eventsTruncated: boolean;
  message: string;
};

export type CallTreeReport = {
  network: CallTreeNetwork;
  txHash: string;
  ledger: number | null;
  state: CallTreeState;
  diagnosticsEnabled: boolean;
  roots: CallTreeNode[];
  failure: FailureLocation | null;
  transfers: TokenTransferMovement[];
  netMovements: NetTransferEntry[];
  coverage: CoverageNotice;
  warnings: string[];
};
