import { z } from "zod";
import type { ResourceHeadroomState } from "./errors";
import { RESOURCE_HEADROOM_LIMITS } from "./limits";
import { SUPPORTED_HEADROOM_NETWORKS, type HeadroomNetwork } from "./networkIdentity";

export const resourceHeadroomRequestSchema = z.object({
  mode: z.enum(["simulation", "historical"]),
  contractId: z.string().trim().optional(),
  functionName: z.string().trim().optional(),
  args: z.array(z.string()).max(RESOURCE_HEADROOM_LIMITS.maxArgs).default([]),
  txHash: z.string().trim().optional(),
  warningThresholdPct: z
    .number()
    .min(1)
    .max(100)
    .default(RESOURCE_HEADROOM_LIMITS.defaultWarningThresholdPct),
  network: z.enum(SUPPORTED_HEADROOM_NETWORKS),
});

export type ResourceHeadroomRequest = z.infer<typeof resourceHeadroomRequestSchema>;

export type ResourceKey =
  | "instructions"
  | "memoryBytes"
  | "readEntries"
  | "writeEntries"
  | "readBytes"
  | "writeBytes"
  | "txSizeBytes";

export type RawResourceMetrics = {
  instructions: number;
  memoryBytes: number;
  readEntries: number;
  writeEntries: number;
  readBytes: number;
  writeBytes: number;
  eventsSizeBytes: number;
  txSizeBytes: number;
};

export type RawInvocationSample = {
  network: HeadroomNetwork;
  ledger: number;
  failed: boolean;
  errorMessage: string | null;
  diagnosticEvents: string[];
  metrics: RawResourceMetrics | null;
};

export type NetworkLimitSet = {
  network: HeadroomNetwork;
  ledger: number;
  limits: Record<ResourceKey, number>;
};

export type ResourceHeadroomItem = {
  key: ResourceKey;
  label: string;
  unit: string;
  used: number;
  limit: number;
  fractionDisplay: string;
  utilizationPct: number;
  headroomRemaining: number;
  headroomPct: number;
  flagged: boolean;
};

export type CoverageNotice = {
  reachedProvider: boolean;
  mode: "simulation" | "historical";
  invocationLedger: number | null;
  limitsLedger: number | null;
  simulationFailed: boolean;
  message: string;
};

export type ResourceHeadroomReport = {
  network: HeadroomNetwork;
  mode: "simulation" | "historical";
  state: ResourceHeadroomState;
  warningThresholdPct: number;
  invocationLedger: number | null;
  limitsLedger: number | null;
  simulationFailed: boolean;
  failureMessage: string | null;
  diagnosticEvents: string[];
  resources: ResourceHeadroomItem[];
  flaggedResources: ResourceHeadroomItem[];
  coverage: CoverageNotice;
  warnings: string[];
};
