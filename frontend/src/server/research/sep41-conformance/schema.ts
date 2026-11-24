import { z } from "zod";
import type { Sep41ConformanceState } from "./errors";
import { SEP41_REFERENCE_VERSION } from "./referenceInterface";

export const SEP41_CONFORMANCE_SCHEMA_VERSION = "sep41-conformance/2026-01" as const;

export const sep41ConformanceRequestSchema = z.object({
  contractId: z.string().trim().min(1, "Contract id is required"),
  network: z.enum(["stellar-testnet", "stellar-pubnet"]).default("stellar-pubnet"),
  /** Optional address used only for the read-only `balance` simulation. */
  balanceId: z.string().trim().optional(),
});

export type Sep41ConformanceRequest = z.infer<typeof sep41ConformanceRequestSchema>;

export type SpecParam = {
  name: string;
  type: string;
};

export type ContractFunctionSpec = {
  name: string;
  inputs: SpecParam[];
  outputs: SpecParam[];
};

export type ContractSpec = {
  contractId: string;
  functions: ContractFunctionSpec[];
  source: "rpc" | "recorded";
};

export type DiffKind = "missing" | "mismatched" | "extra" | "match";

export type InterfaceDiffEntry = {
  name: string;
  kind: DiffKind;
  expectedInputs?: SpecParam[];
  expectedOutputs?: SpecParam[];
  actualInputs?: SpecParam[];
  actualOutputs?: SpecParam[];
  detail: string;
};

export type ReadSimulationEntry = {
  function: "decimals" | "name" | "symbol" | "balance";
  ok: boolean;
  /** Decoded return value when the simulation succeeded. */
  value: string | number | null;
  /** True when the call required no authorization (always expected for this feature). */
  authorizationRequired: boolean;
  error: string | null;
};

export type SampledEvent = {
  id: string;
  ledger: number;
  topicName: string;
  topics: string[];
  dataKind: "i128" | "vec" | "map" | "other" | "empty";
  dataKeys: string[];
  rawSummary: string;
};

export type EventShapeFinding = {
  eventName: string;
  sampleId: string | null;
  ok: boolean;
  /** Topic index or data field that differed, when mismatched. */
  mismatchedField: string | null;
  detail: string;
};

export type FindingKind = "missing" | "mismatched" | "extra" | "simulation" | "event" | "coverage";

export type ConformanceFinding = {
  findingId: string;
  kind: FindingKind;
  subject: string;
  detail: string;
};

export type CoverageNotice = {
  referenceVersion: typeof SEP41_REFERENCE_VERSION;
  reachedProvider: boolean;
  specAvailable: boolean;
  interfaceMatches: number;
  interfaceMissing: number;
  interfaceMismatched: number;
  interfaceExtra: number;
  simulationsOk: number;
  simulationsAttempted: number;
  eventsSampled: number;
  eventShapeFailures: number;
  message: string;
};

export type Sep41ConformanceReport = {
  schemaVersion: typeof SEP41_CONFORMANCE_SCHEMA_VERSION;
  referenceVersion: typeof SEP41_REFERENCE_VERSION;
  contractId: string;
  network: string;
  state: Sep41ConformanceState;
  interfaceDiff: InterfaceDiffEntry[];
  simulations: ReadSimulationEntry[];
  eventSamples: SampledEvent[];
  eventShapes: EventShapeFinding[];
  findings: ConformanceFinding[];
  coverage: CoverageNotice;
  readOnly: true;
  writesState: false;
};
