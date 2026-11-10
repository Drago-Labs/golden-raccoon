import { z } from "zod";
import type { EvmTimelockState } from "./errors";

const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const evmTimelockRequestSchema = z
  .object({
    walletAddress: evmAddress,
    network: z.string().min(1),
    walletNetwork: z.string().min(1),
    timelockAddress: evmAddress,
    fromBlock: z.number().int().nonnegative().optional(),
    toBlock: z.number().int().nonnegative().optional(),
  })
  .refine((v) => v.network === v.walletNetwork, {
    message: "walletNetwork must match network",
    path: ["walletNetwork"],
  });

export type EvmTimelockRequest = z.infer<typeof evmTimelockRequestSchema>;

export type TimelockEventLog =
  | {
      kind: "CallScheduled";
      operationId: string;
      index: number;
      target: string;
      valueWei: string;
      data: string;
      predecessor: string;
      delaySeconds: number;
      scheduledAtTimestamp: number;
      blockNumber: number;
    }
  | {
      kind: "CallExecuted";
      operationId: string;
      index: number;
      blockNumber: number;
      executedAtTimestamp: number;
    }
  | {
      kind: "Cancelled";
      operationId: string;
      blockNumber: number;
      cancelledAtTimestamp: number;
    }
  | {
      kind: "MinDelayChange";
      oldDurationSeconds: number;
      newDurationSeconds: number;
      blockNumber: number;
    };

export type DecodedTimelockCall = {
  index: number;
  target: string;
  valueWei: string;
  rawData: string;
  selector: string | null;
  functionName: string | null;
  args: string[] | null;
  decoded: boolean;
};

export type TimelockOperationStatus = "pending" | "ready" | "done" | "cancelled";

export type TimelockOperation = {
  operationId: string;
  status: TimelockOperationStatus;
  scheduledAtTimestamp: number;
  readyAtTimestamp: number;
  delaySeconds: number;
  predecessor: string;
  calls: DecodedTimelockCall[];
};

export type RoleHolder = {
  address: string;
  isContract: boolean;
};

export type TimelockRoleSummary = {
  proposers: RoleHolder[];
  executors: RoleHolder[];
  cancellers: RoleHolder[];
  admins: RoleHolder[];
  openExecutor: boolean;
  eoaAdmins: string[];
};

export type CoverageNotice = {
  reachedProvider: boolean;
  recordedBlock: number | null;
  recordedTimestamp: number | null;
  eventsRead: number;
  operationsGrouped: number;
  callsDecoded: number;
  callsTotal: number;
};

export type EvmTimelockResult = {
  network: string;
  timelockAddress: string;
  recordedBlock: number | null;
  recordedTimestamp: number | null;
  minDelaySeconds: number | null;
  state: EvmTimelockState;
  operations: TimelockOperation[];
  roles: TimelockRoleSummary;
  coverage: CoverageNotice;
  warnings: string[];
};
